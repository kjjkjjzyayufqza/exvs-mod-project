import { notifications } from "@mantine/notifications";
import { Buffer } from "buffer";

export interface UnkIdDataModel {
  Id: number;
  Unk: number;
  Item: number;
}

export class UintIdDataClass {
  // UnkNumber: number; //0x0
  // UnkNumber2: number; //0x4
  // ms_igh_r: string; //0xC
  // ms_vs_r: string; //0x10
  // NameIndex: number; //0x14
  // UnkNumber3 : number; //0x1C
  // UnkNumber4 : number; //0x20
  // UnkNumber5 : number; //0x24
  // ms_vs_l: string; //0x28
  // UnkNumber6 : number; //0x2c
  // UnkNumber7 : number; //0x40

  // series : GundamSeries //0x8C

  // ms_card : number; // 0xA4

  // available : "hidden" | true | false; //0xC4

  index: number; //0xD4
  constructor(index: number) {
    this.index = index;
  }
}

export interface UintIdDataModel {
  Id: number;
  Data: UintIdDataClass;
}

export class unitSelectListClass {
  Magic: string;
  FileSize: number;
  UintIdCount: number;
  UnkIdCount: number;
  UintSize: number;

  UnkIdData: UnkIdDataModel[];
  private UnkIdIndexDataEachSize: number = 0xc;
  UnkIdIndexData: number[];

  UintIdData: UintIdDataModel[];

  StringData: number[];

  constructor(
    magic: string,
    fileSize: number,
    uintIdcount: number,
    unkIdCount: number,
    uintSize: number,
    unkIdData: UnkIdDataModel[],
    unkIdIndexData: number[],
    uintIdData: UintIdDataModel[],
    stringData: number[]
  ) {
    this.Magic = magic;
    this.FileSize = fileSize;
    this.UintIdCount = uintIdcount;
    this.UnkIdCount = unkIdCount;
    this.UintSize = uintSize;
    this.UnkIdData = unkIdData;
    this.UnkIdIndexData = unkIdIndexData;
    this.UintIdData = uintIdData;
    this.StringData = stringData;
  }
}

export function readUnitSelectList(stream: Buffer) {
  const bufferReader: Buffer = stream;
  const FileMagic: string = bufferReader
    .readUInt32BE(0)
    .toString(16)
    .toUpperCase();
  const FileSize: number = bufferReader.readUInt32LE(0x8);
  let offset = 0;
  if (FileMagic !== "A9B8ABCD") {
    notifications.show({
      title: "Default notification",
      message: "Invalid file magic. Expected: A9B8ABCD",
      color: "red",
    });
  }

  const UintIdCount = bufferReader.readUInt32LE(0x10);
  const UnkIdCount = bufferReader.readUInt32LE(0x14);
  const UintSize = bufferReader.readUInt32LE(0x18);
  let UnkIdIndexData: number[] = [];
  for (let i = 0; i < UnkIdCount; i++) {
    UnkIdIndexData.push(bufferReader.readUInt32BE(0x20 + i * 0x4));
  }
  offset = 0x20 + UnkIdCount * 0x4;
  let UnkIdData: UnkIdDataModel[] = [];
  for (let i = 0; i < UnkIdCount; i++) {
    const UnkIdBuffer = bufferReader.slice(offset + i * 0xc);
    const Id = UnkIdBuffer.readUInt32LE(0);
    const Unk = UnkIdBuffer.readUInt32LE(0x4);
    const Item = UnkIdBuffer.readUInt32LE(0x8);
    UnkIdData.push({ Id, Unk, Item });
  }
  offset = offset + UnkIdCount * 0xc;

  let UintIdData: UintIdDataModel[] = [];
  for (let i = 0; i < UintIdCount; i++) {
    const UintIdData_ID_Reader = bufferReader.slice(offset + i * 0x4);
    const UintIdData_Data_Reader = bufferReader.slice((offset + UintIdCount * 0x4) + i * UintSize);

    UintIdData.push({
      Id: UintIdData_ID_Reader.readInt32LE(0),
      Data: new UintIdDataClass(UintIdData_Data_Reader.readInt32LE(0xd4)),
    });
  }
  offset = offset + UintIdCount * 0x4;
  offset = offset + UintIdCount * 0x13c;

  let StringData: number[] = [];
  const stringDataBuffer: Buffer = bufferReader.slice(offset);
  for (let i = 0; i < stringDataBuffer.byteLength; i++) {
    StringData.push(stringDataBuffer.readUInt8(i));
  }

  const uintObject: unitSelectListClass = new unitSelectListClass(
    FileMagic,
    FileSize,
    UintIdCount,
    UnkIdCount,
    UintSize,
    UnkIdData,
    UnkIdIndexData,
    UintIdData,
    StringData
  );
  console.log(uintObject);

  return uintObject;
}
