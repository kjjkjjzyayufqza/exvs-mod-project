import { Buffer } from "buffer";
import { ErrorMessage } from "./error";
import pako from "pako";
import { invoke } from "@tauri-apps/api/core";

export enum Fhm2d_type_format {
  fhm2d_character = "fhm2d_character",
  fhm2d_all_nutexb = "fhm2d_all_nutexb",
  fhm2d_stage_list = "fhm2d_stage_list",
  fhm2d_character_param = "fhm2d_character_param",
  fhm2d_msc = "fhm2d_msc",
  fhm2d_motion = "fhm2d_motion",
  fhm2d_sound = "fhm2d_sound",
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
  /**
   * @deprecated Runtime extraction has migrated to Rust and currently does not support PS4/GVS.
   * Kept for legacy analysis paths only.
   */
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

/**
 * @deprecated Runtime extraction has migrated to Rust (`extract_fhm2d_to_folder` in `src-tauri/src/format/fhm2d.rs`).
 * Keep this class for legacy preview/debug scenarios only.
 */
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

/**
 * @deprecated Migrated to Rust parser flow in `src-tauri/src/format/fhm2d.rs`.
 * Kept for compatibility with legacy in-memory JS parsing.
 */
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

/**
 * @deprecated Migrated to Rust parse-tree construction in `src-tauri/src/format/fhm2d.rs`.
 * Kept for compatibility and historical reference.
 */
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

/** Returned when Xboost extraction finishes; `namingError` is set if numdlb/nutexb naming failed but files were still written. */
export type ExtractFhmDataResult = {
  namingError?: string;
};

export async function ExtractFHMData(
  sourcePath: string,
  outDir: string,
  type: ExtractType,
  format?: Fhm2d_type_format,
  listOutputFileName?: string,
  writeMetaBin?: boolean
): Promise<ExtractFhmDataResult> {
  if (!sourcePath || !sourcePath.trim()) {
    throw new Error("sourcePath is required for Rust-side extraction");
  }
  if (type !== ExtractType.SingleFolder) {
    throw new Error(ErrorMessage.notSupport);
  }
  return await invoke<ExtractFhmDataResult>("extract_fhm2d_to_folder", {
    sourcePath,
    outDir,
    format,
    listOutputFileName,
    writeMetaBin: writeMetaBin === true,
  });
}
