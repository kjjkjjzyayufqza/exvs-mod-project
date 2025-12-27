import { basename } from "@tauri-apps/api/path";
import { Buffer } from "buffer";
import { getFileType } from "@/models/fhm2d";

type PathSeparator = "/" | "\\";

export interface Fhm2dSubFileDataItem {
  index: number;
  fileType: string;
  fileIndex: number;
  fileUrl: string;
  fileBaseName?: string;
  ssbhModlInfo?: NumdlbModlInfo;
}

export interface Fhm2dStructureObject {
  SubFileData: Fhm2dSubFileDataItem[];
  [key: string]: unknown;
}

function normalizeWindowsLikePathForCompare(p: string): string {
  // Normalize to a Windows-like comparable key:
  // - backslashes
  // - collapse duplicate separators
  // - trim
  // - case-insensitive
  return p
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\+/g, "\\")
    .toLowerCase();
}

export function assertNoDuplicateFileUrls(structure: Fhm2dStructureObject): void {
  const map = new Map<string, Fhm2dSubFileDataItem[]>();
  for (const item of structure.SubFileData) {
    const url = item.fileUrl || "";
    const key = normalizeWindowsLikePathForCompare(url);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }

  const duplicates: Array<{ fileUrl: string; items: Fhm2dSubFileDataItem[] }> = [];
  for (const [key, items] of map.entries()) {
    if (items.length > 1) {
      duplicates.push({ fileUrl: key, items });
    }
  }

  if (duplicates.length > 0) {
    const details = duplicates
      .slice(0, 20)
      .map((d) => {
        const indices = d.items.map((i) => i.fileIndex).join(", ");
        return `${d.fileUrl} <- fileIndex: [${indices}]`;
      })
      .join("\n");
    throw new Error(`Duplicate fileUrl detected (${duplicates.length}):\n${details}`);
  }
}

type SubFileParseNode =
  | {
      type: "Folder";
      name: string;
      children: SubFileParseNode[];
      [key: string]: unknown;
    }
  | {
      type: "Item";
      name: string;
      [key: string]: unknown;
    }
  | {
      name: string;
      children: SubFileParseNode[];
      [key: string]: unknown;
    };

export interface NumdlbNamingOptions {
  /**
   * Root directory that contains the folder referenced by fileUrl.
   * Used for path construction in fileUrl field.
   * Example:
   * - fileUrl: ".\\0x092B6B4A\\23.numdlb"
   * - rootDir: "E:\\XB\\解包\\com\\file"
   */
  rootDir: string;
  /**
   * Max number of files read concurrently.
   */
  concurrency?: number;
  /**
   * If true, rewrite fileUrl to use the extracted base name (recommended).
   */
  rewriteFileUrl?: boolean;
  /**
   * Map of file index to buffer data.
   * All files must be provided in this map (read from memory, not disk).
   */
  fileDataMap: Map<number, Uint8Array>;
}

function normalizeSeparatorsToBackslash(p: string): string {
  return p.replace(/\//g, "\\");
}

function stripLeadingDotSlash(p: string): string {
  return p.replace(/^(\.\/|\.\\)+/g, "");
}

function splitPathSegments(p: string): string[] {
  const trimmed = stripLeadingDotSlash(p);
  return trimmed.split(/[\\/]+/g).filter(Boolean);
}

function getPathSeparatorFromFileUrl(fileUrl: string): PathSeparator {
  return fileUrl.includes("\\") ? "\\" : "/";
}

function buildFileUrl(prefixSegments: string[], fileName: string, sep: PathSeparator): string {
  const base = prefixSegments.join(sep);
  if (base.length === 0) return `.${sep}${fileName}`;
  return `.${sep}${base}${sep}${fileName}`;
}

/**
 * Read a null-terminated ASCII/UTF-8 string from a byte buffer.
 * Stops at the first 0x00.
 */
export function readStringToEnd(data: Uint8Array, offset: number, maxLength = 4096): string {
  if (offset < 0 || offset >= data.length) return "";
  const endLimit = Math.min(data.length, offset + Math.max(0, maxLength));
  let end = offset;
  while (end < endLimit && data[end] !== 0x00) end++;
  return Buffer.from(data).toString("utf8", offset, end);
}

export interface NumdlbBaseNameResult {
  fileBaseName: string;
  fileBaseNameOffset: number;
}

export interface NumdlbModlEntryInfo {
  meshObjectName: string;
  meshObjectSubindex: string;
  materialLabel: string;
}

export interface NumdlbModlInfo {
  majorVersion: number;
  minorVersion: number;
  modelName: string;
  skeletonFileName: string;
  materialFileNames: string[];
  animationFileName: string | null;
  meshFileName: string;
  entries?: NumdlbModlEntryInfo[];
}

function readU16LE(buf: Buffer, offset: number): number {
  if (offset < 0 || offset + 2 > buf.length) {
    throw new Error(`readU16LE out of range at 0x${offset.toString(16)}`);
  }
  return buf.readUInt16LE(offset);
}

function parseNumdlbSsbhHeader(buf: Buffer): { majorVersion: number; minorVersion: number } {
  if (buf.slice(0x00, 0x04).toString("ascii") !== "HBSS") {
    throw new Error("Invalid numdlb: missing HBSS magic");
  }
  if (buf.slice(0x10, 0x14).toString("ascii") !== "LDOM") {
    throw new Error("Invalid numdlb: missing LDOM magic");
  }
  const majorVersion = readU16LE(buf, 0x14);
  const minorVersion = readU16LE(buf, 0x16);
  return { majorVersion, minorVersion };
}

/**
 * Parse `.numdlb` buffer and extract the model name using the same core idea as ssbh_lib:
 * - 0x00: "HBSS" (SSBH container)
 * - 0x10: "LDOM" (Modl / .numdlb)
 * - 0x14: u16 major_version, 0x16: u16 minor_version
 * - 0x18: RelPtr64<CString4> for `model_name`
 *
 * In practice, `RelPtr64` is a u64 relative offset from the position of the pointer field.
 * So the absolute string address is: pointer_field_offset + relative_offset.
 */
export function parseNumdlbFileBaseName(data: Uint8Array): NumdlbBaseNameResult {
  const buf = Buffer.from(data);
  parseNumdlbSsbhHeader(buf);

  const pointerFieldOffset = 0x18;
  const fileBaseNameOffset = readRelPtr64AsOffset(buf, pointerFieldOffset);
  if (fileBaseNameOffset === null) {
    throw new Error("Invalid numdlb: null RelPtr64 for model_name");
  }
  const fileBaseName = readCStringUtf8(buf, fileBaseNameOffset, 4096);
  if (!fileBaseName) {
    throw new Error("Invalid numdlb: empty base name");
  }

  return { fileBaseName, fileBaseNameOffset };
}

function readU64LE(buf: Buffer, offset: number): bigint {
  if (offset < 0 || offset + 8 > buf.length) {
    throw new Error(`readU64LE out of range at 0x${offset.toString(16)}`);
  }
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result |= BigInt(buf[offset + i]!) << (8n * BigInt(i));
  }
  return result;
}

function readCStringUtf8(buf: Buffer, offset: number, maxLength: number): string {
  if (offset < 0 || offset >= buf.length) return "";
  const endLimit = Math.min(buf.length, offset + Math.max(0, maxLength));
  let end = offset;
  while (end < endLimit && buf[end] !== 0x00) end++;
  return buf.toString("utf8", offset, end);
}

function readRelPtr64AsOffset(buf: Buffer, pointerFieldOffset: number): number | null {
  const relativeOffset = readU64LE(buf, pointerFieldOffset);
  if (relativeOffset === 0n) return null;
  const absolute = BigInt(pointerFieldOffset) + relativeOffset;
  if (absolute < 0n || absolute >= BigInt(buf.length)) {
    throw new Error(`RelPtr64 target out of range: 0x${absolute.toString(16)}`);
  }
  return Number(absolute);
}

function readSsbhStringAt(buf: Buffer, pointerFieldOffset: number, maxLength = 4096): string {
  const stringOffset = readRelPtr64AsOffset(buf, pointerFieldOffset);
  if (stringOffset === null) return "";
  return readCStringUtf8(buf, stringOffset, maxLength);
}

function readSsbhArrayHeader(buf: Buffer, fieldOffset: number): { dataOffset: number; count: number } {
  const rel = readU64LE(buf, fieldOffset);
  const countU64 = readU64LE(buf, fieldOffset + 8);
  if (countU64 > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`SsbhArray count too large: ${countU64.toString()}`);
  }
  const count = Number(countU64);
  if (count === 0) {
    return { dataOffset: fieldOffset, count: 0 };
  }
  const abs = BigInt(fieldOffset) + rel;
  if (abs < 0n || abs >= BigInt(buf.length)) {
    throw new Error(`SsbhArray data offset out of range: 0x${abs.toString(16)}`);
  }
  return { dataOffset: Number(abs), count };
}

function basenameFromMixedPath(path: string): string {
  const normalized = path.replace(/^\.([\\/])/, "").replace(/^(\.\/|\.\\)+/g, "");
  const parts = normalized.split(/[\\/]+/g).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : normalized;
}

function stripExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) return fileName;
  return fileName.slice(0, lastDot);
}

function findFolderPathForFileIndex(
  root: SubFileParseNode,
  fileIndex: number
): { folderPath: string[]; folderNode: SubFileParseNode } | null {
  const target = String(fileIndex);

  const dfs = (node: SubFileParseNode, path: string[]): { folderPath: string[]; folderNode: SubFileParseNode } | null => {
    if ((node as any).type === "Item") {
      return (node as any).name === target ? { folderPath: path, folderNode: node } : null;
    }

    const children: SubFileParseNode[] | undefined = (node as any).children;
    if (!children || children.length === 0) return null;

    for (const child of children) {
      const nextPath =
        (child as any).type === "Folder" && typeof (child as any).name === "string" ? [...path, (child as any).name] : path;
      const result = dfs(child, nextPath);
      if (result) {
        // We want the deepest folder that still contains the item.
        // If the match is the item itself, return the folder path accumulated so far.
        if ((child as any).type === "Item") {
          return { folderPath: path, folderNode: node };
        }
        return result;
      }
    }
    return null;
  };

  // The dfs returns a mix; normalize to the deepest folder node by re-walking the path.
  const match = dfs(root, []);
  if (!match) return null;

  // Walk down the folderPath to get the corresponding folder node.
  let current: SubFileParseNode = root;
  for (const folderName of match.folderPath) {
    const children: SubFileParseNode[] = (current as any).children || [];
    const next = children.find((c) => (c as any).type === "Folder" && (c as any).name === folderName);
    if (!next) break;
    current = next;
  }

  return { folderPath: match.folderPath, folderNode: current };
}

function collectItemFileIndices(node: SubFileParseNode, out: number[]) {
  if ((node as any).type === "Item") {
    const n = Number((node as any).name);
    if (!Number.isNaN(n)) out.push(n);
    return;
  }
  const children: SubFileParseNode[] | undefined = (node as any).children;
  if (!children) return;
  for (const c of children) collectItemFileIndices(c, out);
}

function findFolderNodeByPath(root: SubFileParseNode, folderPath: string[]): SubFileParseNode | null {
  let current: SubFileParseNode = root;
  for (const segment of folderPath) {
    const children: SubFileParseNode[] | undefined = (current as any).children;
    if (!children) return null;
    const next = children.find((c) => (c as any).type === "Folder" && String((c as any).name) === segment);
    if (!next) return null;
    current = next;
  }
  return current;
}

function sortFolderNodesByNumericName(nodes: SubFileParseNode[]): SubFileParseNode[] {
  return nodes.slice().sort((a, b) => {
    const an = Number((a as any).name);
    const bn = Number((b as any).name);
    if (Number.isNaN(an) || Number.isNaN(bn)) return String((a as any).name).localeCompare(String((b as any).name));
    return an - bn;
  });
}

function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0] ?? "";
  for (let i = 1; i < strings.length; i++) {
    const s = strings[i] ?? "";
    let j = 0;
    const max = Math.min(prefix.length, s.length);
    while (j < max && prefix[j] === s[j]) j++;
    prefix = prefix.slice(0, j);
    if (!prefix) return "";
  }
  return prefix;
}

function normalizeCharacterBaseNameFromModelNames(modelNames: string[]): string {
  const lcp = longestCommonPrefix(modelNames);
  // Trim to a reasonable boundary to avoid ending with partial token.
  const trimmed = lcp.replace(/[_\\/-]+$/g, "");
  return trimmed;
}

/**
 * Parse `.numdlb` Modl info (currently supports version 1.7).
 * This mirrors ssbh_lib's read behavior:
 * - strings are RelPtr64<CString>
 * - arrays are (relative_offset, count)
 */
export function parseNumdlbModlInfo(data: Uint8Array, options?: { includeEntries?: boolean }): NumdlbModlInfo {
  const buf = Buffer.from(data);
  const { majorVersion, minorVersion } = parseNumdlbSsbhHeader(buf);
  if (!(majorVersion === 1 && minorVersion === 7)) {
    throw new Error(`Unsupported numdlb Modl version: ${majorVersion}.${minorVersion}`);
  }

  const base = 0x18;

  const modelName = readSsbhStringAt(buf, base + 0x00);
  const skeletonFileName = readSsbhStringAt(buf, base + 0x08);

  const materialHeader = readSsbhArrayHeader(buf, base + 0x10);
  const materialFileNames: string[] = [];
  for (let i = 0; i < materialHeader.count; i++) {
    const elementOffset = materialHeader.dataOffset + i * 8;
    materialFileNames.push(readSsbhStringAt(buf, elementOffset));
  }

  const animPtrOffset = readRelPtr64AsOffset(buf, base + 0x20);
  const animationFileName = animPtrOffset === null ? null : readSsbhStringAt(buf, animPtrOffset);

  const meshFileName = readSsbhStringAt(buf, base + 0x28);

  const info: NumdlbModlInfo = {
    majorVersion,
    minorVersion,
    modelName,
    skeletonFileName,
    materialFileNames,
    animationFileName,
    meshFileName,
  };
  const entriesHeader = readSsbhArrayHeader(buf, base + 0x30);
  const entries: NumdlbModlEntryInfo[] = [];
  const entryStride = 0x18;
  for (let i = 0; i < entriesHeader.count; i++) {
    const entryOffset = entriesHeader.dataOffset + i * entryStride;
    const meshObjectName = readSsbhStringAt(buf, entryOffset + 0x00);
    const meshObjectSubindex = readU64LE(buf, entryOffset + 0x08).toString();
    const materialLabel = readSsbhStringAt(buf, entryOffset + 0x10);
    entries.push({ meshObjectName, meshObjectSubindex, materialLabel });
  }
  info.entries = entries;
  console.log("[DEBUG] parseNumdlbModlInfo: ", info);
  return info;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await worker(items[current]!, current);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Enrich structure object by reading `.numdlb` files referenced by SubFileData.fileUrl.
 * This function only mutates the given object in memory; it does not write any files.
 *
 * - Adds `fileBaseName`
 * - Optionally rewrites `fileUrl` to use `fileBaseName + fileType`
 */
export async function applyNumdlbBaseNameToStructureObject(
  structure: Fhm2dStructureObject,
  options: NumdlbNamingOptions
): Promise<Fhm2dStructureObject> {
  const rewriteFileUrl = options.rewriteFileUrl !== false;
  const concurrency = options.concurrency ?? 1;

  const candidates = structure.SubFileData.filter((e) => (e.fileType || "").toLowerCase() === ".numdlb");

  await mapWithConcurrency(candidates, concurrency, async (item) => {
    const sep = getPathSeparatorFromFileUrl(item.fileUrl);
    const segments = splitPathSegments(item.fileUrl);
    if (segments.length < 2) {
      throw new Error(`Invalid fileUrl: ${item.fileUrl}`);
    }

    const fileName = segments[segments.length - 1]!;
    const prefixSegments = segments.slice(0, -1);

    // Read file data from memory map
    if (!options.fileDataMap.has(item.fileIndex)) {
      throw new Error(`File data not found in memory for fileIndex=${item.fileIndex}`);
    }
    const bytes = options.fileDataMap.get(item.fileIndex)!;

    const info = parseNumdlbModlInfo(bytes);
    item.ssbhModlInfo = info;
    item.fileBaseName = info.modelName;

    if (rewriteFileUrl) {
      const ext = item.fileType || "";
      const nextFileName = `${item.fileBaseName}${ext}`;
      item.fileUrl = buildFileUrl(prefixSegments, nextFileName, sep);
    } else {
      // Keep existing fileUrl; still attach fileBaseName.
      void fileName;
    }
  });

  // Step 2: Rename associated files (jnttbl/skeleton/material/mesh) for each renamed numdlb.
  const parseRoot = structure["SubFileParseStructure"] as SubFileParseNode | undefined;
  if (!parseRoot) {
    throw new Error("Missing SubFileParseStructure in structure object");
  }

  const fileIndexToSubFileData = new Map<number, Fhm2dSubFileDataItem>();
  for (const e of structure.SubFileData) fileIndexToSubFileData.set(e.fileIndex, e);

  for (const numdlbItem of candidates) {
    const modl = numdlbItem.ssbhModlInfo;
    if (!modl) continue;

    const folderMatch = findFolderPathForFileIndex(parseRoot, numdlbItem.fileIndex);
    if (!folderMatch) continue;

    const groupItemIndices: number[] = [];
    collectItemFileIndices(folderMatch.folderNode, groupItemIndices);

    const itemsInGroup = groupItemIndices
      .map((idx) => fileIndexToSubFileData.get(idx))
      .filter((v): v is Fhm2dSubFileDataItem => Boolean(v));

    const numdlbInGroup = itemsInGroup.filter((e) => e.fileType.toLowerCase() === ".numdlb");
    const skeletonCandidates = itemsInGroup.filter((e) => e.fileType.toLowerCase() === ".nusktb").sort((a, b) => a.fileIndex - b.fileIndex);
    const materialCandidates = itemsInGroup.filter((e) => e.fileType.toLowerCase() === ".numatb").sort((a, b) => a.fileIndex - b.fileIndex);
    const meshCandidates = itemsInGroup.filter((e) => e.fileType.toLowerCase() === ".numshb").sort((a, b) => a.fileIndex - b.fileIndex);
    const jnttblCandidates = itemsInGroup.filter((e) => e.fileType.toLowerCase() === ".bin").sort((a, b) => a.fileIndex - b.fileIndex);

    // Guard rails to avoid mis-associating files across model groups.
    // If a folder subtree contains multiple models' files, heuristics like "pick the first nusktb"
    // can rename the wrong model's files (e.g., body_normal vs wep_rifle00).
    if (numdlbInGroup.length !== 1) {
      throw new Error(
        `Ambiguous group folder for numdlb fileIndex=${numdlbItem.fileIndex}: expected 1 numdlb in group, got ${numdlbInGroup.length}`
      );
    }
    if (skeletonCandidates.length !== 1) {
      throw new Error(
        `Ambiguous group folder for numdlb fileIndex=${numdlbItem.fileIndex}: expected 1 nusktb in group, got ${skeletonCandidates.length}`
      );
    }
    if (meshCandidates.length !== 1) {
      throw new Error(
        `Ambiguous group folder for numdlb fileIndex=${numdlbItem.fileIndex}: expected 1 numshb in group, got ${meshCandidates.length}`
      );
    }
    if (materialCandidates.length !== modl.materialFileNames.length) {
      throw new Error(
        `Ambiguous group folder for numdlb fileIndex=${numdlbItem.fileIndex}: expected ${modl.materialFileNames.length} numatb in group, got ${materialCandidates.length}`
      );
    }

    // jnttbl (stored as .bin in fhm2d, renamed to .jnttbl for readability)
    // We only rename when there is exactly one .bin in the model group folder.
    if (jnttblCandidates.length === 1) {
      const target = jnttblCandidates[0]!;
      const sep = getPathSeparatorFromFileUrl(target.fileUrl);
      const targetSegments = splitPathSegments(target.fileUrl);
      const prefixSegments = targetSegments.slice(0, -1);
      const desired = `${modl.modelName}.jnttbl`;
      target.fileBaseName = modl.modelName;
      target.fileUrl = buildFileUrl(prefixSegments, desired, sep);
    } else if (jnttblCandidates.length > 1) {
      throw new Error(
        `Ambiguous group folder for numdlb fileIndex=${numdlbItem.fileIndex}: expected 0 or 1 .bin (jnttbl) in group, got ${jnttblCandidates.length}`
      );
    }

    // Skeleton
    if (modl.skeletonFileName) {
      const desired = basenameFromMixedPath(modl.skeletonFileName);
      const desiredBase = stripExtension(desired);
      const target = skeletonCandidates[0]!;
      const sep = getPathSeparatorFromFileUrl(target.fileUrl);
      const targetSegments = splitPathSegments(target.fileUrl);
      const prefixSegments = targetSegments.slice(0, -1);
      target.fileBaseName = desiredBase;
      target.fileUrl = buildFileUrl(prefixSegments, desired, sep);
    }

    // Materials (order by fileIndex)
    for (let i = 0; i < modl.materialFileNames.length; i++) {
      const desired = basenameFromMixedPath(modl.materialFileNames[i]!);
      const desiredBase = stripExtension(desired);
      const target = materialCandidates[i]!;
      const sep = getPathSeparatorFromFileUrl(target.fileUrl);
      const targetSegments = splitPathSegments(target.fileUrl);
      const prefixSegments = targetSegments.slice(0, -1);
      target.fileBaseName = desiredBase;
      target.fileUrl = buildFileUrl(prefixSegments, desired, sep);
    }

    // Mesh
    if (modl.meshFileName) {
      const desired = basenameFromMixedPath(modl.meshFileName);
      const desiredBase = stripExtension(desired);
      const target = meshCandidates[0]!;
      const sep = getPathSeparatorFromFileUrl(target.fileUrl);
      const targetSegments = splitPathSegments(target.fileUrl);
      const prefixSegments = targetSegments.slice(0, -1);
      target.fileBaseName = desiredBase;
      target.fileUrl = buildFileUrl(prefixSegments, desired, sep);
    }
  }

  // Step 3: Rename nuhlpb files in folder "0\\3" based on model folders under "0\\0".
  // Example layout:
  // - 0\\0 has N model folders (0,1,2...)
  // - 0\\3 has N nuhlpb items
  // Mapping is positional by folder order (0 -> first model name, 1 -> second model name, etc.).
  const modelRoot = findFolderNodeByPath(parseRoot, ["0", "0"]);
  const nuhlpbRoot = findFolderNodeByPath(parseRoot, ["0", "3"]);
  let modelNamesForPackage: string[] = [];
  if (modelRoot && nuhlpbRoot) {
    const modelFolders = sortFolderNodesByNumericName(
      (((modelRoot as any).children as SubFileParseNode[]) || []).filter((c) => (c as any).type === "Folder")
    );

    const modelNames: string[] = [];
    for (const folder of modelFolders) {
      const indices: number[] = [];
      collectItemFileIndices(folder, indices);
      const groupItems = indices
        .map((idx) => fileIndexToSubFileData.get(idx))
        .filter((v): v is Fhm2dSubFileDataItem => Boolean(v));
      const groupNumdlb = groupItems.filter((e) => e.fileType.toLowerCase() === ".numdlb");
      if (groupNumdlb.length !== 1) {
        throw new Error(`Ambiguous model folder under 0\\\\0: expected 1 numdlb, got ${groupNumdlb.length}`);
      }
      const name = groupNumdlb[0]!.fileBaseName || groupNumdlb[0]!.ssbhModlInfo?.modelName;
      if (!name) {
        throw new Error("Missing modelName for numdlb in model folder under 0\\\\0");
      }
      modelNames.push(name);
    }
    modelNamesForPackage = modelNames.slice();

    const nuhlpbIndices: number[] = [];
    collectItemFileIndices(nuhlpbRoot, nuhlpbIndices);
    const nuhlpbItems = nuhlpbIndices
      .map((idx) => fileIndexToSubFileData.get(idx))
      .filter((v): v is Fhm2dSubFileDataItem => Boolean(v))
      .filter((e) => e.fileType.toLowerCase() === ".nuhlpb")
      .sort((a, b) => a.fileIndex - b.fileIndex);

    if (nuhlpbItems.length !== modelNames.length) {
      throw new Error(
        `nuhlpb/model count mismatch: expected ${modelNames.length} nuhlpb files in 0\\\\3, got ${nuhlpbItems.length}`
      );
    }

    for (let i = 0; i < modelNames.length; i++) {
      const modelName = modelNames[i]!;
      const target = nuhlpbItems[i]!;
      const sep = getPathSeparatorFromFileUrl(target.fileUrl);
      const targetSegments = splitPathSegments(target.fileUrl);
      const prefixSegments = targetSegments.slice(0, -1);
      const desired = `${modelName}.nuhlpb`;
      target.fileBaseName = modelName;
      target.fileUrl = buildFileUrl(prefixSegments, desired, sep);
    }
  }

  // Step 4: Rename shell file (the 2nd .bin under folder "0" by Windows name sort) -> shell_<character>.shl.
  // The character base name is derived from the common prefix of model names under "0\\0".
  const rootFolder0 = findFolderNodeByPath(parseRoot, ["0"]);
  if (rootFolder0) {
    const folder0Children: SubFileParseNode[] = ((rootFolder0 as any).children as SubFileParseNode[]) || [];
    const folder0BinItemIndices = folder0Children
      .filter((c) => (c as any).type === "Item")
      .map((c) => Number((c as any).name))
      .filter((n) => Number.isFinite(n))
      .map((n) => fileIndexToSubFileData.get(n as number))
      .filter((v): v is Fhm2dSubFileDataItem => Boolean(v))
      .filter((e) => e.fileType.toLowerCase() === ".bin")
      .sort((a, b) => a.fileIndex - b.fileIndex);

    if (folder0BinItemIndices.length < 4) {
      throw new Error(`Expected at least 4 .bin files directly under folder 0, got ${folder0BinItemIndices.length}`);
    }

    const baseName = normalizeCharacterBaseNameFromModelNames(modelNamesForPackage);
    if (!baseName) {
      throw new Error("Failed to derive character base name for shell file renaming");
    }

    // 1st .bin: characterid_<base>.bin
    const characterIdItem = folder0BinItemIndices[0]!;
    {
      const sep = getPathSeparatorFromFileUrl(characterIdItem.fileUrl);
      const segments = splitPathSegments(characterIdItem.fileUrl);
      const prefixSegments = segments.slice(0, -1);
      const desired = `characterid_${baseName}.bin`;
      characterIdItem.fileBaseName = `characterid_${baseName}`;
      characterIdItem.fileUrl = buildFileUrl(prefixSegments, desired, sep);
    }

    // 2nd .bin: shell_<base>.shl
    const shellItem = folder0BinItemIndices[1]!;
    {
      const sep = getPathSeparatorFromFileUrl(shellItem.fileUrl);
      const segments = splitPathSegments(shellItem.fileUrl);
      const prefixSegments = segments.slice(0, -1);
      const desired = `shell_${baseName}.shl`;
      shellItem.fileBaseName = `shell_${baseName}`;
      shellItem.fileUrl = buildFileUrl(prefixSegments, desired, sep);
    }

    // 3rd .bin: vernier_table_<base>.bin
    const vernierTableItem = folder0BinItemIndices[2]!;
    {
      const sep = getPathSeparatorFromFileUrl(vernierTableItem.fileUrl);
      const segments = splitPathSegments(vernierTableItem.fileUrl);
      const prefixSegments = segments.slice(0, -1);
      const desired = `vernier_table_${baseName}.bin`;
      vernierTableItem.fileBaseName = `vernier_table_${baseName}`;
      vernierTableItem.fileUrl = buildFileUrl(prefixSegments, desired, sep);
    }

    // 4th .bin: effect_project_<base>.bin
    const effectProjectItem = folder0BinItemIndices[3]!;
    {
      const sep = getPathSeparatorFromFileUrl(effectProjectItem.fileUrl);
      const segments = splitPathSegments(effectProjectItem.fileUrl);
      const prefixSegments = segments.slice(0, -1);
      const desired = `effect_project_${baseName}.bin`;
      effectProjectItem.fileBaseName = `effect_project_${baseName}`;
      effectProjectItem.fileUrl = buildFileUrl(prefixSegments, desired, sep);
    }
  }

  // Step 5: Classify and rename files in folder "0\\1\\0" by magic.
  // - If magic is "RGDL", use ".rgdprm"
  // - Otherwise, use ".hkt"
  const folder010 = findFolderNodeByPath(parseRoot, ["0", "1", "0"]);
  if (folder010) {
    const indices: number[] = [];
    collectItemFileIndices(folder010, indices);

    const binItems = indices
      .map((idx) => fileIndexToSubFileData.get(idx))
      .filter((v): v is Fhm2dSubFileDataItem => Boolean(v))
      .filter((e) => e.fileType.toLowerCase() === ".bin")
      .sort((a, b) => a.fileIndex - b.fileIndex);

    for (const e of binItems) {
      // Read file data from memory map
      if (!options.fileDataMap.has(e.fileIndex)) {
        throw new Error(`File data not found in memory for fileIndex=${e.fileIndex}`);
      }
      const bytes = options.fileDataMap.get(e.fileIndex)!;
      const buf = Buffer.from(bytes);
      const magic = buf.slice(0, 4).toString("ascii");
      const newExt = magic === "RGDL" ? ".rgdprm" : ".hkt";

      const sep = getPathSeparatorFromFileUrl(e.fileUrl);
      const segments = splitPathSegments(e.fileUrl);
      const prefixSegments = segments.slice(0, -1);
      const oldName = segments[segments.length - 1] ?? "";
      const base = stripExtension(oldName);
      e.fileBaseName = base;
      e.fileType = newExt;
      e.fileUrl = buildFileUrl(prefixSegments, `${base}${newExt}`, sep);
    }
  }

  // Step 6: Rename nutexb files based on the internal name (footer "46XT" at fileSize - 0x70).
  const nutexbItems = structure.SubFileData.filter((e) => (e.fileType || "").toLowerCase() === ".nutexb");
  for (const e of nutexbItems) {
    const sep = getPathSeparatorFromFileUrl(e.fileUrl);
    const segments = splitPathSegments(e.fileUrl);
    if (segments.length < 2) {
      throw new Error(`Invalid fileUrl: ${e.fileUrl}`);
    }

    // Read file data from memory map
    if (!options.fileDataMap.has(e.fileIndex)) {
      throw new Error(`File data not found in memory for fileIndex=${e.fileIndex}`);
    }
    const bytes = options.fileDataMap.get(e.fileIndex)!;
    const fileSize = bytes.length;
    const buf = Buffer.from(bytes);

    // Standard footer detection:
    // 1) fileSize - 0x8 must be exactly " XET"
    // 2) fileSize - 0x4 stores (majorVersion, minorVersion) as int16
    // 3) (1,1) => "46XT" at fileSize - 0x86c
    //    (2,0) => "46XT" at fileSize - 0x70 (current behavior)
    if (fileSize < 0x8) {
      throw new Error(`Invalid nutexb size: fileIndex=${e.fileIndex}`);
    }

    const footerMagic = buf.slice(fileSize - 0x8, fileSize - 0x4).toString("ascii");
    if (footerMagic !== " XET") {
      throw new Error(`Invalid nutexb footer magic: fileIndex=${e.fileIndex}`);
    }

    const majorVersion = buf.readInt16LE(fileSize - 0x4);
    const minorVersion = buf.readInt16LE(fileSize - 0x2);

    let nameOffset: number;
    if (majorVersion === 1 && minorVersion === 1) {
      nameOffset = fileSize - 0x86c;
    } else if ((majorVersion === 2 && minorVersion === 0) || (majorVersion === 1 && minorVersion === 2)) {
      nameOffset = fileSize - 0x70;
    } else {
      throw new Error(`Unsupported nutexb version: ${majorVersion}.${minorVersion} (fileIndex=${e.fileIndex})`);
    }

    if (nameOffset < 0 || nameOffset + 4 > fileSize) {
      throw new Error(`Invalid nutexb name offset: fileIndex=${e.fileIndex}`);
    }

    const prefix = buf.slice(nameOffset, nameOffset + 4).toString("ascii");
    if (prefix !== "46XT") {
      throw new Error(`Invalid nutexb format: missing 46XT prefix: fileIndex=${e.fileIndex}`);
    }

    const stringStart = nameOffset + 4;
    let stringEnd = stringStart;
    while (stringEnd < fileSize && buf[stringEnd] !== 0x00) stringEnd++;
    if (stringEnd === stringStart) {
      throw new Error(`Empty nutexb name: fileIndex=${e.fileIndex}`);
    }

    const rawName = buf.toString("utf8", stringStart, stringEnd);
    const textureName = rawName.replace(/[\\/]/g, "_").trim();
    if (!textureName) {
      throw new Error(`Invalid nutexb name: fileIndex=${e.fileIndex}`);
    }

    const prefixSegments = segments.slice(0, -1);
    e.fileBaseName = textureName;
    e.fileUrl = buildFileUrl(prefixSegments, `${textureName}.nutexb`, sep);
  }

  // Final validation: fail fast on name collisions.
  assertNoDuplicateFileUrls(structure);

  return structure;
}

/**
 * Build the same `fileNameNoExt` used in `models/fhm2d.ts` generateOutputStructure:
 * It is the basename of the extraction output directory.
 */
export async function getProjectFolderNameFromOutDir(outDir: string): Promise<string> {
  return await basename(outDir);
}

export interface MinimalFhm2dLike {
  MetaHeader?: number;
  UnkCount?: number;
  FileCount?: number;
  FileTypeData?: Array<{ FileType: number; FileCount: number }>;
  SubFileData?: Array<{ FileIndex: number }>;
  SubFileStructure?: unknown[];
}

function buildTypeListFromFileTypeData(fileTypeData: Array<{ FileType: number; FileCount: number }>): string[] {
  const typeList: string[] = [];
  for (const ft of fileTypeData) {
    const ext = getFileType(ft.FileType);
    for (let i = 0; i < ft.FileCount; i++) typeList.push(ext);
  }
  return typeList;
}

/**
 * Create an in-memory structure object equivalent to the extractor's output JSON,
 * without reading any `*_structure.json` files.
 *
 * This is designed for `ExtractFilePage` usage: after selecting a fhm2d, you already
 * have `fhm2dData` in memory and you know the chosen output directory.
 */
export async function buildStructureObjectFromFhm2dData(
  fhm2dData: MinimalFhm2dLike,
  outDir: string
): Promise<Fhm2dStructureObject> {
  const fileNameNoExt = await basename(outDir);
  const typeList = buildTypeListFromFileTypeData(fhm2dData.FileTypeData ?? []);
  const count = fhm2dData.FileCount ?? typeList.length ?? 0;

  const subFileData: Fhm2dSubFileDataItem[] = [];
  for (let i = 0; i < count; i++) {
    const ext = typeList[i] ?? ".bin";
    const fileIndex = fhm2dData.SubFileData?.[i]?.FileIndex ?? i;
    subFileData.push({
      index: i,
      fileType: ext,
      fileIndex,
      fileUrl: `.\\${fileNameNoExt}\\${i}${ext}`,
    });
  }

  return {
    Magic: fhm2dData.MetaHeader ?? 0,
    Fhm2dTotalCount: count,
    UnkCount: fhm2dData.UnkCount ?? 0,
    SubFileData: subFileData,
    SubFileStructure: (fhm2dData.SubFileStructure as any) ?? [],
  };
}

