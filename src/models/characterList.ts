import { Buffer } from "buffer";
import { CommandsData } from "./commandsData";
import { notificationsType, showNotification } from "../module/notifications";
import { ErrorMessage } from "./error";

export enum MS_state_type {
  Enable = 1,
  Disable = 2,
}

export class characterList {
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
    const commandsEndOffset =
      0x20 + (this.CommandsCount * 0x4 + this.CommandsCount * 0xc);
    const commandsBuffer = buffer.slice(commandsStartOffset, commandsEndOffset);
    this.CommandsData = new CommandsData(commandsBuffer, this.CommandsCount);

    // Character info
    this.CharacterData = [];
    const CharacterIds: number[] = [];
    const id_padding = this.CharacterCount * 0x4;
    for (let i = 0; i < this.CharacterCount; i++) {
      const character_id_startOffset_buffer = this.bufferData.slice(
        0x20 + commandsBuffer.byteLength + i * 0x4
      );
      CharacterIds.push(character_id_startOffset_buffer.readInt32LE(0));

      const character_info_startOffset_buffer = this.bufferData.slice(
        0x20 + commandsBuffer.byteLength + id_padding + i * 0x13c
      );
      this.CharacterData.push(
        new CharacterData(
          this.bufferData,
          character_info_startOffset_buffer,
          CharacterIds[i]
        )
      );
    }
  }

  readFileMagic() {
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
  UnkId1: number; // 0x0
  UnkId2: number; // 0x4
  ms_igh_r: string; // 0xc
  ms_vs_r: string; // 0x10
  CharacterNameOffset: StringNameData; // 0x14
  UnkId3: number; // 0x1c
  UnkId4: number; // 0x20
  UnkId5: number; // 0x24
  ms_vs_l: string; // 0x28
  UnkId6: number; // 0x2c
  UnkHash1: string; // 0x30
  UnkHash2: string; // 0x3c
  UnkId7: number; // 0x40
  UnkStringOffset1: StringNameData; // 0x44
  UnkHash3: string; // 0x4c
  UnkHash4: string; // 0x50
  UnkStringOffset2: StringNameData; // 0x54
  UnkStringOffset3: StringNameData; // 0x5c
  UnkStringOffset4: StringNameData; // 0x68
  UnkStringOffset5: StringNameData; // 0x70
  UnkStringOffset6: StringNameData; // 0x7c
  UnkHash5: string; // 0x88
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
  MS_state: MS_state_type | number; // 0xc4
  UnkStringOffset9: StringNameData; // 0xc8
  UnkHash10: string; // 0xd0
  CharacterId_Unique: number; // 0xd4
  UnkStringOffset10: StringNameData; // 0xd8
  UnkId10: number; // 0xe0
  UnkStringOffset11: StringNameData; // 0xe4
  SelectPage_Pilot_LMB_HASH: string; // 0xec
  UnkHash11: string; // 0xf4
  ms_ms_l: string; // 0xf8
  vs_p_r: string; // 0xfc
  UnkStringOffset12: StringNameData; // 0x100
  EX_Pilot_LMB_HASH: string; // 0x108
  UnkStringOffset13: StringNameData; // 0x10c
  rnk_m_l: string; // 0x114
  ms_crs: string; // 0x11c
  UnkStringOffset14: StringNameData; // 0x120
  ms_ms_s: string; // 0x128
  vs_p_l: string; // 0x12c
  ms_mn: string; // 0x130
  sc_p: string; // 0x134

  constructor(buffer: Buffer, startBufferData: Buffer, CharacterId: number) {
    let StreamReader = startBufferData;

    this.CharacterId = CharacterId;
    this.UnkId1 = StreamReader.readInt32LE(0x4);
    this.UnkId2 = StreamReader.readInt32LE(0x8);
    this.ms_igh_r = StreamReader.slice(0xc, 0xc + 0x4).toString("hex");
    this.ms_vs_r = StreamReader.slice(0x10, 0x10 + 0x4).toString("hex");

    const nameOffset = StreamReader.readInt32LE(0x14);
    const sliceData = buffer.slice(nameOffset);
    this.CharacterNameOffset = new StringNameData(nameOffset, sliceData);

    this.UnkId3 = StreamReader.readInt32LE(0x1c);
    this.UnkId4 = StreamReader.readInt32LE(0x20);
    this.UnkId5 = StreamReader.readInt32LE(0x24);
    this.ms_vs_l = StreamReader.slice(0x28, 0x28 + 0x4).toString("hex");
    this.UnkId6 = StreamReader.readInt32LE(0x2c);
    this.UnkHash1 = StreamReader.slice(0x30, 0x30 + 0x4).toString("hex");
    this.UnkHash2 = StreamReader.slice(0x3c, 0x3c + 0x4).toString("hex");
    this.UnkId7 = StreamReader.readInt32LE(0x40);

    this.UnkStringOffset1 = new StringNameData(
      StreamReader.readInt32LE(0x44),
      sliceData
    );

    this.UnkHash3 = StreamReader.slice(0x4c, 0x4c + 0x4).toString("hex");
    this.UnkHash4 = StreamReader.slice(0x50, 0x50 + 0x4).toString("hex");

    this.UnkStringOffset2 = new StringNameData(
      StreamReader.readInt32LE(0x54),
      sliceData
    );

    this.UnkStringOffset3 = new StringNameData(
      StreamReader.readInt32LE(0x5c),
      sliceData
    );

    this.UnkStringOffset4 = new StringNameData(
      StreamReader.readInt32LE(0x68),
      sliceData
    );

    this.UnkStringOffset5 = new StringNameData(
      StreamReader.readInt32LE(0x70),
      sliceData
    );

    this.UnkStringOffset6 = new StringNameData(
      StreamReader.readInt32LE(0x7c),
      sliceData
    );

    this.UnkHash5 = StreamReader.slice(0x88, 0x88 + 0x4).toString("hex");
    this.SeriesId = StreamReader.slice(0x8c, 0x8c + 0x4).toString("hex");

    this.UnkStringOffset7 = new StringNameData(
      StreamReader.readInt32LE(0x90),
      sliceData
    );

    this.UnkStringOffset8 = new StringNameData(
      StreamReader.readInt32LE(0x98),
      sliceData
    );

    this.unkHash6 = StreamReader.slice(0xa0, 0xa0 + 0x4).toString("hex");
    this.MS_card_icon_index = StreamReader.readInt32LE(0xa4);
    this.UnkHash7 = StreamReader.slice(0xa8, 0xa8 + 0x4).toString("hex");
    this.UnkHash8 = StreamReader.slice(0xac, 0xac + 0x4).toString("hex");
    this.UnkId8 = StreamReader.readInt32LE(0xb0);
    this.UnkId9 = StreamReader.readInt32LE(0xb4);
    this.UnkHash9 = StreamReader.slice(0xb8, 0xb8 + 0x4).toString("hex");
    this.MS_state = StreamReader.readInt32LE(0xc4);

    this.UnkStringOffset9 = new StringNameData(
      StreamReader.readInt32LE(0xc8),
      sliceData
    );

    this.UnkHash10 = StreamReader.slice(0xd0, 0xd0 + 0x4).toString("hex");
    this.CharacterId_Unique = StreamReader.readInt32LE(0xd4);

    this.UnkStringOffset10 = new StringNameData(
      StreamReader.readInt32LE(0xd8),
      sliceData
    );

    this.UnkId10 = StreamReader.readInt32LE(0xe0);

    this.UnkStringOffset11 = new StringNameData(
      StreamReader.readInt32LE(0xe4),
      sliceData
    );

    this.SelectPage_Pilot_LMB_HASH = StreamReader.slice(
      0xec,
      0xec + 0x4
    ).toString("hex");

    this.UnkHash11 = StreamReader.slice(0xf4, 0xf4 + 0x4).toString("hex");
    this.ms_ms_l = StreamReader.slice(0xf8, 0xf8 + 0x4).toString("hex");
    this.vs_p_r = StreamReader.slice(0xfc, 0xfc + 0x4).toString("hex");

    this.UnkStringOffset12 = new StringNameData(
      StreamReader.readInt32LE(0x100),
      sliceData
    );

    this.EX_Pilot_LMB_HASH = StreamReader.slice(0x108, 0x108 + 0x4).toString(
      "hex"
    );

    this.UnkStringOffset13 = new StringNameData(
      StreamReader.readInt32LE(0x10c),
      sliceData
    );

    this.rnk_m_l = StreamReader.slice(0x114, 0x114 + 0x4).toString("hex");
    this.ms_crs = StreamReader.slice(0x11c, 0x11c + 0x4).toString("hex");

    this.UnkStringOffset14 = new StringNameData(
      StreamReader.readInt32LE(0x120),
      sliceData
    );

    this.ms_ms_s = StreamReader.slice(0x128, 0x128 + 0x4).toString("hex");
    this.vs_p_l = StreamReader.slice(0x12c, 0x12c + 0x4).toString("hex");
    this.ms_mn = StreamReader.slice(0x130, 0x130 + 0x4).toString("hex");
    this.sc_p = StreamReader.slice(0x134, 0x134 + 0x4).toString("hex");
  }
}

class StringNameData {
  Offset: number;
  StringBufferData: Buffer;
  constructor(nameOffset: number, stringBufferData: Buffer) {
    this.Offset = nameOffset;
    this.StringBufferData = stringNameReadToEnd(stringBufferData);
  }
}

// read to 0x00 is end
function stringNameReadToEnd(buffer: Buffer): Buffer {
  let result: Buffer = Buffer.alloc(0);
  for (let i of buffer) {
    if (i == 0) {
      break;
    } else {
      result = Buffer.concat([result, Buffer.from([i, 0])]); // add 0 in end
    }
  }
  return result;
}
