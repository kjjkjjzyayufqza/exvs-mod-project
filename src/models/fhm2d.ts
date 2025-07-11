import { Buffer } from "buffer";
import { ErrorMessage } from "./error";
import pako from "pako";
import { writeFile, mkdir, exists } from "@tauri-apps/plugin-fs";
import { path } from "@tauri-apps/api";
import { basename } from "@tauri-apps/api/path";
import { toast } from "sonner";

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

  // 因为 PS4的文件不是按照FileIndex来进行排序的，所以这样要这样处理
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
      this.StreamReader = this.StreamReader.slice(subData._Length); //需要特殊处理
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
  CompBufferData!: { Size: number; CompBufferData: Buffer }[];
  _Length!: number;
  _isNeedDeComp: boolean = true; //有些文件本身没有经过压缩
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
      this.OriginChunkBinaryBuffer = readChunkBinaryToEnd(meta, 0x2c, this.ChunkCount);

      let BINARY_COUNT = 0;
      if (this.ChunkCount > 0) {
        let chunkPaddingStartOffset = 0x2c;
        let padding = 0;
        let temp = 0;
        while (BINARY_COUNT != this.ChunkCount) {
          temp = meta.readUInt8(chunkPaddingStartOffset + padding);
          padding++;
          BINARY_COUNT += countOnesInBinary(temp);
        }

        const eachChunkSizeStartOffset = 0x2c + padding;
        let offset: number = this.StartOffset;
        for (let i = 0; i < this.ChunkCount; i++) {
          const Size = meta.readInt32LE(eachChunkSizeStartOffset + i * 0x8);
          this.CompBufferData.push({
            Size: Size,
            CompBufferData: body.slice(offset, offset + Size),
          });
          offset += Size;
        }
        // 获取整个块信息的大小
        this._Length = 0x2c + padding + 0x8 * this.ChunkCount;
      }
      if (this.ChunkCount == 0) {
        //假如没有chunk的话，那么就是没有经过压缩的文件，那直接获取这个文件的大小就可以了

        this.CompBufferData.push({
          Size: this.FileSize,
          CompBufferData: body.slice(this.StartOffset, this.StartOffset + this.FileSize),
        });
        // 获取整个块信息的大小
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
          unk4: _TYPE_ == Fhm2dType.Xboost && Data.readInt32LE(0x19), // 只有XB 才有这个
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

export function ExtractFHMData(fhm2d: Fhm2dData | PS4FhmData, outDir: string, type: ExtractType) {
  if (fhm2d._TYPE_ == Fhm2dType.PS4GundamVersus) {
    throw new Error(ErrorMessage.notSupport);
  } else if (fhm2d._TYPE_ == Fhm2dType.Xboost) {
    //2. write the data
    //2.1 为什么要getSortSubFileData，因为fhm2中记录文件类型的是在头部，比如第一个文件类型是0(.bin)，但是在下面每个文件记录的信息里
    //他可以是不按顺序排序的，所以我们需要sort一下，然后按顺序写入类型
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
        // 这里是让每个文件的index和文件名一致
        e.originalFileIndex = e.fileIndex;
      }
    });

    const errorInfo: any = {};
    subFileData.forEach(async (sub, i) => {
      //解压 Chunk
      let BufferData: Buffer;
      let decompressData: Uint8Array[] = [];
      if (sub._isNeedDeComp == false) {
        BufferData = sub.CompBufferData[0].CompBufferData;
      } else {
        try {
          sub.CompBufferData.map((_e, subIndex) => {
            let temp = pako.inflateRaw(_e.CompBufferData);
            decompressData.push(temp);
          });
          BufferData = Buffer.concat(decompressData);
        } catch (error) {
          console.error("Error in ", i, typeList[i], "Offset", sub.StartOffset + "|" + sub.StartOffset.toString(16));
          BufferData = Buffer.alloc(0);
          sub.CompBufferData.map((_e) => {
            BufferData = Buffer.concat([BufferData, _e.CompBufferData]);
          });
          //update the sub, update isError = true
          errorInfo[i] = {
            isError: true,
            originChunkCount: sub.ChunkCount,
            errorCompBufferData: sub.CompBufferData.map((e) => e.Size),
            errorOriginSize: sub.FileSize,
            OriginChunkBinaryBuffer: sub.OriginChunkBinaryBuffer,
          };
        }
      }
      if (type === ExtractType.SingleFolder) {
        const outputPath = `${outDir}/${i}${typeList[i]}`;
        const fileNameNoExt = await basename(outDir);
        const outputStructure = generateOutputStructure(fhm2d, typeList, fileNameNoExt, {});

        //if path not exists, create the path
        const dirExists = await exists(outDir);
        if (!dirExists) {
          await mkdir(outDir, { recursive: true });
        }

        //write json_structure
        writeFile(outDir + "_structure.json", Buffer.from(JSON.stringify(outputStructure, null, 2)))
          .then(() => {
            console.log("write file", outDir + "_structure.json");
          })
          .catch((err) => {
            console.log("write file error", err);
          });

        writeFile(outputPath, BufferData)
          .then(() => {
            console.log("write file", outputPath);
          })
          .catch((err) => {
            console.log("write file error", err);
          });
      } else if (type === ExtractType.FolderWithStructure) {
        throw new Error(ErrorMessage.notSupport);
        //type 2
        //if fileNameNoExt not exists, we create
        // if (!fs.existsSync(path.join(fileNameNoExt))) {
        //   fs.mkdirSync(path.join(fileNameNoExt));
        // }
        // createFoldersAndFilesFromJsonWithBuffer(extractFolderStructure, `${fileNameNoExt}`, i, `/${i}${typeList[i]}`, BufferData);
      }
    });
  }
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

function countOnesInBinary(num: number): number {
  // 将十进制数字转换为二进制字符串
  const binaryString: string = num.toString(2);

  // 使用正则表达式匹配二进制字符串中的所有1，并计算其个数
  const onesCount: number = (binaryString.match(/1/g) || []).length;

  return onesCount;
}

function readChunkBinaryToEnd(meta: Buffer, offset: number, chunkCount: number): Buffer {
  let padding = 0;
  let temp = 0;
  let BINARY_COUNT = 0;
  while (BINARY_COUNT != chunkCount) {
    temp = meta.readUInt8(offset + padding);
    padding++;
    BINARY_COUNT += countOnesInBinary(temp);
  }
  return meta.slice(offset, offset + padding);
}
