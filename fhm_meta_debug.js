/**
 * Decode FHM2D inflated meta (meta.bin from export access) or a full OB fhm2d file
 * into JSON matching the project's *_structure.json shape (see src-tauri/src/format/fhm2d.rs).
 *
 * SubFileStructure: full unknown fields (i32 LE at each offset; unk1/unk2 stay hex strings like Rust JSON):
 * - Item (0x00), 0x19 bytes: +0x00 type, unk1 +0x01, fileIndex +0x05, unk2 +0x09, unk2_1 +0x0d, unk3 +0x11, unk4 +0x15.
 * - Folder (0x0a), 0x21 bytes: +0x00 type, unk1 +0x01, folderCount +0x05, unk2 +0x09, unk2_1 +0x0d, unk3 +0x11,
 *   unk4 +0x15, unk5 +0x19, unk6 +0x1d. All i32 fields use readInt32LE (same as Rust read_i32_le).
 *
 * Usage:
 *   node fhm_meta_debug.js --input <path/to/meta.bin>
 *   node fhm_meta_debug.js <path/to/meta.bin>
 *   node fhm_meta_debug.js --input <path> --output <path/to/out.json>
 *
 * Default output file: fhm_meta_debug.json (current working directory).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const MAGIC_OB = Buffer.from([0xb9, 0xb7, 0xb2, 0xcd]);
const MAGIC_GVS = Buffer.from([0x99, 0x92, 0xcd, 0x90]);
const PAGE_SIZE = 0x10000;

function readU32Le(buf, off) {
  return buf.readUInt32LE(off);
}

function readI32Le(buf, off) {
  return buf.readInt32LE(off);
}

function hexString(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function writeHex4ToBuffer(hex8, buf, offset) {
  const b = Buffer.from(hex8, "hex");
  if (b.length !== 4) {
    throw new Error(`writeHex4ToBuffer: expected 8 hex chars, got length ${hex8.length}`);
  }
  b.copy(buf, offset);
}

function assertFolderRecordRoundTrip(record, rawSlice) {
  const buf = Buffer.alloc(0x21);
  buf[0] = 0x0a;
  writeHex4ToBuffer(record.unk1, buf, 1);
  buf.writeInt32LE(record.folderCount, 5);
  writeHex4ToBuffer(record.unk2, buf, 9);
  buf.writeInt32LE(record.unk2_1, 0x0d);
  buf.writeInt32LE(record.unk3, 0x11);
  buf.writeInt32LE(record.unk4, 0x15);
  buf.writeInt32LE(record.unk5, 0x19);
  buf.writeInt32LE(record.unk6, 0x1d);
  const raw = Buffer.from(rawSlice);
  if (!buf.equals(raw)) {
    throw new Error(
      `Folder SubFileStructure round-trip mismatch:\n  rebuilt ${buf.toString("hex")}\n  actual  ${raw.toString("hex")}`,
    );
  }
}

function assertItemRecordRoundTrip(record, rawSlice) {
  const buf = Buffer.alloc(0x19);
  buf[0] = 0x00;
  writeHex4ToBuffer(record.unk1, buf, 1);
  buf.writeInt32LE(record.fileIndex, 5);
  writeHex4ToBuffer(record.unk2, buf, 9);
  buf.writeInt32LE(record.unk2_1, 0x0d);
  buf.writeInt32LE(record.unk3, 0x11);
  buf.writeInt32LE(record.unk4, 0x15);
  const raw = Buffer.from(rawSlice);
  if (!buf.equals(raw)) {
    throw new Error(
      `Item SubFileStructure round-trip mismatch:\n  rebuilt ${buf.toString("hex")}\n  actual  ${raw.toString("hex")}`,
    );
  }
}

function getFileType(fileType) {
  switch (fileType) {
    case 0x0a:
      return ".nushdb";
    case 0x0b:
      return ".nutexb";
    case 0x0c:
      return ".nusktb";
    case 0x0d:
      return ".numatb";
    case 0x0e:
      return ".numshb";
    case 0x0f:
      return ".numdlb";
    case 0x13:
      return ".nuhlpb";
    case 0x14:
      return ".nus3bank";
    case 0x17:
      return ".nudnbb";
    case 0x18:
      return ".nufxlb";
    case 0x19:
      return ".nurpdb";
    default:
      return ".bin";
  }
}

function buildTypeList(entries) {
  const out = [];
  for (const e of entries) {
    const ext = getFileType(e.fileType);
    for (let i = 0; i < e.fileCount; i++) {
      out.push(ext);
    }
  }
  return out;
}

function parseFileTypeEntries(meta, count) {
  const base = 0x24;
  const out = [];
  for (let i = 0; i < count; i++) {
    const o = base + i * 0x20;
    out.push({
      fileType: readU32Le(meta, o),
      fileCount: readU32Le(meta, o + 0x1c),
    });
  }
  return out;
}

/**
 * SubEntryHeader layout (binrw, little-endian) — total 0x2c bytes before bitmap.
 */
function readSubEntryHeader(meta, offset) {
  const v = meta.subarray(offset);
  if (v.length < 0x2c) {
    throw new Error(`Sub entry header out of range at offset 0x${offset.toString(16)}`);
  }
  return {
    fileSize: readU32Le(v, 8),
    chunkCount: readU32Le(v, 28),
    startOffset: readU32Le(v, 32),
    fileIndex: readI32Le(v, 40),
  };
}

/**
 * Returns bytes consumed in meta for this sub-entry (matches fhm2d.rs parse_sub_entry).
 */
function computeSubEntryMetaUsedLen(header, bitmapLen) {
  const chunkCount = header.chunkCount >>> 0;
  if (chunkCount === 0) {
    return 0x2c;
  }
  return 0x2c + bitmapLen + chunkCount * 8;
}

function parseSubFileStructure(data) {
  const out = [];
  let cursor = 0;
  while (cursor < data.length) {
    const ty = data[cursor];
    if (ty === 0x0a) {
      if (cursor + 0x21 > data.length) {
        throw new Error("Folder entry out of range");
      }
      const rawSlice = data.subarray(cursor, cursor + 0x21);
      const folder = {
        type: "Folder",
        unk1: hexString(data.subarray(cursor + 1, cursor + 5)),
        folderCount: readI32Le(data, cursor + 5),
        unk2: hexString(data.subarray(cursor + 9, cursor + 0xd)),
        unk2_1: readI32Le(data, cursor + 0x0d),
        unk3: readI32Le(data, cursor + 0x11),
        unk4: readI32Le(data, cursor + 0x15),
        unk5: readI32Le(data, cursor + 0x19),
        unk6: readI32Le(data, cursor + 0x1d),
        fileIndex: undefined,
        endMarkCount: undefined,
        originalFileIndex: undefined,
        Name: undefined,
        rawRecordHex: hexString(rawSlice),
      };
      assertFolderRecordRoundTrip(folder, rawSlice);
      out.push(folder);
      cursor += 0x21;
    } else if (ty === 0x00) {
      if (cursor + 0x19 > data.length) {
        throw new Error("Item entry out of range");
      }
      const fileIndex = readI32Le(data, cursor + 5);
      const rawSlice = data.subarray(cursor, cursor + 0x19);
      const item = {
        type: "Item",
        unk1: hexString(data.subarray(cursor + 1, cursor + 5)),
        fileIndex,
        unk2: hexString(data.subarray(cursor + 9, cursor + 0xd)),
        unk2_1: readI32Le(data, cursor + 0x0d),
        unk3: readI32Le(data, cursor + 0x11),
        unk4: readI32Le(data, cursor + 0x15),
        folderCount: undefined,
        endMarkCount: undefined,
        originalFileIndex: fileIndex,
        Name: undefined,
        rawRecordHex: hexString(rawSlice),
      };
      assertItemRecordRoundTrip(item, rawSlice);
      out.push(item);
      cursor += 0x19;
    } else if (ty === 0x0b) {
      let count = 0;
      while (cursor < data.length && data[cursor] === 0x0b) {
        count += 1;
        cursor += 1;
      }
      out.push({
        type: "EndMark",
        unk1: undefined,
        folderCount: undefined,
        fileIndex: undefined,
        endMarkCount: count,
        unk2: undefined,
        unk3: undefined,
        originalFileIndex: undefined,
        Name: undefined,
      });
    } else {
      throw new Error(`Unsupported SubFileStructure type: 0x${ty.toString(16)}`);
    }
  }
  return out;
}

function buildParseTree(entries) {
  const folderCounter = [0];
  const tokens = [];
  for (const entry of entries) {
    if (entry.type === "Folder") {
      const idx = folderCounter.length - 1;
      const name = String(folderCounter[idx]);
      folderCounter[idx] += 1;
      folderCounter.push(0);
      tokens.push({
        kind: "Folder",
        name,
        link: (entry.unk3 ?? 0) === 1,
        unk1: entry.unk1,
        unk2: entry.unk2,
        unk3: entry.unk3,
      });
    } else if (entry.type === "Item") {
      tokens.push({
        kind: "Item",
        name: String(entry.fileIndex ?? 0),
        link: (entry.unk3 ?? 0) === 1,
        unk1: entry.unk1,
        unk2: entry.unk2,
        unk3: entry.unk3,
      });
    } else if (entry.type === "EndMark") {
      const count = Math.max(0, entry.endMarkCount ?? 0);
      for (let i = 0; i < count; i++) {
        if (folderCounter.length > 1) {
          folderCounter.pop();
        }
        tokens.push({ kind: "End" });
      }
    }
  }
  const idxRef = { i: 0 };
  const children = parseChildren(tokens, idxRef);
  return {
    type: undefined,
    name: "Root",
    link: undefined,
    unk1: undefined,
    unk2: undefined,
    unk3: undefined,
    children,
  };
}

function parseChildren(tokens, idxRef) {
  const out = [];
  while (idxRef.i < tokens.length) {
    const t = tokens[idxRef.i];
    if (t.kind === "Folder") {
      idxRef.i += 1;
      const nested = parseChildren(tokens, idxRef);
      out.push({
        type: "Folder",
        name: t.name,
        link: t.link,
        unk1: t.unk1,
        unk2: t.unk2,
        unk3: t.unk3,
        children: nested,
      });
    } else if (t.kind === "Item") {
      idxRef.i += 1;
      out.push({
        type: "Item",
        name: t.name,
        link: t.link,
        unk1: t.unk1,
        unk2: t.unk2,
        unk3: t.unk3,
        children: undefined,
      });
    } else if (t.kind === "End") {
      idxRef.i += 1;
      return out;
    }
  }
  return out;
}

function buildOutputStructure(metaHeader, unkCount, fileIndices, typeList, subFileStructure, subFileParseStructure, outName) {
  if (typeList.length !== fileIndices.length) {
    throw new Error(`Type list length mismatch: types=${typeList.length}, files=${fileIndices.length}`);
  }
  const subFileData = [];
  for (let i = 0; i < fileIndices.length; i++) {
    const fileType = typeList[i];
    const fileIndex = fileIndices[i];
    const fileUrl = `.\\${outName}\\${i}${fileType}`;
    subFileData.push({
      index: i,
      fileType,
      fileIndex,
      fileUrl,
      fileBaseName: undefined,
    });
  }
  return {
    Magic: metaHeader >>> 0,
    Fhm2dTotalCount: fileIndices.length,
    UnkCount: unkCount >>> 0,
    SubFileData: subFileData,
    SubFileStructure: subFileStructure,
    SubFileParseStructure: subFileParseStructure,
    namingError: undefined,
    __metaNote:
      "Decoded from meta buffer only. SubFileData fileUrl is a placeholder layout; embedded file payloads are not present in meta.bin.",
  };
}

function extractInflatedMetaFromOb(bytes) {
  if (bytes.length < 0x30) {
    throw new Error("File too small for OB fhm2d");
  }
  const magic = bytes.subarray(0, 4);
  if (magic.equals(MAGIC_GVS)) {
    throw new Error("GVS/PS4 fhm2d is not supported. OB only.");
  }
  if (!magic.equals(MAGIC_OB)) {
    throw new Error("Unsupported magic. Expected OB fhm2d or raw inflated meta.");
  }
  const metaCompSize = readU32Le(bytes, 0x20);
  const metaStart = 0x30;
  const metaEnd = metaStart + metaCompSize;
  const metaComp = bytes.subarray(metaStart, metaEnd);
  return zlib.inflateRawSync(metaComp);
}

function loadMetaBuffer(inputPath, raw) {
  if (raw.length >= 4 && raw.subarray(0, 4).equals(MAGIC_OB)) {
    return { meta: extractInflatedMetaFromOb(raw), source: "obFullFile" };
  }
  return { meta: raw, source: "inflatedMetaOnly" };
}

function parseInflatedMeta(meta) {
  const metaHeader = readU32Le(meta, 0x00);
  const fileTypeCount = readU32Le(meta, 0x18);
  const fileCount = readU32Le(meta, 0x1c);
  const unkCount = readU32Le(meta, 0x20);

  const fileTypeEntries = parseFileTypeEntries(meta, fileTypeCount);
  const typeList = buildTypeList(fileTypeEntries);

  const reservedStart = 0x24 + fileTypeCount * 0x20;
  const reservedLen = fileCount * 0x0c;
  const reservedBeforeSubEntries = meta.subarray(reservedStart, reservedStart + reservedLen);

  let subCursor = reservedStart + reservedLen;
  if (subCursor > meta.length) {
    throw new Error("Sub entry cursor out of meta range");
  }

  const fileIndices = [];
  for (let n = 0; n < fileCount; n++) {
    const header = readSubEntryHeader(meta, subCursor);
    const fileSize = header.fileSize >>> 0;
    const chunkCount = header.chunkCount >>> 0;
    const pageCount = fileSize === 0 ? 0 : Math.floor((fileSize + PAGE_SIZE - 1) / PAGE_SIZE);
    const bitmapLen = pageCount === 0 ? 0 : Math.floor((pageCount + 7) / 8);
    const usedLen = computeSubEntryMetaUsedLen(header, bitmapLen);
    const next = subCursor + usedLen;
    if (next > meta.length) {
      throw new Error(
        `Sub entry ${n} stride overflow: cursor=0x${subCursor.toString(16)} usedLen=${usedLen} metaLen=${meta.length}`,
      );
    }
    fileIndices.push(header.fileIndex);
    subCursor = next;
  }

  const structureBytes = meta.subarray(subCursor);
  const subFileStructure = parseSubFileStructure(structureBytes);
  const subFileParseStructure = buildParseTree(subFileStructure);

  return {
    metaHeader,
    unkCount,
    fileTypeEntries,
    typeList,
    fileIndices,
    subFileStructure,
    subFileParseStructure,
    structureStartOffset: subCursor,
    reservedBeforeSubEntriesHex: reservedBeforeSubEntries.toString("hex"),
  };
}

function isMainModule() {
  if (typeof process === "undefined" || !process.argv[1]) {
    return false;
  }
  const entry = path.resolve(process.argv[1]);
  const thisFile = fileURLToPath(import.meta.url);
  return path.normalize(entry) === path.normalize(thisFile);
}

function parseArgs(argv) {
  let inputPath = null;
  let outputPath = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" || a === "-i") {
      inputPath = argv[++i];
      if (!inputPath) {
        throw new Error("Missing value for --input");
      }
    } else if (a.startsWith("--input=")) {
      inputPath = a.slice("--input=".length);
    } else if (a === "--output" || a === "-o") {
      outputPath = argv[++i];
      if (!outputPath) {
        throw new Error("Missing value for --output");
      }
    } else if (a.startsWith("--output=")) {
      outputPath = a.slice("--output=".length);
    } else if (!a.startsWith("-")) {
      if (inputPath === null) {
        inputPath = a;
      }
    }
  }
  return { inputPath, outputPath };
}

function main() {
  const { inputPath, outputPath } = parseArgs(process.argv);
  if (!inputPath) {
    throw new Error("Usage: node fhm_meta_debug.js --input <path/to/meta.bin> [--output fhm_meta_debug.json]");
  }
  const resolvedIn = path.resolve(inputPath);
  const outFile = outputPath ? path.resolve(outputPath) : path.join(process.cwd(), "fhm_meta_debug.json");

  const raw = fs.readFileSync(resolvedIn);
  const { meta, source } = loadMetaBuffer(resolvedIn, raw);

  const parsed = parseInflatedMeta(meta);
  const output = buildOutputStructure(
    parsed.metaHeader,
    parsed.unkCount,
    parsed.fileIndices,
    parsed.typeList,
    parsed.subFileStructure,
    parsed.subFileParseStructure,
    "meta_debug",
  );

  output.__source = source;
  output.__inputPath = resolvedIn;
  output.__structureStartOffset = parsed.structureStartOffset;
  output.__fileTypeEntries = parsed.fileTypeEntries;
  output.__reservedBeforeSubEntriesHex = parsed.reservedBeforeSubEntriesHex;

  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), "utf8");
  console.log(`Wrote ${outFile} (${source}, ${meta.length} byte meta)`);
}

export {
  buildOutputStructure,
  buildParseTree,
  computeSubEntryMetaUsedLen,
  loadMetaBuffer,
  parseArgs,
  parseInflatedMeta,
  parseSubFileStructure,
  readSubEntryHeader,
};

if (isMainModule()) {
  try {
    main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
