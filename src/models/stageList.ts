import { Buffer } from 'buffer'
import { ErrorMessage } from './error'
import { obfDecodeToUtf8String } from '../utils/obfString'

// GVS stage list (magic A9B8ABCE). This is a distinct format from the main
// stage_list.bin (handled by the Rust command-pool backend via
// models/stageListEntry.ts): it has no command section and a different header.
const STAGE_LIST_GVS_MAGIC = 'A9B8ABCE'
const STAGE_GVS_DATA_SIZE = 0x34

export class StageListGVS {
  bufferData: Buffer
  Magic: string
  StageCount: number
  StageDataEachSize: number
  StageData: StageDataGVSEntry[]

  constructor (buffer: Buffer) {
    this.bufferData = buffer
    this.Magic = readFileMagic(this.bufferData, STAGE_LIST_GVS_MAGIC)
    this.StageCount = buffer.readInt32LE(0x10)
    this.StageDataEachSize = buffer.readInt32LE(0x14)

    if (this.StageDataEachSize !== STAGE_GVS_DATA_SIZE) {
      throw new Error(`StageListGVS expects entry size ${STAGE_GVS_DATA_SIZE}, got ${this.StageDataEachSize}`)
    }

    this.StageData = []
    const stageDataStartOffset = 0x20 + this.StageCount * 0x4
    for (let i = 0; i < this.StageCount; i++) {
      const stageBuffer = buffer.slice(
        stageDataStartOffset + i * this.StageDataEachSize,
        stageDataStartOffset + (i + 1) * this.StageDataEachSize
      )
      this.StageData.push(new StageDataGVSEntry(this.bufferData, stageBuffer, i))
    }
  }
}

export class StageDataGVSEntry {
  index: number
  unk1: number // 0x00
  fileName: number // 0x04
  unk3: number // 0x08
  unk4: number // 0x0c
  unk5: number // 0x10
  unk6: number // 0x14
  unk7: number // 0x18
  stg_grd_1: number // 0x1c
  stg_full: number // 0x20
  stg_vs_2: number // 0x24
  stg_grd_2: number // 0x28
  name: StringNameData // 0x2c (offset to string)
  unk12: number // 0x30

  constructor (fullBuffer: Buffer, stageBuffer: Buffer, index: number) {
    if (stageBuffer.length < STAGE_GVS_DATA_SIZE) {
      throw new Error(`StageDataGVSEntry expects at least ${STAGE_GVS_DATA_SIZE} bytes, got ${stageBuffer.length}`)
    }

    this.index = index
    this.unk1 = stageBuffer.readInt32LE(0x00)
    this.fileName = stageBuffer.readInt32LE(0x04)
    this.unk3 = stageBuffer.readInt32LE(0x08)
    this.unk4 = stageBuffer.readInt32LE(0x0c)
    this.unk5 = stageBuffer.readInt32LE(0x10)
    this.unk6 = stageBuffer.readInt32LE(0x14)
    this.unk7 = stageBuffer.readInt32LE(0x18)
    this.stg_grd_1 = stageBuffer.readInt32LE(0x1c)
    this.stg_full = stageBuffer.readInt32LE(0x20)
    this.stg_vs_2 = stageBuffer.readInt32LE(0x24)
    this.stg_grd_2 = stageBuffer.readInt32LE(0x28)
    this.name = new StringNameData(stageBuffer.readInt32LE(0x2c), fullBuffer)
    this.unk12 = stageBuffer.readInt32LE(0x30)
  }
}

export class StringNameData {
  Offset: number
  StringBufferData: Buffer
  Utf8String: string

  constructor (nameOffset: number, stringBufferData: Buffer) {
    this.Offset = nameOffset
    this.StringBufferData = stringNameReadToEnd(nameOffset, stringBufferData)
    this.Utf8String = obfDecodeToUtf8String(this.StringBufferData)
  }
}

function readFileMagic (buffer: Buffer, expectedMagic: string): string {
  const magic = buffer.slice(0, 0x4).toString('hex')
  if (magic.toUpperCase() !== expectedMagic) {
    throw new Error(ErrorMessage.magicIncorrect)
  }
  return magic
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
