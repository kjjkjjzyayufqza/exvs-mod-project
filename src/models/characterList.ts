import { Buffer } from "buffer";
import { CommandsData } from "./commandsData";
import { notificationsType, showNotification } from "../module/notifications";
import { ErrorMessage } from "./error";
import { BaseDirectory, writeFile } from "@tauri-apps/plugin-fs";

export enum MS_state_type {
  Enable = 1,
  Disable = 2,
}

export class CharacterList {
  bufferData: Buffer;
  Magic: string;
  FileSzie: number;
  CharacterCount: number;
  CommandsCount: number; // start in 0x20, each is 0x4, can search in exe
  CharacterInfoEachSize: number; // each character info size
  CommandsData: CommandsData;
  CharacterData: CharacterData[];
  constructor(buffer: Buffer) {
    this.bufferData = buffer;
    this.Magic = this.readFileMagic();
    this.FileSzie = buffer.readInt32LE(0x8);
    this.CharacterCount = buffer.readInt32LE(0x10);
    this.CommandsCount = buffer.readInt32LE(0x14);
    this.CharacterInfoEachSize = buffer.readInt32LE(0x18);

    // commands
    const commandsStartOffset = 0x20;
    const commandsEndOffset = 0x20 + (this.CommandsCount * 0x4 + this.CommandsCount * 0xc);
    const commandsBuffer = buffer.slice(commandsStartOffset, commandsEndOffset);
    this.CommandsData = new CommandsData(commandsBuffer, this.CommandsCount);

    // Character info
    this.CharacterData = [];
    const CharacterIds: number[] = [];
    const id_padding = this.CharacterCount * 0x4;
    for (let i = 0; i < this.CharacterCount; i++) {
      const character_id_startOffset_buffer = this.bufferData.slice(0x20 + commandsBuffer.byteLength + i * 0x4);
      CharacterIds.push(character_id_startOffset_buffer.readInt32LE(0));

      const character_info_startOffset_buffer = this.bufferData.slice(0x20 + commandsBuffer.byteLength + id_padding + i * 0x13c);
      this.CharacterData.push(new CharacterData(this.bufferData, character_info_startOffset_buffer, CharacterIds[i]));
    }
  }

  readFileMagic(): string {
    const Magic = this.bufferData.slice(0, 0x4).toString("hex");
    if (Magic.toUpperCase() != "A9B8ABCD") {
      showNotification(notificationsType.Warning, ErrorMessage.magicIncorrect);
      throw new Error(ErrorMessage.magicIncorrect);
    } else {
      return Magic;
    }
  }
}

export class CharacterData {
  CharacterId: number; // id
  UnkId0: number; // 0x0
  UnkId1: number; // 0x4
  UnkId2: number; // 0x8
  ms_igh_r: string; // 0xc
  ms_vs_r: string; // 0x10
  CharacterNameOffset: StringNameData; // 0x14
  UnkId3: number; // 0x1c
  UnkId4: number; // 0x20
  UnkId5: number; // 0x24
  ms_vs_l: string; // 0x28
  UnkId6: number; // 0x2c
  UnkHash1: string; // 0x30
  UnkHash1_1: string; // 0x38
  UnkHash2: string; // 0x3c
  UnkId7: number; // 0x40
  UnkStringOffset1: StringNameData; // 0x44
  pilotID: string; // 0x4c
  LMBCutIn: string; // 0x50
  UnkStringOffset2: StringNameData; // 0x54
  UnkStringOffset3: StringNameData; // 0x5c
  UnkStringOffset4: StringNameData; // 0x68
  UnkStringOffset5: StringNameData; // 0x70
  UnkStringOffset6: StringNameData; // 0x7c
  UnkHash_2_1: string; // 0x84
  LMBBoost: string; // 0x88
  SeriesId: string; // 0x8c
  UnkStringOffset7: StringNameData; // 0x90
  UnkStringOffset8: StringNameData; // 0x98
  unkHash6: string; // 0xa0
  MS_card_icon_index: number; // 0xa4
  UnkHash7: string; // 0xa8
  UnkHash8: string; // 0xac
  UnkId8: number; // 0xb0
  UnkId9: number; // 0xb4
  UnkHash9: string; // 0xb8
  UnkHash9_1: string; // 0xbc
  UnkId9_1: number; // 0xc0
  MS_state: MS_state_type | number; // 0xc4
  UnkStringOffset9: StringNameData; // 0xc8
  UnkHash10: string; // 0xd0
  CharacterId_Unique: number; // 0xd4
  UnkStringOffset10: StringNameData; // 0xd8
  UnkId10: number; // 0xe0
  UnkStringOffset11: StringNameData; // 0xe4
  SelectPage_Pilot_LMB_HASH: string; // 0xec
  UnkId11: number; // 0xf0
  UnkHash11: string; // 0xf4
  ms_ms_l: string; // 0xf8
  vs_p_r: string; // 0xfc
  UnkStringOffset12: StringNameData; // 0x100
  EX_Pilot_LMB_HASH: string; // 0x108
  UnkStringOffset13: StringNameData; // 0x10c
  rnk_m_l: string; // 0x114
  UnkId11_1: number; // 0x118
  ms_crs: string; // 0x11c
  UnkStringOffset14: StringNameData; // 0x120
  ms_ms_s: string; // 0x128
  vs_p_l: string; // 0x12c
  ms_mn: string; // 0x130
  sc_p: string; // 0x134
  UnkId12: number; // 0x138

  constructor(buffer: Buffer, startBufferData: Buffer, CharacterId: number) {
    let StreamReader = startBufferData;

    this.CharacterId = CharacterId;
    this.UnkId0 = StreamReader.readInt32LE(0x0);
    this.UnkId1 = StreamReader.readInt32LE(0x4);
    this.UnkId2 = StreamReader.readInt32LE(0x8);
    this.ms_igh_r = StreamReader.slice(0xc, 0xc + 0x4).toString("hex");
    this.ms_vs_r = StreamReader.slice(0x10, 0x10 + 0x4).toString("hex");

    const nameOffset = StreamReader.readInt32LE(0x14);
    this.CharacterNameOffset = new StringNameData(nameOffset, buffer);

    this.UnkId3 = StreamReader.readInt32LE(0x1c);
    this.UnkId4 = StreamReader.readInt32LE(0x20);
    this.UnkId5 = StreamReader.readInt32LE(0x24);
    this.ms_vs_l = StreamReader.slice(0x28, 0x28 + 0x4).toString("hex");
    this.UnkId6 = StreamReader.readInt32LE(0x2c);
    this.UnkHash1 = StreamReader.slice(0x30, 0x30 + 0x4).toString("hex");
    this.UnkHash1_1 = StreamReader.slice(0x38, 0x38 + 0x4).toString("hex");
    this.UnkHash2 = StreamReader.slice(0x3c, 0x3c + 0x4).toString("hex");
    this.UnkId7 = StreamReader.readInt32LE(0x40);

    this.UnkStringOffset1 = new StringNameData(StreamReader.readInt32LE(0x44), buffer);

    this.pilotID = StreamReader.slice(0x4c, 0x4c + 0x4).toString("hex");
    this.LMBCutIn = StreamReader.slice(0x50, 0x50 + 0x4).toString("hex");

    this.UnkStringOffset2 = new StringNameData(StreamReader.readInt32LE(0x54), buffer);

    this.UnkStringOffset3 = new StringNameData(StreamReader.readInt32LE(0x5c), buffer);

    this.UnkStringOffset4 = new StringNameData(StreamReader.readInt32LE(0x68), buffer);

    this.UnkStringOffset5 = new StringNameData(StreamReader.readInt32LE(0x70), buffer);

    this.UnkStringOffset6 = new StringNameData(StreamReader.readInt32LE(0x7c), buffer);

    this.UnkHash_2_1 = StreamReader.slice(0x84, 0x84 + 0x4).toString("hex");
    this.LMBBoost = StreamReader.slice(0x88, 0x88 + 0x4).toString("hex");
    this.SeriesId = StreamReader.slice(0x8c, 0x8c + 0x4).toString("hex");

    this.UnkStringOffset7 = new StringNameData(StreamReader.readInt32LE(0x90), buffer);

    this.UnkStringOffset8 = new StringNameData(StreamReader.readInt32LE(0x98), buffer);

    this.unkHash6 = StreamReader.slice(0xa0, 0xa0 + 0x4).toString("hex");
    this.MS_card_icon_index = StreamReader.readInt32LE(0xa4);
    this.UnkHash7 = StreamReader.slice(0xa8, 0xa8 + 0x4).toString("hex");
    this.UnkHash8 = StreamReader.slice(0xac, 0xac + 0x4).toString("hex");
    this.UnkId8 = StreamReader.readInt32LE(0xb0);
    this.UnkId9 = StreamReader.readInt32LE(0xb4);
    this.UnkHash9 = StreamReader.slice(0xb8, 0xb8 + 0x4).toString("hex");
    this.UnkHash9_1 = StreamReader.slice(0xbc, 0xbc + 0x4).toString("hex");
    this.UnkId9_1 = StreamReader.readInt32LE(0xc0);
    this.MS_state = StreamReader.readInt32LE(0xc4);

    this.UnkStringOffset9 = new StringNameData(StreamReader.readInt32LE(0xc8), buffer);

    this.UnkHash10 = StreamReader.slice(0xd0, 0xd0 + 0x4).toString("hex");
    this.CharacterId_Unique = StreamReader.readInt32LE(0xd4);

    this.UnkStringOffset10 = new StringNameData(StreamReader.readInt32LE(0xd8), buffer);

    this.UnkId10 = StreamReader.readInt32LE(0xe0);

    this.UnkStringOffset11 = new StringNameData(StreamReader.readInt32LE(0xe4), buffer);

    this.SelectPage_Pilot_LMB_HASH = StreamReader.slice(0xec, 0xec + 0x4).toString("hex");
    this.UnkId11 = StreamReader.readInt32LE(0xf0);
    this.UnkHash11 = StreamReader.slice(0xf4, 0xf4 + 0x4).toString("hex");
    this.ms_ms_l = StreamReader.slice(0xf8, 0xf8 + 0x4).toString("hex");
    this.vs_p_r = StreamReader.slice(0xfc, 0xfc + 0x4).toString("hex");

    this.UnkStringOffset12 = new StringNameData(StreamReader.readInt32LE(0x100), buffer);

    this.EX_Pilot_LMB_HASH = StreamReader.slice(0x108, 0x108 + 0x4).toString("hex");

    this.UnkStringOffset13 = new StringNameData(StreamReader.readInt32LE(0x10c), buffer);

    this.rnk_m_l = StreamReader.slice(0x114, 0x114 + 0x4).toString("hex");
    this.UnkId11_1 = StreamReader.readInt32LE(0x118);
    this.ms_crs = StreamReader.slice(0x11c, 0x11c + 0x4).toString("hex");

    this.UnkStringOffset14 = new StringNameData(StreamReader.readInt32LE(0x120), buffer);

    this.ms_ms_s = StreamReader.slice(0x128, 0x128 + 0x4).toString("hex");
    this.vs_p_l = StreamReader.slice(0x12c, 0x12c + 0x4).toString("hex");
    this.ms_mn = StreamReader.slice(0x130, 0x130 + 0x4).toString("hex");
    this.sc_p = StreamReader.slice(0x134, 0x134 + 0x4).toString("hex");
    this.UnkId12 = StreamReader.readInt32LE(0x138);
  }
}

class StringNameData {
  Offset: number;
  StringBufferData: Buffer;
  constructor(nameOffset: number, stringBufferData: Buffer) {
    this.Offset = nameOffset;
    this.StringBufferData = stringNameReadToEnd(nameOffset, stringBufferData);
  }
}

// read to 0x00 is end, remark we need add 0x00 at end
function stringNameReadToEnd(startOffset: number, buffer: Buffer): Buffer {
  // let buffer slice from startOffset to end
  let result: Buffer = Buffer.alloc(0);
  let sliceBuffer = buffer.slice(startOffset);
  for (let i of sliceBuffer) {
    if (i == 0) {
      result = Buffer.concat([result, Buffer.from([0])]); // add 0 in end
      break;
    } else {
      result = Buffer.concat([result, Buffer.from([i])]); // add 0 in end
    }
  }
  return result;
}

export function CharacterListOutPut(characterList: CharacterList, path: string) {
  //write the file
  const outputFileName = path + "/test.bin";
  let headerBuffer = Buffer.alloc(0x20);
  // write magic, convert string to buffer eg "A9B8ABCD" to 0xA9 0xB8 0xAB 0xCD
  headerBuffer.write(characterList.Magic, 0x0, 0, "hex");
  headerBuffer.writeInt32LE(0, 0x4);
  headerBuffer.writeInt32LE(0, 0x8); //file size
  headerBuffer.writeInt32LE(0, 0xc);
  headerBuffer.writeInt32LE(characterList.CharacterData.length, 0x10);
  headerBuffer.writeInt32LE(characterList.CommandsCount, 0x14);
  headerBuffer.writeInt32LE(characterList.CharacterInfoEachSize, 0x18);
  headerBuffer.writeInt32LE(0, 0x1c);

  const commandsBuffer = Buffer.alloc(characterList.CommandsCount * 0x4 + characterList.CommandsCount * 0xc);
  for (let i = 0; i < characterList.CommandsCount; i++) {
    // write the buffer
    commandsBuffer.writeInt32LE(characterList.CommandsData.CommandsId[i].readInt32LE(0), i * 0x4);
  }
  const commandsDataOffset = characterList.CommandsCount * 0x4;
  for (let i = 0; i < characterList.CommandsCount; i++) {
    // write the buffer characterList.CommandsData.CommandsData[i] to commandsBuffer
    characterList.CommandsData.CommandsData[i].copy(commandsBuffer, commandsDataOffset + i * 0xc);
  }

  let unitIdBuffer = Buffer.alloc(characterList.CharacterData.length * 4);
  for (let i = 0; i < characterList.CharacterData.length; i++) {
    unitIdBuffer.writeInt32LE(characterList.CharacterData[i].CharacterId, i * 0x4);
  }

  //create a visual file buffer size for calculate the name offset
  //the visualBuffer will end when the character data end
  let visualBuffer = Buffer.alloc(0x20 + characterList.CommandsCount * 0x4 + characterList.CommandsCount * 0xc + characterList.CharacterData.length * 0x4 + characterList.CharacterData.length * 0x13c);

  //create the name buffer
  let stringNameDataBuffer = Buffer.alloc(0);

  // write the character data
  let unitDataBuffer = Buffer.alloc(characterList.CharacterData.length * 0x13c);
  for (let i = 0; i < characterList.CharacterData.length; i++) {
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId0, i * 0x13c + 0x0);
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId1, i * 0x13c + 0x4);
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId2, i * 0x13c + 0x8);
    unitDataBuffer.write(characterList.CharacterData[i].ms_igh_r, i * 0x13c + 0xc, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].ms_vs_r, i * 0x13c + 0x10, 0x4, "hex");

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0x14);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].CharacterNameOffset.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].CharacterNameOffset.StringBufferData]);

    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId3, i * 0x13c + 0x1c);
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId4, i * 0x13c + 0x20);
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId5, i * 0x13c + 0x24);
    unitDataBuffer.write(characterList.CharacterData[i].ms_vs_l, i * 0x13c + 0x28, 0x4, "hex");
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId6, i * 0x13c + 0x2c);
    unitDataBuffer.write(characterList.CharacterData[i].UnkHash1, i * 0x13c + 0x30, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].UnkHash1_1, i * 0x13c + 0x38, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].UnkHash2, i * 0x13c + 0x3c, 0x4, "hex");
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId7, i * 0x13c + 0x40);

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0x44);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset1.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset1.StringBufferData]);

    unitDataBuffer.write(characterList.CharacterData[i].pilotID, i * 0x13c + 0x4c, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].LMBCutIn, i * 0x13c + 0x50, 0x4, "hex");

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0x54);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset2.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset2.StringBufferData]);

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0x5c);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset3.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset3.StringBufferData]);

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0x68);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset4.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset4.StringBufferData]);

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0x70);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset5.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset5.StringBufferData]);

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0x7c);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset6.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset6.StringBufferData]);

    unitDataBuffer.write(characterList.CharacterData[i].UnkHash_2_1, i * 0x13c + 0x84, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].LMBBoost, i * 0x13c + 0x88, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].SeriesId, i * 0x13c + 0x8c, 0x4, "hex");

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0x90);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset7.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset7.StringBufferData]);

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0x98);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset8.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset8.StringBufferData]);

    unitDataBuffer.write(characterList.CharacterData[i].unkHash6, i * 0x13c + 0xa0, 0x4, "hex");
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].MS_card_icon_index, i * 0x13c + 0xa4);
    unitDataBuffer.write(characterList.CharacterData[i].UnkHash7, i * 0x13c + 0xa8, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].UnkHash8, i * 0x13c + 0xac, 0x4, "hex");
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId8, i * 0x13c + 0xb0);
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId9, i * 0x13c + 0xb4);
    unitDataBuffer.write(characterList.CharacterData[i].UnkHash9, i * 0x13c + 0xb8, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].UnkHash9_1, i * 0x13c + 0xbc, 0x4, "hex");
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId9_1, i * 0x13c + 0xc0);
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].MS_state, i * 0x13c + 0xc4);

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0xc8);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset9.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset9.StringBufferData]);

    unitDataBuffer.write(characterList.CharacterData[i].UnkHash10, i * 0x13c + 0xd0, 0x4, "hex");
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].CharacterId_Unique, i * 0x13c + 0xd4);

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0xd8);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset10.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset10.StringBufferData]);

    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId10, i * 0x13c + 0xe0);

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0xe4);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset11.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset11.StringBufferData]);

    unitDataBuffer.write(characterList.CharacterData[i].SelectPage_Pilot_LMB_HASH, i * 0x13c + 0xec, 0x4, "hex");
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId11, i * 0x13c + 0xf0);
    unitDataBuffer.write(characterList.CharacterData[i].UnkHash11, i * 0x13c + 0xf4, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].ms_ms_l, i * 0x13c + 0xf8, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].vs_p_r, i * 0x13c + 0xfc, 0x4, "hex");

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0x100);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset12.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset12.StringBufferData]);

    unitDataBuffer.write(characterList.CharacterData[i].EX_Pilot_LMB_HASH, i * 0x13c + 0x108, 0x4, "hex");

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0x10c);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset13.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset13.StringBufferData]);

    unitDataBuffer.write(characterList.CharacterData[i].rnk_m_l, i * 0x13c + 0x114, 0x4, "hex");
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId11_1, i * 0x13c + 0x118);
    unitDataBuffer.write(characterList.CharacterData[i].ms_crs, i * 0x13c + 0x11c, 0x4, "hex");

    // stringNameData offset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, i * 0x13c + 0x120);
    visualBuffer = Buffer.concat([visualBuffer, characterList.CharacterData[i].UnkStringOffset14.StringBufferData]);
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, characterList.CharacterData[i].UnkStringOffset14.StringBufferData]);

    unitDataBuffer.write(characterList.CharacterData[i].ms_ms_s, i * 0x13c + 0x128, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].vs_p_l, i * 0x13c + 0x12c, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].ms_mn, i * 0x13c + 0x130, 0x4, "hex");
    unitDataBuffer.write(characterList.CharacterData[i].sc_p, i * 0x13c + 0x134, 0x4, "hex");
    unitDataBuffer.writeInt32LE(characterList.CharacterData[i].UnkId12, i * 0x13c + 0x138);
  }

  const outBuffer = Buffer.concat([headerBuffer, commandsBuffer, unitIdBuffer, unitDataBuffer, stringNameDataBuffer]);

  //update file size
  outBuffer.writeInt32LE(outBuffer.byteLength, 0x8);

  writeFile(outputFileName, outBuffer, { baseDir: BaseDirectory.AppLocalData })
    .then((e) => {
      console.log("write file success");
    })
    .catch((err) => {
      console.error(err);
    });
}
