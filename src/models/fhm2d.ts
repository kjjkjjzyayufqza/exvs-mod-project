import { Buffer } from "buffer";
import { ErrorMessage } from "./error";
import pako from "pako";
import { invoke } from "@tauri-apps/api/core";
import { writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { basename, dirname } from "@tauri-apps/api/path";
import { applyNumdlbBaseNameToStructureObject } from "@/lib/fhm2d_characterModelFormatFuc";
import { applyNutexbInternalNameToStructureObject } from "@/lib/fhm2d_allNutexbFormatFuc";
import { applyParamAssetNamesToStructureObject } from "@/lib/fhm2d_paramAssetFormatFuc";
import { applyMscAssetNamesToStructureObject } from "@/lib/fhm2d_mscAssetFormatFuc";
import {
  applyMotionAssetNamesToStructureObject,
  ensureEmptyFoldersFromSubFileParseStructure,
  motionFileUrlToNestedRelativePath,
} from "@/lib/fhm2d_motionAssetFormatFuc";

export enum Fhm2d_type_format {
  fhm2d_character = "fhm2d_character",
  fhm2d_all_nutexb = "fhm2d_all_nutexb",
  fhm2d_stage_list = "fhm2d_stage_list",
  fhm2d_character_param = "fhm2d_character_param",
  fhm2d_msc = "fhm2d_msc",
  fhm2d_motion = "fhm2d_motion",
}

export enum Fhm2dType {
  PS4GundamVersus = "PS4GundamVersus",
  Xboost = "Xboost",
}

export function getFileType(type: number) {
  switch (type) {
    case 0xa:
      return ".nushdb";
    case 0xb:
      return ".nutexb";
    case 0xc:
      return ".nusktb";
    case 0xd:
      return ".numatb";
    case 0xe:
      return ".numshb";
    case 0xf:
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

export class PS4FhmData {
  _TYPE_: Fhm2dType = Fhm2dType.PS4GundamVersus;
  bufferData: Buffer;
  Magic: string;
  MetaSize: number;
  MetaHeader: number;
  BodyData: Buffer;
  MetaDataSize: number;
  MetaData: Buffer;
  FileTypeCount: number;
  FileCount: number;
  UnkCount: number;
  private StreamReader: Buffer;
  FileTypeData: FileTypeData[];
  SubFileData: SubData[];
  SubFileStructure: SubFileStructure[];
  constructor(buffer: Buffer) {
    this.bufferData = buffer;
    this.Magic = this.readFileMagic(); //0
    this.MetaHeader = this.bufferData.readInt32LE(0x20);
    this.MetaSize = this.bufferData.readUInt32LE(0x10); //0x10
    // Get the body data
    this.BodyData = this.bufferData.slice(this.MetaSize, this.bufferData.byteLength);

    this.MetaDataSize = this.bufferData.readUInt32LE(0x18); //0x18
    // Get the meta data
    this.MetaData = this.bufferData.slice(0, this.MetaDataSize);
    this.FileTypeCount = this.MetaData.readUInt32LE(0x30);
    this.FileCount = this.MetaData.readUInt32LE(0x34);
    this.UnkCount = this.MetaData.readUInt32LE(0x38); // not sure, no to check

    this.StreamReader = this.MetaData;
    this.FileTypeData = this.createFileTypeDataArray();

    // Skip the data, and update StreamReader
    this.skipSize(0xc * this.FileCount);

    // Get each Sub file data info
    this.SubFileData = this.createSubFileDataArray();
    // Get file structure
    this.SubFileStructure = createSubFileStructure(this.StreamReader, this._TYPE_);
  }

  readFileMagic() {
    const Magic = this.bufferData.slice(0, 0x4).toString("hex");
    if (Magic.toUpperCase() != "9992CD90") {
      // showNotification(notificationsType.Warning, ErrorMessage.magicIncorrect)
      throw new Error(ErrorMessage.magicIncorrect);
    } else {
      return Magic;
    }
  }

  createFileTypeDataArray() {
    this.StreamReader = this.StreamReader.slice(0x40);
    const fileTypeDataArray = [];
    for (let i = 0; i < this.FileTypeCount; i++) {
      const fileTypeData = new FileTypeData(this.StreamReader);
      fileTypeDataArray.push(fileTypeData);
      this.StreamReader = this.StreamReader.slice(0x20);
    }
    return fileTypeDataArray;
  }

  skipSize(size: number) {
    this.StreamReader = this.StreamReader.slice(size);
  }

  createSubFileDataArray() {
    const subDataArray = [];
    for (let i = 0; i < this.FileCount; i++) {
      const subData = new SubData(this._TYPE_, this.StreamReader, this.BodyData);
      subDataArray.push(subData);
      this.StreamReader = this.StreamReader.slice(0x20);
    }
    return subDataArray;
  }

  // PS4 files are not stored in FileIndex order, so we sort them before use.
  getSortSubFileData() {
    return this.SubFileData.sort((a, b) => a.FileIndex - b.FileIndex);
  }
}

export class Fhm2dData {
  _TYPE_: Fhm2dType = Fhm2dType.Xboost;
  bufferData: Buffer;
  Magic: string;
  MetaSize: number;
  MetaCompSize: number;
  MetaCompData: Buffer;
  BodyCompData: Buffer;
  MetaData: Buffer;
  MetaHeader: number;
  FileTypeCount: number;
  FileCount: number;
  UnkCount: number;
  private StreamReader: Buffer;
  FileTypeData: FileTypeData[];
  SubFileData: SubData[];
  SubFileStructure: SubFileStructure[];
  constructor(buffer: Buffer) {
    this.bufferData = buffer;
    this.Magic = this.readFileMagic(); //0
    this.MetaSize = this.bufferData.readUInt32LE(0x18); //0x18
    this.MetaCompSize = this.bufferData.readUInt32LE(0x20); //0x20

    // Get the compression meta buffer
    this.MetaCompData = this.BodyCompData = this.bufferData.slice(0x30, 0x30 + this.MetaCompSize);

    // Get the compression body buffer
    this.BodyCompData = this.bufferData.slice(0x30 + this.MetaCompSize, this.bufferData.byteLength);

    // handle meta data
    // decompress first
    const decompressMeata = pako.inflateRaw(new Uint8Array(this.MetaCompData));
    this.MetaData = Buffer.from(decompressMeata);
    // get meta data info
    this.MetaHeader = this.MetaData.readUInt32LE(0);
    this.FileTypeCount = this.MetaData.readUInt32LE(0x18);
    this.FileCount = this.MetaData.readUInt32LE(0x1c);
    this.UnkCount = this.MetaData.readUInt32LE(0x20);
    this.StreamReader = this.MetaData;
    this.FileTypeData = this.createFileTypeDataArray();

    // Skip the data, and update StreamReader
    this.skipSize(0xc * this.FileCount);

    // Get each Sub file data info
    this.SubFileData = this.createSubFileDataArray();

    // Get file structure
    this.SubFileStructure = createSubFileStructure(this.StreamReader, this._TYPE_);
  }

  readFileMagic() {
    const Magic = this.bufferData.slice(0, 0x4).toString("hex");
    if (Magic.toUpperCase() != "B9B7B2CD") {
      // showNotification(notificationsType.Warning, ErrorMessage.magicIncorrect)
      throw new Error(ErrorMessage.magicIncorrect);
    } else {
      return Magic;
    }
  }

  createFileTypeDataArray() {
    this.StreamReader = this.StreamReader.slice(0x24);
    const fileTypeDataArray = [];
    for (let i = 0; i < this.FileTypeCount; i++) {
      const fileTypeData = new FileTypeData(this.StreamReader);
      fileTypeDataArray.push(fileTypeData);
      this.StreamReader = this.StreamReader.slice(0x20);
    }
    return fileTypeDataArray;
  }

  skipSize(size: number) {
    this.StreamReader = this.StreamReader.slice(size);
  }

  createSubFileDataArray() {
    const subDataArray = [];
    for (let i = 0; i < this.FileCount; i++) {
      const subData = new SubData(this._TYPE_, this.StreamReader, this.BodyCompData);
      subDataArray.push(subData);
      this.StreamReader = this.StreamReader.slice(subData._Length);
    }
    return subDataArray;
  }

  getSortSubFileData() {
    return this.SubFileData.sort((a, b) => a.FileIndex - b.FileIndex);
  }
}

class FileTypeData {
  FileType: number;
  FileTypeSize: number;
  FileCount: number;
  constructor(bufferData: Buffer) {
    this.FileType = bufferData.readUInt32LE(0);
    this.FileTypeSize = bufferData.readUInt32LE(0x10);
    this.FileCount = bufferData.readUInt32LE(0x1c);
  }
}

class SubData {
  StartOffset!: number;
  FileSize!: number;
  Unk1!: number;
  ChunkCount!: number;
  OriginChunkBinaryBuffer!: Buffer;
  FileIndex!: number;
  BufferData!: Buffer;
  CompBufferData!: { Size: number; IsCompressed: boolean; CompBufferData: Buffer }[];
  _Length!: number;
  _isNeedDeComp: boolean = true; // Some files contain compressed pages; others are stored as plain data.
  constructor(_TYPE_: Fhm2dType, meta: Buffer, body: Buffer) {
    if (_TYPE_ == Fhm2dType.PS4GundamVersus) {
      this.StartOffset = meta.readUInt32LE(0);
      this.FileSize = meta.readUInt32LE(0x8);
      this.Unk1 = meta.readUInt32LE(0x18);
      this.FileIndex = meta.readUInt32LE(0x1c);
      this.BufferData = body.slice(this.StartOffset, this.StartOffset + this.FileSize);
    } else if (_TYPE_ == Fhm2dType.Xboost) {
      this.CompBufferData = [];
      this.StartOffset = meta.readUInt32LE(0x20); //0x20 is start offset
      this.FileSize = meta.readUInt32LE(0x8);
      this.Unk1 = meta.readUInt32LE(0x18);
      this.ChunkCount = meta.readUInt32LE(0x1c);
      this.FileIndex = meta.readUInt32LE(0x28);

      // Xboost FHM2D splits each file payload into 0x10000-byte pages (the last page may be smaller).
      // A bitmap at 0x2C describes each page:
      // - bit = 1: this page is stored as raw deflate (inflateRaw)
      // - bit = 0: this page is stored as plain data and must be copied as-is
      //
      // `ChunkCount` is the number of compressed pages (number of 1-bits), not the total page count.
      const pageCount = Math.ceil(this.FileSize / 0x10000);
      const bitmapLength = Math.ceil(pageCount / 8);
      this.OriginChunkBinaryBuffer = meta.slice(0x2c, 0x2c + bitmapLength);

      if (this.ChunkCount > 0) {
        // Read compressed sizes table (one entry per compressed page).
        const eachChunkSizeStartOffset = 0x2c + bitmapLength;
        const compSizes: number[] = [];
        for (let i = 0; i < this.ChunkCount; i++) {
          compSizes.push(meta.readInt32LE(eachChunkSizeStartOffset + i * 0x8));
        }

        let offset = this.StartOffset;
        let compIndex = 0;
        for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
          const byteIndex = pageIndex >> 3;
          const bitInByte = pageIndex & 7;
          const flagByte = this.OriginChunkBinaryBuffer[byteIndex] ?? 0;
          const isCompressed = ((flagByte >> bitInByte) & 1) === 1;

          if (isCompressed) {
            const size = compSizes[compIndex++];
            if (typeof size !== "number" || size <= 0) {
              throw new Error(`Invalid compressed size at page ${pageIndex}: ${size}`);
            }
            this.CompBufferData.push({
              Size: size,
              IsCompressed: true,
              CompBufferData: body.slice(offset, offset + size),
            });
            offset += size;
          } else {
            const remaining = this.FileSize - pageIndex * 0x10000;
            const rawSize = Math.min(0x10000, remaining);
            this.CompBufferData.push({
              Size: rawSize,
              IsCompressed: false,
              CompBufferData: body.slice(offset, offset + rawSize),
            });
            offset += rawSize;
          }
        }

        if (compIndex !== this.ChunkCount) {
          throw new Error(`Compressed page count mismatch: expected ${this.ChunkCount}, used ${compIndex}`);
        }

        // Total meta entry length: header (0x2C) + bitmap + size table.
        this._Length = 0x2c + bitmapLength + 0x8 * this.ChunkCount;
      } else {
        // No compressed pages: the file is stored as plain data.
        this.CompBufferData.push({
          Size: this.FileSize,
          IsCompressed: false,
          CompBufferData: body.slice(this.StartOffset, this.StartOffset + this.FileSize),
        });
        this._Length = 0x2c;
        this._isNeedDeComp = false;
      }
    }
  }
}

interface SubFileStructure {
  type: "Folder" | "Item" | "EndMark";
  unk1?: string;
  folderCount?: number;
  fileIndex?: number;
  endMarkCount?: number;
  unk2?: string;
  unk3?: number;
  originalFileIndex?: number;
}

function createSubFileStructure(file: Buffer, _TYPE_: Fhm2dType): SubFileStructure[] {
  let Items: any = [];
  function loopingData(Data: Buffer, Offset = 0) {
    const TYPE = Data.readInt8(0);
    switch (TYPE) {
      case 0xa: {
        const item = {
          type: "Folder",
          unk1: Data.slice(0x1, 0x5).toString("hex"),
          folderCount: Data.readInt32LE(0x5),
          unk2: Data.slice(0x9, 0xd).toString("hex"),
          unk3: Data.readInt32LE(0x11),
          unk4: _TYPE_ == Fhm2dType.Xboost && Data.readInt32LE(0x19), // Only Xboost includes this field.
        };
        Items.push(item);
        if (_TYPE_ == Fhm2dType.Xboost) {
          Data = Data.slice(0x21);
        } else if (_TYPE_ == Fhm2dType.PS4GundamVersus) {
          Data = Data.slice(0x19);
        }
        loopingData(Data);
        break;
      }

      case 0: {
        const item = {
          type: "Item",
          unk1: Data.slice(0x1, 0x5).toString("hex"),
          fileIndex: Data.readInt32LE(0x5),
          unk2: Data.slice(0x9, 0xd).toString("hex"),
          unk3: Data.readInt32LE(0x11),
        };
        Items.push(item);
        Data = Data.slice(0x19);
        loopingData(Data);
        break;
      }
      case 0xb: {
        let endMarkCount = 0;
        let index = 0;
        let stop = false;
        while (!stop) {
          // File End
          if (Data.length == index) {
            stop = true;
            break;
          }
          if (Data.readInt8(index) == 0xb) {
            endMarkCount++;
            index++;
          } else {
            stop = true;
          }
        }
        const item = {
          type: "EndMark",
          endMarkCount: endMarkCount,
        };
        Items.push(item);
        Data = Data.slice(index);
        // File End
        if (Data.length != 0) {
          loopingData(Data);
        }
        break;
      }
      default:
        throw `${TYPE} is Not support`;
    }
  }

  let fileEndDataJson = [];
  loopingData(file);
  fileEndDataJson = Items;
  return fileEndDataJson;
}

function createFolderStructureXB(data: SubFileStructure[]) {
  const root: any = { name: "Root", children: [] };
  let currentFolder: any = root;
  const folderStack = [root];
  const folderCounts = [0];
  const fileCounts = [0];

  for (const item of data) {
    if (item.type === "Folder") {
      let folderName;
      folderName = `${folderCounts[folderCounts.length - 1]++}`;
      let unk1 = item.unk1 ?? undefined;
      let unk2 = item.unk2 ?? undefined;
      let unk3 = item.unk3 ?? undefined;

      const newFolder = {
        type: item.type,
        name: folderName,
        link: item.unk3 == 1 ? true : false,
        unk1,
        unk2,
        unk3,
        children: [],
      };
      currentFolder.children.push(newFolder);
      folderStack.push(currentFolder);
      currentFolder = newFolder;
      folderCounts.push(0);
      fileCounts.push(0);
    } else if (item.type === "Item") {
      let itemName;
      itemName = `${item.fileIndex}`;
      let unk1 = item.unk1 ?? undefined;
      let unk2 = item.unk2 ?? undefined;
      let unk3 = item.unk3 ?? undefined;
      currentFolder.children.push({
        type: item.type,
        name: itemName,
        link: item.unk3 == 1 ? true : false,
        unk1,
        unk2,
        unk3,
      });
    } else if (item.type === "EndMark") {
      for (let i = 0; i < item.endMarkCount!; i++) {
        currentFolder = folderStack.pop();
        folderCounts.pop();
      }

      fileCounts.pop();
    }
  }

  return root;
}

export enum ExtractType {
  SingleFolder = "single",
  FolderWithStructure = "structure",
}

/** Fewer IPC round-trips than per-file `plugin-fs` writeFile; chunk size caps single-invoke JSON size. */
const WRITE_FILES_BATCH_CHUNK_SIZE = 48;

interface WriteBatchFileWriteTiming {
  relativePath: string;
  /** Rust `fs::write` only (ms). */
  writeMs: number;
}

async function writeExtractedSubfilesBatch(
  outDir: string,
  entries: { relativePath: string; buffer: Buffer }[],
): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  for (let i = 0; i < entries.length; i += WRITE_FILES_BATCH_CHUNK_SIZE) {
    const chunk = entries.slice(i, i + WRITE_FILES_BATCH_CHUNK_SIZE);
    const files = chunk.map((e) => ({
      relativePath: e.relativePath,
      dataBase64: e.buffer.toString("base64"),
    }));
    const timings = await invoke<WriteBatchFileWriteTiming[]>("write_files_batch_base64", {
      baseDir: outDir,
      files,
    });
    for (const row of timings) {
      console.log(
        `[ExtractFHM] write file ${outDir}/${row.relativePath} ${row.writeMs.toFixed(2)}ms`
      );
    }
  }
}

function logExtractFhmStep(label: string, stepStart: number, extractStart: number): number {
  const now = performance.now();
  console.log(
    `[ExtractFHM] ${label}: +${(now - stepStart).toFixed(2)}ms (elapsed ${(now - extractStart).toFixed(2)}ms)`
  );
  return now;
}

/** Returned when Xboost extraction finishes; `namingError` is set if numdlb/nutexb naming failed but files were still written. */
export type ExtractFhmDataResult = {
  namingError?: string;
};

export async function ExtractFHMData(
  fhm2d: Fhm2dData | PS4FhmData,
  outDir: string,
  type: ExtractType,
  format?: Fhm2d_type_format,
  listOutputFileName?: string
): Promise<ExtractFhmDataResult> {
  if (fhm2d._TYPE_ == Fhm2dType.PS4GundamVersus) {
    throw new Error(ErrorMessage.notSupport);
  } else if (fhm2d._TYPE_ == Fhm2dType.Xboost) {
    const extractStart = performance.now();
    let stepAt = extractStart;
    // Write the extracted data.
    // We sort by FileIndex because the type list is defined in the header order,
    // while file records may not be stored in FileIndex order.
    // create list to store type
    let typeList = [];
    for (let i of fhm2d.FileTypeData) {
      for (let k = 0; k < i.FileCount; k++) {
        typeList.push(getFileType(i.FileType));
      }
    }
    const subFileData = fhm2d.getSortSubFileData();

    // Update file structure index
    fhm2d.SubFileStructure.forEach((e) => {
      if (e.type === "Item") {
        // Keep the original fileIndex so callers can map structure items back to file data.
        e.originalFileIndex = e.fileIndex;
      }
    });

    stepAt = logExtractFhmStep("setup type lists and structure index", stepAt, extractStart);

    const errorInfo: any = {};

    // Prepare output structure once for the whole extraction.
    // This avoids rewriting the JSON structure file for every subfile.
    const fileNameNoExt = await basename(outDir);
    if (type === ExtractType.SingleFolder) {
      const dirExists = await exists(outDir);
      if (!dirExists) {
        await mkdir(outDir, { recursive: true });
      }
    }

    stepAt = logExtractFhmStep("basename + ensure output directory", stepAt, extractStart);

    // Step 1: Decompress all files and store in memory
    const decompressedFiles: { index: number; buffer: Buffer }[] = [];
    for (let i = 0; i < subFileData.length; i++) {
      const sub = subFileData[i]!;
      let BufferData: Buffer;
      const decompressData: Uint8Array[] = [];
      if (sub._isNeedDeComp == false) {
        BufferData = sub.CompBufferData[0].CompBufferData;
      } else {
        try {
          sub.CompBufferData.forEach((chunk) => {
            if (!chunk.IsCompressed) {
              decompressData.push(new Uint8Array(chunk.CompBufferData));
              return;
            }
            const temp = pako.inflateRaw(new Uint8Array(chunk.CompBufferData));
            decompressData.push(temp);
          });
          BufferData = Buffer.concat(decompressData);
        } catch (error) {
          console.error("Error in ", i, typeList[i], "Offset", sub.StartOffset + "|" + sub.StartOffset.toString(16));
          BufferData = Buffer.alloc(0);
          sub.CompBufferData.forEach((chunk) => {
            BufferData = Buffer.concat([BufferData, chunk.CompBufferData]);
          });
          errorInfo[i] = {
            isError: true,
            originChunkCount: sub.ChunkCount,
            errorCompBufferData: sub.CompBufferData.map((e) => e.Size),
            errorOriginSize: sub.FileSize,
            OriginChunkBinaryBuffer: sub.OriginChunkBinaryBuffer,
          };
        }
      }
      decompressedFiles.push({ index: i, buffer: BufferData });
    }

    stepAt = logExtractFhmStep("decompress all subfiles", stepAt, extractStart);

    if (format === Fhm2d_type_format.fhm2d_msc && decompressedFiles.length !== 3) {
      throw new Error(`MSC extract: expected exactly 3 subfiles, got ${decompressedFiles.length}`);
    }

    if (type === ExtractType.SingleFolder) {
      // Step 2: Generate structure and apply naming logic
      const outputStructure = generateOutputStructure(fhm2d, typeList, fileNameNoExt, errorInfo);
      let finalStructure: any = outputStructure;

      try {
        switch (format) {
          case Fhm2d_type_format.fhm2d_character: {
            const rootDir = await dirname(outDir);

            // Create file data map from decompressed files (keyed by FileIndex)
            const fileDataMap = new Map<number, Uint8Array>();
            for (const fileData of decompressedFiles) {
              const fileIndex = subFileData[fileData.index]?.FileIndex ?? fileData.index;
              fileDataMap.set(fileIndex, new Uint8Array(fileData.buffer));
            }

            finalStructure = await applyNumdlbBaseNameToStructureObject(outputStructure, {
              rootDir,
              concurrency: 1,
              rewriteFileUrl: true,
              fileDataMap,
            });
            break;
          }
          case Fhm2d_type_format.fhm2d_all_nutexb: {
            // Create file data map from decompressed files (keyed by FileIndex)
            const fileDataMap = new Map<number, Uint8Array>();
            for (const fileData of decompressedFiles) {
              const fileIndex = subFileData[fileData.index]?.FileIndex ?? fileData.index;
              fileDataMap.set(fileIndex, new Uint8Array(fileData.buffer));
            }

            finalStructure = await applyNutexbInternalNameToStructureObject(outputStructure, {
              fileDataMap,
            });
            break;
          }
          case Fhm2d_type_format.fhm2d_stage_list: {
            finalStructure = { ...outputStructure };
            if (listOutputFileName && finalStructure.SubFileData?.[0]) {
              finalStructure.SubFileData[0].fileUrl = `.\\${fileNameNoExt}\\${listOutputFileName}`;
            }
            break;
          }
          case Fhm2d_type_format.fhm2d_character_param: {
            finalStructure = applyParamAssetNamesToStructureObject(outputStructure);
            break;
          }
          case Fhm2d_type_format.fhm2d_msc: {
            finalStructure = applyMscAssetNamesToStructureObject(outputStructure);
            break;
          }
          case Fhm2d_type_format.fhm2d_motion: {
            finalStructure = applyMotionAssetNamesToStructureObject(outputStructure, {
              sortedSubFileBuffers: decompressedFiles.map((d) => d.buffer),
              fileNameNoExt,
            });
            break;
          }
          default: {
            finalStructure = outputStructure;
            break;
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("FHM structure naming step failed:", errorMessage);
        finalStructure = {
          ...outputStructure,
          __namingError: errorMessage,
        };
      }

      stepAt = logExtractFhmStep("generate structure + apply naming", stepAt, extractStart);

      // Step 3: Sync fileBaseName from SubFileData to SubFileStructure Name field
      if (finalStructure.SubFileData && finalStructure.SubFileStructure) {
        // Create a map of fileIndex to fileBaseName
        const fileIndexToBaseName = new Map<number, string>();
        for (const subFileItem of finalStructure.SubFileData) {
          if (subFileItem.fileBaseName) {
            fileIndexToBaseName.set(subFileItem.fileIndex, subFileItem.fileBaseName);
          }
        }

        // Update SubFileStructure Name field
        for (const structureItem of finalStructure.SubFileStructure) {
          if (structureItem.type === 'Item' && structureItem.fileIndex !== undefined) {
            const baseName = fileIndexToBaseName.get(structureItem.fileIndex);
            if (baseName) {
              structureItem.Name = baseName;
            }
          }
        }
      }

      stepAt = logExtractFhmStep("sync structure base names", stepAt, extractStart);

      // Step 4: Write files via Rust batch (chunked invoke) — avoids N× plugin-fs IPC.
      const writeEntries: { relativePath: string; buffer: Buffer }[] = [];
      for (const fileData of decompressedFiles) {
        const structureItem = finalStructure.SubFileData.find((item: any) => item.index === fileData.index);
        if (structureItem && structureItem.fileUrl) {
          let relativePath: string;
          if (format === Fhm2d_type_format.fhm2d_motion) {
            relativePath = motionFileUrlToNestedRelativePath(
              String(structureItem.fileUrl),
              fileNameNoExt,
            );
          } else {
            const fileUrl = structureItem.fileUrl.replace(/^\.[\\/]/, "");
            const pathParts = fileUrl.split(/[\\/]/);
            const fileName = pathParts[pathParts.length - 1];
            if (!fileName) {
              throw new Error(`Invalid fileUrl for extraction: ${String(structureItem.fileUrl)}`);
            }
            relativePath = fileName;
          }
          writeEntries.push({ relativePath, buffer: fileData.buffer });
        } else {
          writeEntries.push({
            relativePath: `${fileData.index}${typeList[fileData.index]}`,
            buffer: fileData.buffer,
          });
        }
      }
      const writeStart = performance.now();
      await writeExtractedSubfilesBatch(outDir, writeEntries);
      console.log(
        `[ExtractFHM] write all subfiles (batched IPC, ${writeEntries.length} files): ${(performance.now() - writeStart).toFixed(2)}ms`
      );

      stepAt = logExtractFhmStep("write all subfiles", stepAt, extractStart);

      if (format === Fhm2d_type_format.fhm2d_motion && finalStructure.SubFileParseStructure) {
        const emptyDirStart = performance.now();
        await ensureEmptyFoldersFromSubFileParseStructure(outDir, finalStructure.SubFileParseStructure);
        console.log(
          `[ExtractFHM] motion empty folders: ${(performance.now() - emptyDirStart).toFixed(2)}ms`
        );
      }

      // Step 5: Write structure.json
      const structurePath = outDir + "_structure.json";
      const structureWriteStart = performance.now();
      await writeFile(structurePath, Buffer.from(JSON.stringify(finalStructure, null, 2)));
      console.log(
        `[ExtractFHM] write file ${structurePath} ${(performance.now() - structureWriteStart).toFixed(2)}ms`
      );

      console.log(`[ExtractFHM] total ExtractFHMData: ${(performance.now() - extractStart).toFixed(2)}ms`);

      const namingError =
        typeof finalStructure.__namingError === "string" ? finalStructure.__namingError : undefined;
      return { namingError };
    } else if (type === ExtractType.FolderWithStructure) {
      throw new Error(ErrorMessage.notSupport);
    }
    return {};
  }
  return {};
}

function generateOutputStructure(fhm2d: PS4FhmData | Fhm2dData, typeList: string[], fileNameNoExt: string, errorInfoMap: Record<number, any>) {
  return {
    Magic: fhm2d.MetaHeader,
    Fhm2dTotalCount: fhm2d.FileCount,
    UnkCount: fhm2d.UnkCount,
    SubFileData: fhm2d.SubFileData.map((e, i) => ({
      index: i,
      fileType: typeList[i],
      fileIndex: e.FileIndex,
      fileUrl: `.\\${fileNameNoExt}\\${i}${typeList[i]}`,
      ...(errorInfoMap[i] || {}),
    })),
    SubFileStructure: fhm2d.SubFileStructure,
    SubFileParseStructure: createFolderStructureXB(fhm2d.SubFileStructure),
  };
}

// Helper functions removed: bitmap length is derived from page count, not from counting 1-bits.
