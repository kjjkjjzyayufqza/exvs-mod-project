import { Buffer } from 'buffer'
import { CommandsData } from './commandsData'
import { ErrorMessage } from './error'
import { BaseDirectory, writeFile } from '@tauri-apps/plugin-fs'

export enum MS_state_type {
  Enable = 1,
  Disable = 2
}

export class CharacterListOB {
  bufferData: Buffer
  Magic: string
  FileSzie: number
  CharacterCount: number
  CommandsCount: number // start in 0x20, each is 0x4, can search in exe
  CharacterInfoEachSize: number // each character info size
  CommandsData: CommandsData
  CharacterData: CharacterDataOB[]
  constructor (buffer: Buffer) {
    this.bufferData = buffer
    this.Magic = this.readFileMagic()
    this.FileSzie = buffer.readInt32LE(0x8)
    this.CharacterCount = buffer.readInt32LE(0x10)
    this.CommandsCount = buffer.readInt32LE(0x14)
    this.CharacterInfoEachSize = buffer.readInt32LE(0x18)

    // commands
    const commandsStartOffset = 0x20
    const commandsEndOffset = 0x20 + (this.CommandsCount * 0x4 + this.CommandsCount * 0xc)
    const commandsBuffer = buffer.slice(commandsStartOffset, commandsEndOffset)
    this.CommandsData = new CommandsData(commandsBuffer, this.CommandsCount)

    // Character info
    this.CharacterData = []
    const CharacterIds: number[] = []
    const id_padding = this.CharacterCount * 0x4
    for (let i = 0; i < this.CharacterCount; i++) {
      const character_id_startOffset_buffer = this.bufferData.slice(0x20 + commandsBuffer.byteLength + i * 0x4)
      CharacterIds.push(character_id_startOffset_buffer.readInt32LE(0))

      const character_info_startOffset_buffer = this.bufferData.slice(0x20 + commandsBuffer.byteLength + id_padding + i * this.CharacterInfoEachSize)
      this.CharacterData.push(new CharacterDataOB(this.bufferData, character_info_startOffset_buffer, CharacterIds[i]))
    }
  }

  readFileMagic (): string {
    const Magic = this.bufferData.slice(0, 0x4).toString('hex')
    if (Magic.toUpperCase() != 'A9B8ABCD') {
      // showNotification(notificationsType.Warning, ErrorMessage.magicIncorrect);
      throw new Error(ErrorMessage.magicIncorrect)
    } else {
      return Magic
    }
  }
}

export class CharacterDataOB {
  CharacterId: number // id
  indexInSeries: number // 0x0
  UnkId1: number // 0x4
  UnkId2: number // 0x8
  UnkId3: number // 0xc
  ms_igh_r: number // 0x10
  ms_vs_r: number // 0x14
  UnkHash1: number // 0x18
  CharacterNameOffset: StringNameData // 0x1c
  // 0x20 empty
  UnkId4: number // 0x24
  UnkId5: number // 0x28
  UnkId6: number // 0x2c
  UnkHash2: number // 0x30
  ms_vs_l: number // 0x34
  UnkId7: number // 0x38
  UnkHash3: number // 0x3c
  UnkHash4: number // 0x40
  UnkHash4_0: number // 0x44
  UnkHash4_1: number // 0x48
  UnkHash5: number // 0x4c
  UnkHash6: number // 0x50
  UnkId8: number // 0x54
  UnkHash7: number // 0x58
  sticker1: number // 0x5c
  // 0x60 empty
  UnkHash8: number // 0x64
  UnkStringOffset1: StringNameData // 0x68
  // 0x6c empty
  // 0x70 empty
  UnkHash9: number // 0x74
  LMBPilotClothing: number // 0x78
  UnkStringOffset2: StringNameData // 0x7c
  // 0x80 empty
  UnkStringOffset3: StringNameData // 0x84
  // 0x88 empty
  UnkHash9_1: number // 0x8c
  UnkStringOffset4: StringNameData // 0x90
  // 0x94 empty
  UnkStringOffset5: StringNameData // 0x98
  // 0x9c empty
  UnkHash9_2: number // 0xa0
  UnkStringOffset6: StringNameData // 0xa4
  // 0xa8 empty
  // 0xac empty
  EX_Pilot_Clothin_LMB_HASH: number // 0xb0
  UnkHash10: number // 0xb4
  UnkStringOffset7: StringNameData // 0xb8
  // 0xbc empty
  UnkStringOffset8: StringNameData // 0xc0
  // 0xc4 empty
  UnkHash10_1: number // 0xc8
  UnkHash11: number // 0xcc
  vs_p_r_c02: number // 0xd0
  MS_card_icon_index: number // 0xd4
  UnkHash12: number // 0xd8
  // 0xdc empty
  sticker_t01: number // 0xe0
  UnkHash13: number // 0xe4
  UnkHash14: number // 0xe8
  unkId10: number // 0xec
  unkId11: number // 0xf0
  vs_p_l_c02: number // 0xf4
  UnkHash14_1: number // 0xf8
  // 0xfc empty
  unkId12: number // 0x100
  unkId12_1: number // 0x104
  unkId13: number // 0x108
  unkId14: number // 0x10c
  // 0x110 empty
  ms_tracker: number // 0x114
  UnkHash15: number // 0x118
  UnkHash15_1: number // 0x11c
  UnkHash16: number // 0x120
  // 0x124 empty
  UnkHash17: number // 0x128
  UnkHash17_1: number // 0x12c
  UnkHash18: number // 0x130
  UnkStringOffset9: StringNameData // 0x134
  // 0x138 empty
  UnkHash19: number // 0x13c //不知道是什么，有8个.bin
  characterUniqueId: number // 0x140 - Character Unique ID
  UnkStringOffset10: StringNameData // 0x144
  // 0x148 empty
  UnkHash20: number // 0x14c
  unkId15: number // 0x150
  UnkHash21: number // 0x154
  UnkStringOffset11: StringNameData // 0x158
  // 0x15c empty
  LMBCutIn: number // 0x160
  sticker_t05: number // 0x164
  SeriesId: number // 0x168
  UnkHash21_1: number // 0x16c
  UnkHash22: number // 0x170 //不知道是什么，有8个.bin
  // 0x174 empty
  UnkHash22_0: number // 0x178
  UnkHash22_1: number // 0x17c
  ms_ms_l: number // 0x180
  // 0x184 empty
  vs_p_r: number // 0x188
  UnkStringOffset12: StringNameData // 0x18c
  // 0x190 empty
  LMBBoost: number // 0x194
  UnkHash23: number // 0x198
  UnkStringOffset13: StringNameData // 0x19c
  // 0x1a0 empty
  rnk_m_l: number // 0x1a4
  unkId15_1: number // 0x1a8
  ms_crs: number // 0x1ac
  UnkStringOffset14: StringNameData // 0x1b0
  // 0x1b4 empty
  UnkHash23_1: number // 0x1b8
  UnkHash24: number // 0x1bc
  ms_ms_s: number // 0x1c0
  vs_p_l: number // 0x1c4
  // 0x1c8 empty
  ms_mn: number // 0x1cc
  sc_p: number // 0x1d0
  unkId16: number // 0x1d4

  constructor (buffer: Buffer, startBufferData: Buffer, CharacterId: number) {
    let StreamReader = startBufferData

    this.CharacterId = CharacterId
    this.indexInSeries = StreamReader.readInt32LE(0x0)
    this.UnkId1 = StreamReader.readInt32LE(0x4)
    this.UnkId2 = StreamReader.readInt32LE(0x8)
    this.UnkId3 = StreamReader.readInt32LE(0xc)
    this.ms_igh_r = StreamReader.readInt32LE(0x10)
    this.ms_vs_r = StreamReader.readInt32LE(0x14)
    this.UnkHash1 = StreamReader.readInt32LE(0x18)
    this.CharacterNameOffset = new StringNameData(StreamReader.readInt32LE(0x1c), buffer)
    this.UnkId4 = StreamReader.readInt32LE(0x24)
    this.UnkId5 = StreamReader.readInt32LE(0x28)
    this.UnkId6 = StreamReader.readInt32LE(0x2c)
    this.UnkHash2 = StreamReader.readInt32LE(0x30)
    this.ms_vs_l = StreamReader.readInt32LE(0x34)
    this.UnkId7 = StreamReader.readInt32LE(0x38)
    this.UnkHash3 = StreamReader.readInt32LE(0x3c)
    this.UnkHash4 = StreamReader.readInt32LE(0x40)
    this.UnkHash4_0 = StreamReader.readInt32LE(0x44)
    this.UnkHash4_1 = StreamReader.readInt32LE(0x48)
    this.UnkHash5 = StreamReader.readInt32LE(0x4c)
    this.UnkHash6 = StreamReader.readInt32LE(0x50)
    this.UnkId8 = StreamReader.readInt32LE(0x54)
    this.UnkHash7 = StreamReader.readInt32LE(0x58)
    this.sticker1 = StreamReader.readInt32LE(0x5c)
    this.UnkHash8 = StreamReader.readInt32LE(0x64)
    this.UnkStringOffset1 = new StringNameData(StreamReader.readInt32LE(0x68), buffer)
    this.UnkHash9_1 = StreamReader.readInt32LE(0x8c)
    this.UnkHash9 = StreamReader.readInt32LE(0x74)
    this.LMBPilotClothing = StreamReader.readInt32LE(0x78)
    this.UnkStringOffset2 = new StringNameData(StreamReader.readInt32LE(0x7c), buffer)
    this.UnkStringOffset3 = new StringNameData(StreamReader.readInt32LE(0x84), buffer)
    this.UnkStringOffset4 = new StringNameData(StreamReader.readInt32LE(0x90), buffer)
    this.UnkStringOffset5 = new StringNameData(StreamReader.readInt32LE(0x98), buffer)
    this.UnkStringOffset6 = new StringNameData(StreamReader.readInt32LE(0xa4), buffer)
    this.UnkHash9_2 = StreamReader.readInt32LE(0xa0)
    this.EX_Pilot_Clothin_LMB_HASH = StreamReader.readInt32LE(0xb0)
    this.UnkHash10 = StreamReader.readInt32LE(0xb4)
    this.UnkStringOffset7 = new StringNameData(StreamReader.readInt32LE(0xb8), buffer)
    this.UnkStringOffset8 = new StringNameData(StreamReader.readInt32LE(0xc0), buffer)
    this.UnkHash10_1 = StreamReader.readInt32LE(0xc8)
    this.UnkHash11 = StreamReader.readInt32LE(0xcc)
    this.vs_p_r_c02 = StreamReader.readInt32LE(0xd0)
    this.characterUniqueId = StreamReader.readInt32LE(0x140)
    this.UnkHash12 = StreamReader.readInt32LE(0xd8)
    this.sticker_t01 = StreamReader.readInt32LE(0xe0)
    this.UnkHash13 = StreamReader.readInt32LE(0xe4)
    this.UnkHash14 = StreamReader.readInt32LE(0xe8)
    this.unkId10 = StreamReader.readInt32LE(0xec)
    this.unkId11 = StreamReader.readInt32LE(0xf0)
    this.vs_p_l_c02 = StreamReader.readInt32LE(0xf4)
    this.UnkHash14_1 = StreamReader.readInt32LE(0xf8)
    this.unkId12 = StreamReader.readInt32LE(0x100)
    this.unkId12_1 = StreamReader.readInt32LE(0x104)
    this.unkId13 = StreamReader.readInt32LE(0x108)
    this.unkId14 = StreamReader.readInt32LE(0x10c)
    this.ms_tracker = StreamReader.readInt32LE(0x114)
    this.UnkHash15 = StreamReader.readInt32LE(0x118)
    this.UnkHash15_1 = StreamReader.readInt32LE(0x11c)
    this.UnkHash16 = StreamReader.readInt32LE(0x120)
    this.UnkHash17 = StreamReader.readInt32LE(0x128)
    this.UnkHash17_1 = StreamReader.readInt32LE(0x12c)
    this.UnkHash18 = StreamReader.readInt32LE(0x130)
    this.UnkStringOffset9 = new StringNameData(StreamReader.readInt32LE(0x134), buffer)
    this.UnkHash19 = StreamReader.readInt32LE(0x13c)
    this.MS_card_icon_index = StreamReader.readInt32LE(0xd4)
    this.UnkStringOffset10 = new StringNameData(StreamReader.readInt32LE(0x144), buffer)
    this.UnkHash20 = StreamReader.readInt32LE(0x14c)
    this.unkId15 = StreamReader.readInt32LE(0x150)
    this.UnkHash21 = StreamReader.readInt32LE(0x154)
    this.UnkStringOffset11 = new StringNameData(StreamReader.readInt32LE(0x158), buffer)
    this.LMBCutIn = StreamReader.readInt32LE(0x160)
    this.sticker_t05 = StreamReader.readInt32LE(0x164)
    this.SeriesId = StreamReader.readInt32LE(0x168)
    this.UnkHash21_1 = StreamReader.readInt32LE(0x16c)
    this.UnkHash22 = StreamReader.readInt32LE(0x170)
    this.UnkHash22_0 = StreamReader.readInt32LE(0x178)
    this.UnkHash22_1 = StreamReader.readInt32LE(0x17c)
    this.ms_ms_l = StreamReader.readInt32LE(0x180)
    this.vs_p_r = StreamReader.readInt32LE(0x188)
    this.UnkStringOffset12 = new StringNameData(StreamReader.readInt32LE(0x18c), buffer)
    this.LMBBoost = StreamReader.readInt32LE(0x194)
    this.UnkHash23 = StreamReader.readInt32LE(0x198)
    this.UnkStringOffset13 = new StringNameData(StreamReader.readInt32LE(0x19c), buffer)
    this.rnk_m_l = StreamReader.readInt32LE(0x1a4)
    this.unkId15_1 = StreamReader.readInt32LE(0x1a8)
    this.ms_crs = StreamReader.readInt32LE(0x1ac)
    this.UnkStringOffset14 = new StringNameData(StreamReader.readInt32LE(0x1b0), buffer)
    this.UnkHash23_1 = StreamReader.readInt32LE(0x1b8)
    this.UnkHash24 = StreamReader.readInt32LE(0x1bc)
    this.ms_ms_s = StreamReader.readInt32LE(0x1c0)
    this.vs_p_l = StreamReader.readInt32LE(0x1c4)
    this.ms_mn = StreamReader.readInt32LE(0x1cc)
    this.sc_p = StreamReader.readInt32LE(0x1d0)
    this.unkId16 = StreamReader.readInt32LE(0x1d4)
  }
}

class StringNameData {
  Offset: number
  StringBufferData: Buffer
  constructor (nameOffset: number, stringBufferData: Buffer) {
    this.Offset = nameOffset
    this.StringBufferData = stringNameReadToEnd(nameOffset, stringBufferData)
  }
}

// read to 0x00 is end, remark we need add 0x00 at end
function stringNameReadToEnd (startOffset: number, buffer: Buffer): Buffer {
  // let buffer slice from startOffset to end
  let result: Buffer = Buffer.alloc(0)
  let sliceBuffer = buffer.slice(startOffset)
  for (let i of sliceBuffer) {
    if (i == 0) {
      result = Buffer.concat([result, Buffer.from([0])]) // add 0 in end
      break
    } else {
      result = Buffer.concat([result, Buffer.from([i])]) // add 0 in end
    }
  }
  return result
}

export function CharacterListOBOutPut (characterList: CharacterListOB, path: string) {
  //write the file
  const outputFileName = path + '/0.bin'
  let headerBuffer = Buffer.alloc(0x20)
  // write magic, convert string to buffer eg "A9B8ABCD" to 0xA9 0xB8 0xAB 0xCD
  headerBuffer.write(characterList.Magic, 0x0, 0, 'hex')
  headerBuffer.writeInt32LE(0, 0x4)
  headerBuffer.writeInt32LE(0, 0x8) //file size
  headerBuffer.writeInt32LE(0, 0xc)
  headerBuffer.writeInt32LE(characterList.CharacterData.length, 0x10)
  headerBuffer.writeInt32LE(characterList.CommandsCount, 0x14)
  headerBuffer.writeInt32LE(characterList.CharacterInfoEachSize, 0x18)
  headerBuffer.writeInt32LE(0, 0x1c)

  const commandsBuffer = Buffer.alloc(characterList.CommandsCount * 0x4 + characterList.CommandsCount * 0xc)
  for (let i = 0; i < characterList.CommandsCount; i++) {
    // write the buffer
    commandsBuffer.writeInt32LE(characterList.CommandsData.CommandsId[i].readInt32LE(0), i * 0x4)
  }
  const commandsDataOffset = characterList.CommandsCount * 0x4
  for (let i = 0; i < characterList.CommandsCount; i++) {
    // write the buffer characterList.CommandsData.CommandsData[i] to commandsBuffer
    characterList.CommandsData.CommandsData[i].copy(commandsBuffer, commandsDataOffset + i * 0xc)
  }

  let unitIdBuffer = Buffer.alloc(characterList.CharacterData.length * 4)
  for (let i = 0; i < characterList.CharacterData.length; i++) {
    unitIdBuffer.writeInt32LE(characterList.CharacterData[i].CharacterId, i * 0x4)
  }

  //create a visual file buffer size for calculate the name offset
  //the visualBuffer will end when the character data end
  let visualBuffer = Buffer.alloc(
    0x20 + characterList.CommandsCount * 0x4 + characterList.CommandsCount * 0xc + characterList.CharacterData.length * 0x4 + characterList.CharacterData.length * characterList.CharacterInfoEachSize
  )

  //create the name buffer
  let stringNameDataBuffer = Buffer.alloc(0)

  // write the character data
  let unitDataBuffer = Buffer.alloc(characterList.CharacterData.length * characterList.CharacterInfoEachSize)
  for (let i = 0; i < characterList.CharacterData.length; i++) {
    const char = characterList.CharacterData[i]
    const baseOffset = i * characterList.CharacterInfoEachSize

    unitDataBuffer.writeInt32LE(char.indexInSeries, baseOffset + 0x0)
    unitDataBuffer.writeInt32LE(char.UnkId1, baseOffset + 0x4)
    unitDataBuffer.writeInt32LE(char.UnkId2, baseOffset + 0x8)
    unitDataBuffer.writeInt32LE(char.UnkId3, baseOffset + 0xc)
    unitDataBuffer.writeInt32LE(char.ms_igh_r, baseOffset + 0x10)
    unitDataBuffer.writeInt32LE(char.ms_vs_r, baseOffset + 0x14)
    unitDataBuffer.writeInt32LE(char.UnkHash1, baseOffset + 0x18)

    // stringNameData offset for CharacterNameOffset
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0x1c)
    visualBuffer = Buffer.concat([visualBuffer, char.CharacterNameOffset.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.CharacterNameOffset.StringBufferData])

    // 0x20 empty

    unitDataBuffer.writeInt32LE(char.UnkId4, baseOffset + 0x24)
    unitDataBuffer.writeInt32LE(char.UnkId5, baseOffset + 0x28)
    unitDataBuffer.writeInt32LE(char.UnkId6, baseOffset + 0x2c)
    unitDataBuffer.writeInt32LE(char.UnkHash2, baseOffset + 0x30)
    unitDataBuffer.writeInt32LE(char.ms_vs_l, baseOffset + 0x34)
    unitDataBuffer.writeInt32LE(char.UnkId7, baseOffset + 0x38)
    unitDataBuffer.writeInt32LE(char.UnkHash3, baseOffset + 0x3c)
    unitDataBuffer.writeInt32LE(char.UnkHash4, baseOffset + 0x40)
    unitDataBuffer.writeInt32LE(char.UnkHash4_0, baseOffset + 0x44)
    unitDataBuffer.writeInt32LE(char.UnkHash4_1, baseOffset + 0x48)
    unitDataBuffer.writeInt32LE(char.UnkHash5, baseOffset + 0x4c)
    unitDataBuffer.writeInt32LE(char.UnkHash6, baseOffset + 0x50)
    unitDataBuffer.writeInt32LE(char.UnkId8, baseOffset + 0x54)
    unitDataBuffer.writeInt32LE(char.UnkHash7, baseOffset + 0x58)
    unitDataBuffer.writeInt32LE(char.sticker1, baseOffset + 0x5c)
    unitDataBuffer.writeInt32LE(char.UnkHash8, baseOffset + 0x64)

    // stringNameData offset for UnkStringOffset1
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0x68)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset1.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset1.StringBufferData])

    unitDataBuffer.writeInt32LE(char.UnkHash9, baseOffset + 0x74)
    unitDataBuffer.writeInt32LE(char.LMBPilotClothing, baseOffset + 0x78)

    // stringNameData offset for UnkStringOffset2
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0x7c)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset2.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset2.StringBufferData])

    // stringNameData offset for UnkStringOffset3
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0x84)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset3.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset3.StringBufferData])

    unitDataBuffer.writeInt32LE(char.UnkHash9_1, baseOffset + 0x8c)

    // stringNameData offset for UnkStringOffset4
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0x90)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset4.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset4.StringBufferData])

    // stringNameData offset for UnkStringOffset5
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0x98)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset5.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset5.StringBufferData])

    // stringNameData offset for UnkStringOffset6
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0xa4)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset6.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset6.StringBufferData])

    unitDataBuffer.writeInt32LE(char.UnkHash9_2, baseOffset + 0xa0)

    unitDataBuffer.writeInt32LE(char.EX_Pilot_Clothin_LMB_HASH, baseOffset + 0xb0)
    unitDataBuffer.writeInt32LE(char.UnkHash10, baseOffset + 0xb4)

    // stringNameData offset for UnkStringOffset7
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0xb8)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset7.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset7.StringBufferData])

    // stringNameData offset for UnkStringOffset8
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0xc0)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset8.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset8.StringBufferData])

    unitDataBuffer.writeInt32LE(char.UnkHash10_1, baseOffset + 0xc8)
    unitDataBuffer.writeInt32LE(char.UnkHash11, baseOffset + 0xcc)
    unitDataBuffer.writeInt32LE(char.vs_p_r_c02, baseOffset + 0xd0)
    unitDataBuffer.writeInt32LE(char.characterUniqueId, baseOffset + 0x140)
    unitDataBuffer.writeInt32LE(char.UnkHash12, baseOffset + 0xd8)
    unitDataBuffer.writeInt32LE(char.sticker_t01, baseOffset + 0xe0)
    unitDataBuffer.writeInt32LE(char.UnkHash13, baseOffset + 0xe4)
    unitDataBuffer.writeInt32LE(char.UnkHash14, baseOffset + 0xe8)
    unitDataBuffer.writeInt32LE(char.unkId10, baseOffset + 0xec)
    unitDataBuffer.writeInt32LE(char.unkId11, baseOffset + 0xf0)
    unitDataBuffer.writeInt32LE(char.vs_p_l_c02, baseOffset + 0xf4)
    unitDataBuffer.writeInt32LE(char.UnkHash14_1, baseOffset + 0xf8)
    unitDataBuffer.writeInt32LE(char.unkId12, baseOffset + 0x100)
    unitDataBuffer.writeInt32LE(char.unkId12_1, baseOffset + 0x104)
    unitDataBuffer.writeInt32LE(char.unkId13, baseOffset + 0x108)
    unitDataBuffer.writeInt32LE(char.unkId14, baseOffset + 0x10c)
    // 0x110 empty
    unitDataBuffer.writeInt32LE(char.ms_tracker, baseOffset + 0x114)
    unitDataBuffer.writeInt32LE(char.UnkHash15, baseOffset + 0x118)
    unitDataBuffer.writeInt32LE(char.UnkHash15_1, baseOffset + 0x11c)
    unitDataBuffer.writeInt32LE(char.UnkHash16, baseOffset + 0x120)
    // 0x124 empty
    unitDataBuffer.writeInt32LE(char.UnkHash17, baseOffset + 0x128)
    unitDataBuffer.writeInt32LE(char.UnkHash17_1, baseOffset + 0x12c)
    unitDataBuffer.writeInt32LE(char.UnkHash18, baseOffset + 0x130)

    // stringNameData offset for UnkStringOffset9
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0x134)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset9.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset9.StringBufferData])

    unitDataBuffer.writeInt32LE(char.UnkHash19, baseOffset + 0x13c)
    unitDataBuffer.writeInt32LE(char.MS_card_icon_index, baseOffset + 0xd4)

    // stringNameData offset for UnkStringOffset10
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0x144)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset10.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset10.StringBufferData])

    unitDataBuffer.writeInt32LE(char.UnkHash20, baseOffset + 0x14c)
    unitDataBuffer.writeInt32LE(char.unkId15, baseOffset + 0x150)
    unitDataBuffer.writeInt32LE(char.UnkHash21, baseOffset + 0x154)

    // stringNameData offset for UnkStringOffset11
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0x158)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset11.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset11.StringBufferData])

    unitDataBuffer.writeInt32LE(char.LMBCutIn, baseOffset + 0x160)
    unitDataBuffer.writeInt32LE(char.sticker_t05, baseOffset + 0x164)
    unitDataBuffer.writeInt32LE(char.SeriesId, baseOffset + 0x168)
    unitDataBuffer.writeInt32LE(char.UnkHash21_1, baseOffset + 0x16c)
    unitDataBuffer.writeInt32LE(char.UnkHash22, baseOffset + 0x170)
    unitDataBuffer.writeInt32LE(char.UnkHash22_0, baseOffset + 0x178)
    unitDataBuffer.writeInt32LE(char.UnkHash22_1, baseOffset + 0x17c)
    unitDataBuffer.writeInt32LE(char.ms_ms_l, baseOffset + 0x180)
    unitDataBuffer.writeInt32LE(char.vs_p_r, baseOffset + 0x188)

    // stringNameData offset for UnkStringOffset12
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0x18c)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset12.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset12.StringBufferData])

    unitDataBuffer.writeInt32LE(char.LMBBoost, baseOffset + 0x194)
    unitDataBuffer.writeInt32LE(char.UnkHash23, baseOffset + 0x198)

    // stringNameData offset for UnkStringOffset13
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0x19c)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset13.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset13.StringBufferData])

    // 0x1a0 empty
    unitDataBuffer.writeInt32LE(char.rnk_m_l, baseOffset + 0x1a4)
    unitDataBuffer.writeInt32LE(char.unkId15_1, baseOffset + 0x1a8)
    unitDataBuffer.writeInt32LE(char.ms_crs, baseOffset + 0x1ac)

    // stringNameData offset for UnkStringOffset14
    unitDataBuffer.writeInt32LE(visualBuffer.byteLength, baseOffset + 0x1b0)
    visualBuffer = Buffer.concat([visualBuffer, char.UnkStringOffset14.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, char.UnkStringOffset14.StringBufferData])

    // 0x1b4 empty
    unitDataBuffer.writeInt32LE(char.UnkHash23_1, baseOffset + 0x1b8)
    unitDataBuffer.writeInt32LE(char.UnkHash24, baseOffset + 0x1bc)
    unitDataBuffer.writeInt32LE(char.ms_ms_s, baseOffset + 0x1c0)
    unitDataBuffer.writeInt32LE(char.vs_p_l, baseOffset + 0x1c4)
    // 0x1c8 empty
    unitDataBuffer.writeInt32LE(char.ms_mn, baseOffset + 0x1cc)
    unitDataBuffer.writeInt32LE(char.sc_p, baseOffset + 0x1d0)
    unitDataBuffer.writeInt32LE(char.unkId16, baseOffset + 0x1d4)
  }

  const outBuffer = Buffer.concat([headerBuffer, commandsBuffer, unitIdBuffer, unitDataBuffer, stringNameDataBuffer])

  //update file size
  outBuffer.writeInt32LE(outBuffer.byteLength, 0x8)

  writeFile(outputFileName, outBuffer, { baseDir: BaseDirectory.AppLocalData })
    .then(e => {
      console.log('write file success')
    })
    .catch(err => {
      console.error(err)
    })
}
