
import { Buffer } from 'buffer'
import { ErrorMessage } from './error'

export class CharacterIdTable {
  bufferData: Buffer
  Magic: string
  FileSzie: number
  CharacterCount: number
  DataEachSize: number
  CharacterData: CharacterIdTableData[]

  constructor (buffer: Buffer) {
    this.bufferData = buffer
    this.Magic = this.readFileMagic()
    this.FileSzie = buffer.readInt32LE(0x8)
    this.CharacterCount = buffer.readInt32LE(0x10)
    this.DataEachSize = buffer.readInt32LE(0x14)

    if (this.DataEachSize !== 0x18) {
      throw new Error('CharacterIdTable DataEachSize is not 0x18, Not supported')
    }

    // Character ids + table data
    this.CharacterData = []
    const idsStartOffset = 0x20
    const idPadding = this.CharacterCount * 0x4
    const dataStartOffset = idsStartOffset + idPadding

    for (let i = 0; i < this.CharacterCount; i++) {
      const characterId = this.bufferData.readInt32LE(idsStartOffset + i * 0x4)
      const entryOffset = dataStartOffset + i * this.DataEachSize
      this.CharacterData.push(new CharacterIdTableData(this.bufferData, entryOffset, characterId))
    }
  }

  readFileMagic (): string {
    const Magic = this.bufferData.slice(0, 0x4).toString('hex')
    if (Magic.toUpperCase() != 'A9B8ABCE') {
      throw new Error(ErrorMessage.magicIncorrect)
    } else {
      return Magic
    }
  }
}

export class CharacterIdTableData {
  CharacterId: number
  Model: number
  Effect: number
  Sound: number
  Param: number
  Msc: number
  Motion: number

  constructor (buffer: Buffer, offset: number, characterId: number) {
    this.CharacterId = characterId
    this.Model = buffer.readInt32LE(offset + 0x0)
    this.Effect = buffer.readInt32LE(offset + 0x4)
    this.Sound = buffer.readInt32LE(offset + 0x8)
    this.Param = buffer.readInt32LE(offset + 0xc)
    this.Msc = buffer.readInt32LE(offset + 0x10)
    this.Motion = buffer.readInt32LE(offset + 0x14)
  }
}

export function buildCharacterIdTableBuffer (table: CharacterIdTable): Buffer {
  const headerBuffer = Buffer.alloc(0x20)
  headerBuffer.write(table.Magic, 0x0, 0, 'hex')
  headerBuffer.writeInt32LE(0, 0x4)
  headerBuffer.writeInt32LE(0, 0x8) // file size, will be updated later
  headerBuffer.writeInt32LE(0, 0xc)
  headerBuffer.writeInt32LE(table.CharacterData.length, 0x10)
  headerBuffer.writeInt32LE(0x18, 0x14)
  headerBuffer.writeInt32LE(0, 0x18)
  headerBuffer.writeInt32LE(0, 0x1c)

  const idBuffer = Buffer.alloc(table.CharacterData.length * 0x4)
  const dataBuffer = Buffer.alloc(table.CharacterData.length * 0x18)
  for (let i = 0; i < table.CharacterData.length; i++) {
    const row = table.CharacterData[i]
    idBuffer.writeInt32LE(row.CharacterId, i * 0x4)

    const base = i * 0x18
    dataBuffer.writeInt32LE(row.Model, base + 0x0)
    dataBuffer.writeInt32LE(row.Effect, base + 0x4)
    dataBuffer.writeInt32LE(row.Sound, base + 0x8)
    dataBuffer.writeInt32LE(row.Param, base + 0xc)
    dataBuffer.writeInt32LE(row.Msc, base + 0x10)
    dataBuffer.writeInt32LE(row.Motion, base + 0x14)
  }

  const outBuffer = Buffer.concat([headerBuffer, idBuffer, dataBuffer])
  outBuffer.writeInt32LE(outBuffer.byteLength, 0x8)
  return outBuffer
}

