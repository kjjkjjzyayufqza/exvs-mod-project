import { Buffer } from 'buffer'
import { ErrorMessage } from './error'
import { CommandsData } from './commandsData'
import { obfDecodeToUtf8String, obfDecryptBytes, obfEncodeFromUtf8String, obfEncryptBytes } from '../utils/obfString'

export class SeriesList {
  bufferData: Buffer
  Magic: string
  FileSzie: number
  SeriesCount: number
  CommandsCount: number
  DataEachSize: number
  CommandsData: CommandsData
  SeriesData: SeriesData[]

  constructor (buffer: Buffer, options?: { expectedMagic?: string }) {
    this.bufferData = buffer
    this.Magic = this.readFileMagic(options?.expectedMagic ?? 'A9B8ABCD')
    this.FileSzie = buffer.readInt32LE(0x8)
    this.SeriesCount = buffer.readInt32LE(0x10)
    this.CommandsCount = buffer.readInt32LE(0x14)
    this.DataEachSize = buffer.readInt32LE(0x18)

    if (this.DataEachSize !== 0x1C) {
      throw new Error('SeriesList DataEachSize is not 0x1C, Not supported')
    }

    // commands
    const commandsStartOffset = 0x20
    const commandsEndOffset = 0x20 + (this.CommandsCount * 0x4 + this.CommandsCount * 0xc)
    const commandsBuffer = buffer.slice(commandsStartOffset, commandsEndOffset)
    this.CommandsData = new CommandsData(commandsBuffer, this.CommandsCount)

    // Series IDs
    this.SeriesData = []
    const SeriesIds: number[] = []
    const seriesIdStartOffset = commandsEndOffset
    const id_padding = this.SeriesCount * 0x4
    for (let i = 0; i < this.SeriesCount; i++) {
      const series_id_startOffset_buffer = this.bufferData.slice(seriesIdStartOffset + i * 0x4)
      SeriesIds.push(series_id_startOffset_buffer.readInt32LE(0))

      const series_info_startOffset_buffer = this.bufferData.slice(seriesIdStartOffset + id_padding + i * this.DataEachSize)
      this.SeriesData.push(new SeriesData(this.bufferData, series_info_startOffset_buffer.byteOffset, SeriesIds[i]))
    }
  }

  readFileMagic (expectedMagic: string): string {
    const Magic = this.bufferData.slice(0, 0x4).toString('hex')
    if (Magic.toUpperCase() !== expectedMagic.toUpperCase()) {
      throw new Error(ErrorMessage.magicIncorrect)
    }
    return Magic
  }
}

export class SeriesData {
  SeriesId: number // id
  // Points to image index in 0xA0253AA0.fhm2d.
  iconFileIndex: number // 0x00
  unk2: number // 0x04
  unk3: number // 0x08
  unkStr1: StringNameData // 0x0C (int32 offset -> StringNameData)
  unk4: number // 0x10
  unk5: number // 0x14
  // Position/index used for character list ordering.
  characterListPosition: number // 0x18

  constructor (buffer: Buffer, offset: number, SeriesId: number) {
    this.SeriesId = SeriesId
    this.iconFileIndex = buffer.readInt32LE(offset + 0x0)
    this.unk2 = buffer.readInt32LE(offset + 0x4)
    this.unk3 = buffer.readInt32LE(offset + 0x8)
    this.unkStr1 = new StringNameData(buffer.readInt32LE(offset + 0xc), buffer)
    this.unk4 = buffer.readInt32LE(offset + 0x10)
    this.unk5 = buffer.readInt32LE(offset + 0x14)
    this.characterListPosition = buffer.readInt32LE(offset + 0x18)
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

// Read bytes until the first 0x00 terminator; the returned buffer always includes the terminator.
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

export function buildSeriesListBuffer (list: SeriesList): Buffer {
  const headerBuffer = Buffer.alloc(0x20)
  headerBuffer.write(list.Magic, 0x0, 0, 'hex')
  headerBuffer.writeInt32LE(0, 0x4)
  headerBuffer.writeInt32LE(0, 0x8) // file size, will be updated later
  headerBuffer.writeInt32LE(0, 0xc)
  headerBuffer.writeInt32LE(list.SeriesData.length, 0x10)
  headerBuffer.writeInt32LE(list.CommandsCount, 0x14)
  headerBuffer.writeInt32LE(0x1C, 0x18)
  headerBuffer.writeInt32LE(0, 0x1c)

  // commands buffer
  const commandsBuffer = Buffer.alloc(list.CommandsCount * 0x4 + list.CommandsCount * 0xc)
  for (let i = 0; i < list.CommandsCount; i++) {
    commandsBuffer.writeInt32LE(list.CommandsData.CommandsId[i].readInt32LE(0), i * 0x4)
  }
  const commandsDataOffset = list.CommandsCount * 0x4
  for (let i = 0; i < list.CommandsCount; i++) {
    list.CommandsData.CommandsData[i].copy(commandsBuffer, commandsDataOffset + i * 0xc)
  }

  // series IDs buffer
  const seriesIdBuffer = Buffer.alloc(list.SeriesData.length * 0x4)
  for (let i = 0; i < list.SeriesData.length; i++) {
    seriesIdBuffer.writeInt32LE(list.SeriesData[i].SeriesId, i * 0x4)
  }

  const dataBuffer = Buffer.alloc(list.SeriesData.length * 0x1C)

  // Base length for calculating offsets: header + commands + seriesIds + fixed entries
  let visualBuffer = Buffer.alloc(0x20 + commandsBuffer.byteLength + seriesIdBuffer.byteLength + list.SeriesData.length * 0x1C)
  let stringNameDataBuffer = Buffer.alloc(0)

  const ensureStringBufferMatchesUtf8 = (data: any) => {
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

  for (let i = 0; i < list.SeriesData.length; i++) {
    const row = list.SeriesData[i]
    const base = i * 0x1C
    dataBuffer.writeInt32LE(row.iconFileIndex, base + 0x0)
    dataBuffer.writeInt32LE(row.unk2, base + 0x4)
    dataBuffer.writeInt32LE(row.unk3, base + 0x8)

    ensureStringBufferMatchesUtf8(row.unkStr1)
    dataBuffer.writeInt32LE(visualBuffer.byteLength, base + 0xc)
    visualBuffer = Buffer.concat([visualBuffer, row.unkStr1.StringBufferData])
    stringNameDataBuffer = Buffer.concat([stringNameDataBuffer, row.unkStr1.StringBufferData])

    dataBuffer.writeInt32LE(row.unk4, base + 0x10)
    dataBuffer.writeInt32LE(row.unk5, base + 0x14)
    dataBuffer.writeInt32LE(row.characterListPosition, base + 0x18)
  }

  const outBuffer = Buffer.concat([headerBuffer, commandsBuffer, seriesIdBuffer, dataBuffer, stringNameDataBuffer])
  outBuffer.writeInt32LE(outBuffer.byteLength, 0x8)
  return outBuffer
}

