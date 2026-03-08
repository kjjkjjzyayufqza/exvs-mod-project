import { Buffer } from 'buffer'
import { CommandsData } from './commandsData'
import { ErrorMessage } from './error'
import { BaseDirectory, writeFile } from '@tauri-apps/plugin-fs'
import { obfDecodeToUtf8String, obfEncodeFromUtf8String } from '../utils/obfString'

const STAGE_LIST_MAGIC = 'A9B8ABCD'
const STAGE_DATA_SIZE = 0x48

export class StageList {
  bufferData: Buffer
  Magic: string
  StageCount: number
  CommandsCount: number
  StageDataEachSize: number
  CommandsData: CommandsData
  StageData: StageDataEntry[]

  constructor (buffer: Buffer) {
    this.bufferData = buffer
    this.Magic = this.readFileMagic()
    this.StageCount = buffer.readInt32LE(0x10)
    this.CommandsCount = buffer.readInt32LE(0x14)
    this.StageDataEachSize = buffer.readInt32LE(0x18)

    const commandsSectionSize = this.CommandsCount * 0x4 + this.CommandsCount * 0xc
    const commandsStartOffset = 0x20
    const commandsEndOffset = 0x20 + commandsSectionSize
    const commandsBuffer = buffer.slice(commandsStartOffset, commandsEndOffset)
    this.CommandsData = new CommandsData(commandsBuffer, this.CommandsCount)

    this.StageData = []
    const idPadding = this.StageCount * 0x4
    const stageDataStartOffset = commandsEndOffset + idPadding
    for (let i = 0; i < this.StageCount; i++) {
      const stageIdOffset = commandsEndOffset + i * 0x4
      const stageId = this.bufferData.slice(stageIdOffset).readInt32LE(0)

      const stageBuffer = buffer.slice(
        stageDataStartOffset + i * this.StageDataEachSize,
        stageDataStartOffset + (i + 1) * this.StageDataEachSize
      )
      this.StageData.push(new StageDataEntry(this.bufferData, stageBuffer, stageDataStartOffset + i * this.StageDataEachSize, stageId))
    }
  }

  readFileMagic (): string {
    const magic = this.bufferData.slice(0, 0x4).toString('hex')
    if (magic.toUpperCase() !== STAGE_LIST_MAGIC) {
      throw new Error(ErrorMessage.magicIncorrect)
    }
    return magic
  }
}

export class StageDataEntry {
  id: number // from ID section
  unk1: number // 0x00
  unk2: number // 0x04
  unk3: number // 0x08
  unk4: number // 0x0c
  unk5: number // 0x10
  unk6: number // 0x14
  vs_s_d: number // 0x18
  fileName: number // 0x1c
  unk9: number // 0x20
  vs_s_l: number // 0x24
  unk11: number // 0x28
  name: StringNameData // 0x2c (offset to string)
  unk13: number // 0x30
  unk14: number // 0x34
  unk15: number // 0x38
  uniqueIndex: number // 0x3c
  vs_sn: number // 0x40
  unk18: number // 0x44

  constructor (fullBuffer: Buffer, stageBuffer: Buffer, _stageOffset: number, id: number) {
    if (stageBuffer.length < STAGE_DATA_SIZE) {
      throw new Error(`StageDataEntry expects at least ${STAGE_DATA_SIZE} bytes, got ${stageBuffer.length}`)
    }
    this.id = id
    this.unk1 = stageBuffer.readInt32LE(0x00)
    this.unk2 = stageBuffer.readInt32LE(0x04)
    this.unk3 = stageBuffer.readInt32LE(0x08)
    this.unk4 = stageBuffer.readInt32LE(0x0c)
    this.unk5 = stageBuffer.readInt32LE(0x10)
    this.unk6 = stageBuffer.readInt32LE(0x14)
    this.vs_s_d = stageBuffer.readInt32LE(0x18)
    this.fileName = stageBuffer.readInt32LE(0x1c)
    this.unk9 = stageBuffer.readInt32LE(0x20)
    this.vs_s_l = stageBuffer.readInt32LE(0x24)
    this.unk11 = stageBuffer.readInt32LE(0x28)
    this.name = new StringNameData(stageBuffer.readInt32LE(0x2c), fullBuffer)
    this.unk13 = stageBuffer.readInt32LE(0x30)
    this.unk14 = stageBuffer.readInt32LE(0x34)
    this.unk15 = stageBuffer.readInt32LE(0x38)
    this.uniqueIndex = stageBuffer.readInt32LE(0x3c)
    this.vs_sn = stageBuffer.readInt32LE(0x40)
    this.unk18 = stageBuffer.readInt32LE(0x44)
  }
}

class StringNameData {
  Offset: number
  StringBufferData: Buffer
  Utf8String: string

  constructor (nameOffset: number, stringBufferData: Buffer) {
    this.Offset = nameOffset
    this.StringBufferData = stringNameReadToEnd(nameOffset, stringBufferData)
    this.Utf8String = obfDecodeToUtf8String(this.StringBufferData)
  }
}

function stringNameReadToEnd (startOffset: number, buffer: Buffer): Buffer {
  let result: Buffer = Buffer.alloc(0)
  const sliceBuffer = buffer.slice(startOffset)
  for (const b of sliceBuffer) {
    if (b === 0) {
      result = Buffer.concat([result, Buffer.from([0])])
      break
    } else {
      result = Buffer.concat([result, Buffer.from([b])])
    }
  }
  return result
}

export function StageListOutput (stageList: StageList, path: string): Promise<void> {
  const outputBuffer = buildStageListBuffer(stageList)
  const outputFileName = path + '/stage_list.bin'
  return writeFile(outputFileName, outputBuffer, { baseDir: BaseDirectory.AppLocalData })
}

export function buildStageListBuffer (stageList: StageList): Buffer {
  const sortedData = [...stageList.StageData].sort((a, b) => {
    const aId = a.id ?? 0
    const bId = b.id ?? 0
    const aIsPositive = aId >= 0
    const bIsPositive = bId >= 0
    if (aIsPositive !== bIsPositive) return aIsPositive ? -1 : 1
    return aId - bId
  })

  const headerBuffer = Buffer.alloc(0x20)
  headerBuffer.write(stageList.Magic, 0x0, 0, 'hex')
  headerBuffer.writeInt32LE(0, 0x4)
  headerBuffer.writeInt32LE(0, 0x8) // file size, will be updated later
  headerBuffer.writeInt32LE(0, 0xc)
  headerBuffer.writeInt32LE(sortedData.length, 0x10)
  headerBuffer.writeInt32LE(stageList.CommandsCount, 0x14)
  headerBuffer.writeInt32LE(stageList.StageDataEachSize, 0x18)
  headerBuffer.writeInt32LE(0, 0x1c)

  const commandsBuffer = Buffer.alloc(stageList.CommandsCount * 0x4 + stageList.CommandsCount * 0xc)
  for (let i = 0; i < stageList.CommandsCount; i++) {
    commandsBuffer.writeInt32LE(stageList.CommandsData.CommandsId[i].readInt32LE(0), i * 0x4)
  }
  const commandsDataOffset = stageList.CommandsCount * 0x4
  for (let i = 0; i < stageList.CommandsCount; i++) {
    stageList.CommandsData.CommandsData[i].copy(commandsBuffer, commandsDataOffset + i * 0xc)
  }

  const idBuffer = Buffer.alloc(sortedData.length * 0x4)
  for (let i = 0; i < sortedData.length; i++) {
    idBuffer.writeInt32LE(sortedData[i].id, i * 0x4)
  }

  const stringDataStartOffset =
    0x20 +
    (stageList.CommandsCount * 0x4 + stageList.CommandsCount * 0xc) +
    sortedData.length * 0x4 +
    sortedData.length * stageList.StageDataEachSize

  const stringChunks: Buffer[] = []
  let cumulativeStringOffset = stringDataStartOffset

  const ensureStringBufferMatchesUtf8 = (data: { StringBufferData: Buffer; Utf8String: string } | null | undefined) => {
    if (!data || !data.StringBufferData) return
    if (typeof data.Utf8String !== 'string') {
      data.Utf8String = obfDecodeToUtf8String(data.StringBufferData)
      return
    }
    const current = obfDecodeToUtf8String(data.StringBufferData)
    if (current !== data.Utf8String) {
      data.StringBufferData = Buffer.from(obfEncodeFromUtf8String(data.Utf8String))
    }
  }

  const stageDataBuffer = Buffer.alloc(sortedData.length * stageList.StageDataEachSize)
  for (let i = 0; i < sortedData.length; i++) {
    const stage = sortedData[i]
    const baseOffset = i * stageList.StageDataEachSize

    const nameData = stage.name ?? { Offset: 0, StringBufferData: Buffer.from([0]), Utf8String: "" }
    ensureStringBufferMatchesUtf8(nameData)
    stageDataBuffer.writeInt32LE(cumulativeStringOffset, baseOffset + 0x2c)
    stringChunks.push(nameData.StringBufferData)
    cumulativeStringOffset += nameData.StringBufferData.length

    stageDataBuffer.writeInt32LE(stage.unk1, baseOffset + 0x00)
    stageDataBuffer.writeInt32LE(stage.unk2, baseOffset + 0x04)
    stageDataBuffer.writeInt32LE(stage.unk3, baseOffset + 0x08)
    stageDataBuffer.writeInt32LE(stage.unk4, baseOffset + 0x0c)
    stageDataBuffer.writeInt32LE(stage.unk5, baseOffset + 0x10)
    stageDataBuffer.writeInt32LE(stage.unk6, baseOffset + 0x14)
    stageDataBuffer.writeInt32LE(stage.vs_s_d, baseOffset + 0x18)
    stageDataBuffer.writeInt32LE(stage.fileName, baseOffset + 0x1c)
    stageDataBuffer.writeInt32LE(stage.unk9, baseOffset + 0x20)
    stageDataBuffer.writeInt32LE(stage.vs_s_l, baseOffset + 0x24)
    stageDataBuffer.writeInt32LE(stage.unk11, baseOffset + 0x28)
    stageDataBuffer.writeInt32LE(stage.unk13, baseOffset + 0x30)
    stageDataBuffer.writeInt32LE(stage.unk14, baseOffset + 0x34)
    stageDataBuffer.writeInt32LE(stage.unk15, baseOffset + 0x38)
    stageDataBuffer.writeInt32LE(stage.uniqueIndex, baseOffset + 0x3c)
    stageDataBuffer.writeInt32LE(stage.vs_sn, baseOffset + 0x40)
    stageDataBuffer.writeInt32LE(stage.unk18, baseOffset + 0x44)
  }

  const stringNameDataBuffer = Buffer.concat(stringChunks)
  const outBuffer = Buffer.concat([headerBuffer, commandsBuffer, idBuffer, stageDataBuffer, stringNameDataBuffer])
  outBuffer.writeInt32LE(outBuffer.byteLength, 0x8)
  return outBuffer
}
