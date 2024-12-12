import { Buffer } from 'buffer'
import { ErrorMessage } from './error'
import pako from 'pako'

export enum Fhm2dType {
  PS4GundamVersus = 'PS4GundamVersus',
  Xboost = 'Xboost'
}

export function getFileType (type: number) {
  switch (type) {
    case 0xa:
      return '.nushdb'
    case 0xb:
      return '.nutexb'
    case 0xc:
      return '.nusktb'
    case 0xd:
      return '.numatb'
    case 0xe:
      return '.numshb'
    case 0xf:
      return '.numdlb'
    case 0x13:
      return '.nuhlpb'
    case 0x14:
      return '.nus3bank'
    case 0x17:
      return '.nudnbb'
    case 0x18:
      return '.nufxlb'
    case 0x19:
      return '.nurpdb'
    default:
      return '.bin'
  }
}

export class PS4FhmData {
  _TYPE_: Fhm2dType = Fhm2dType.PS4GundamVersus
  bufferData: Buffer
  Magic: string
  MetaSize: number
  MetaHeader: number
  BodyData: Buffer
  MetaDataSize: number
  MetaData: Buffer
  FileTypeCount: number
  FileCount: number
  private StreamReader: Buffer
  FileTypeData: FileTypeData[]
  SubFileData: SubData[]
  SubFileStructure: SubFileStructure[]
  constructor (buffer: Buffer) {
    this.bufferData = buffer
    this.Magic = this.readFileMagic() //0
    this.MetaHeader = this.bufferData.readInt32LE(0x20)
    this.MetaSize = this.bufferData.readUInt32LE(0x10) //0x10
    // Get the body data
    this.BodyData = this.bufferData.slice(
      this.MetaSize,
      this.bufferData.byteLength
    )

    this.MetaDataSize = this.bufferData.readUInt32LE(0x18) //0x18
    // Get the meta data
    this.MetaData = this.bufferData.slice(0, this.MetaDataSize)
    this.FileTypeCount = this.MetaData.readUInt32LE(0x30)
    this.FileCount = this.MetaData.readUInt32LE(0x34)

    this.StreamReader = this.MetaData
    this.FileTypeData = this.createFileTypeDataArray()

    // Skip the data, and update StreamReader
    this.skipSize(0xc * this.FileCount)

    // Get each Sub file data info
    this.SubFileData = this.createSubFileDataArray()
    // Get file structure
    this.SubFileStructure = createSubFileStructure(
      this.StreamReader,
      this._TYPE_
    )
  }

  readFileMagic () {
    const Magic = this.bufferData.slice(0, 0x4).toString('hex')
    if (Magic.toUpperCase() != '9992CD90') {
      // showNotification(notificationsType.Warning, ErrorMessage.magicIncorrect)
      throw new Error(ErrorMessage.magicIncorrect)
    } else {
      return Magic
    }
  }

  createFileTypeDataArray () {
    this.StreamReader = this.StreamReader.slice(0x40)
    const fileTypeDataArray = []
    for (let i = 0; i < this.FileTypeCount; i++) {
      const fileTypeData = new FileTypeData(this.StreamReader)
      fileTypeDataArray.push(fileTypeData)
      this.StreamReader = this.StreamReader.slice(0x20)
    }
    return fileTypeDataArray
  }

  skipSize (size: number) {
    this.StreamReader = this.StreamReader.slice(size)
  }

  createSubFileDataArray () {
    const subDataArray = []
    for (let i = 0; i < this.FileCount; i++) {
      const subData = new SubData(this._TYPE_, this.StreamReader, this.BodyData)
      subDataArray.push(subData)
      this.StreamReader = this.StreamReader.slice(0x20)
    }
    return subDataArray
  }

  // 因为 PS4的文件不是按照FileIndex来进行排序的，所以这样要这样处理
  getSortSubFileData () {
    return this.SubFileData.sort((a, b) => a.FileIndex - b.FileIndex)
  }
}

export class Fhm2dData {
  _TYPE_: Fhm2dType = Fhm2dType.Xboost
  bufferData: Buffer
  Magic: string
  MetaSize: number
  MetaCompSize: number
  MetaCompData: Buffer
  BodyCompData: Buffer
  MetaData: Buffer
  MetaHeader: number
  FileTypeCount: number
  FileCount: number
  private StreamReader: Buffer
  FileTypeData: FileTypeData[]
  SubFileData: SubData[]
  SubFileStructure: SubFileStructure[]
  constructor (buffer: Buffer) {
    this.bufferData = buffer
    this.Magic = this.readFileMagic() //0
    this.MetaSize = this.bufferData.readUInt32LE(0x18) //0x18
    this.MetaCompSize = this.bufferData.readUInt32LE(0x20) //0x20

    // Get the compression meta buffer
    this.MetaCompData = this.BodyCompData = this.bufferData.slice(
      0x30,
      0x30 + this.MetaCompSize
    )

    // Get the compression body buffer
    this.BodyCompData = this.bufferData.slice(
      0x30 + this.MetaCompSize,
      this.bufferData.byteLength
    )

    // handle meta data
    // decompress first
    const decompressMeata = pako.inflateRaw(new Uint8Array(this.MetaCompData))
    this.MetaData = Buffer.from(decompressMeata)
    // get meta data info
    this.MetaHeader = this.MetaData.readUInt32LE(0)
    this.FileTypeCount = this.MetaData.readUInt32LE(0x18)
    this.FileCount = this.MetaData.readUInt32LE(0x1c)
    this.StreamReader = this.MetaData
    this.FileTypeData = this.createFileTypeDataArray()

    // Skip the data, and update StreamReader
    this.skipSize(0xc * this.FileCount)

    // Get each Sub file data info
    this.SubFileData = this.createSubFileDataArray()

    // Get file structure
    this.SubFileStructure = createSubFileStructure(
      this.StreamReader,
      this._TYPE_
    )
  }

  readFileMagic () {
    const Magic = this.bufferData.slice(0, 0x4).toString('hex')
    if (Magic.toUpperCase() != 'B9B7B2CD') {
      // showNotification(notificationsType.Warning, ErrorMessage.magicIncorrect)
      throw new Error(ErrorMessage.magicIncorrect)
    } else {
      return Magic
    }
  }

  createFileTypeDataArray () {
    this.StreamReader = this.StreamReader.slice(0x24)
    const fileTypeDataArray = []
    for (let i = 0; i < this.FileTypeCount; i++) {
      const fileTypeData = new FileTypeData(this.StreamReader)
      fileTypeDataArray.push(fileTypeData)
      this.StreamReader = this.StreamReader.slice(0x20)
    }
    return fileTypeDataArray
  }

  skipSize (size: number) {
    this.StreamReader = this.StreamReader.slice(size)
  }

  createSubFileDataArray () {
    const subDataArray = []
    for (let i = 0; i < this.FileCount; i++) {
      const subData = new SubData(
        this._TYPE_,
        this.StreamReader,
        this.BodyCompData
      )
      subDataArray.push(subData)
      this.StreamReader = this.StreamReader.slice(subData._Length) //需要特殊处理
    }
    return subDataArray
  }

  getSortSubFileData () {
    return this.SubFileData.sort((a, b) => a.FileIndex - b.FileIndex)
  }
}

class FileTypeData {
  FileType: number
  FileTypeSize: number
  FileCount: number
  constructor (bufferData: Buffer) {
    this.FileType = bufferData.readUInt32LE(0)
    this.FileTypeSize = bufferData.readUInt32LE(0x10)
    this.FileCount = bufferData.readUInt32LE(0x1c)
  }
}

class SubData {
  StartOffset!: number
  FileSize!: number
  Unk1!: number
  ChunkCount!: number
  FileIndex!: number
  BufferData!: Buffer
  CompBufferData!: { Size: number; CompBufferData: Buffer }[]
  _Length!: number
  _isNeedDeComp: boolean = true //有些文件本身没有经过压缩
  constructor (_TYPE_: Fhm2dType, meta: Buffer, body: Buffer) {
    if (_TYPE_ == Fhm2dType.PS4GundamVersus) {
      this.StartOffset = meta.readUInt32LE(0)
      this.FileSize = meta.readUInt32LE(0x8)
      this.Unk1 = meta.readUInt32LE(0x18)
      this.FileIndex = meta.readUInt32LE(0x1c)
      this.BufferData = body.slice(
        this.StartOffset,
        this.StartOffset + this.FileSize
      )
    } else if (_TYPE_ == Fhm2dType.Xboost) {
      this.CompBufferData = []
      this.StartOffset = meta.readUInt32LE(0x20) //0x20 is start offset
      this.FileSize = meta.readUInt32LE(0x8)
      this.Unk1 = meta.readUInt32LE(0x18)
      this.ChunkCount = meta.readUInt32LE(0x1c)
      this.FileIndex = meta.readUInt32LE(0x28)

      let BINARY_COUNT = 0
      if (this.ChunkCount > 0) {
        let chunkPaddingStartOffset = 0x2c
        let padding = 0
        let temp = 0
        while (BINARY_COUNT != this.ChunkCount) {
          temp = meta.readUInt8(chunkPaddingStartOffset + padding)
          padding++
          BINARY_COUNT += countOnesInBinary(temp)
        }

        const eachChunkSizeStartOffset = 0x2c + padding
        let offset: number = this.StartOffset
        for (let i = 0; i < this.ChunkCount; i++) {
          const Size = meta.readInt32LE(eachChunkSizeStartOffset + i * 0x8)
          this.CompBufferData.push({
            Size: Size,
            CompBufferData: body.slice(offset, offset + Size)
          })
          offset += Size
        }
        // 获取整个块信息的大小
        this._Length = 0x2c + padding + 0x8 * this.ChunkCount
      }
      if (this.ChunkCount == 0) {
        //获取下一个chunk的start offset
        const netChunkStartOffset = meta.readInt32LE(0x4c) // skip current

        //判断当前文件的原始大小是否等于下个文件chunk开始offset - 当前文件chunk开始offset的大小'
        if (netChunkStartOffset - this.StartOffset == this.FileSize) {
          this.CompBufferData.push({
            Size: this.FileSize,
            CompBufferData: body.slice(
              this.StartOffset,
              this.StartOffset + this.FileSize
            )
          })
          // 获取整个块信息的大小
          this._Length = 0x2c
          this._isNeedDeComp = false
        } else {
          //不支持其他的
          throw new Error('No do this')
        }
      }
    }
  }
}

interface SubFileStructure {
  type: 'Folder' | 'Item' | 'EndMark'
  unk1?: string
  folderCount?: number
  fileIndex?: number
  endMarkCount?: number
  unk2?: string
  unk3?: number
  originalFileIndex?: number
}

function createSubFileStructure (
  file: Buffer,
  _TYPE_: Fhm2dType
): SubFileStructure[] {
  let Items: any = []
  function loopingData (Data: Buffer, Offset = 0) {
    const TYPE = Data.readInt8(0)
    switch (TYPE) {
      case 0xa: {
        const item = {
          type: 'Folder',
          unk1: Data.slice(0x1, 0x5).toString('hex'),
          folderCount: Data.readInt32LE(0x5),
          unk2: Data.slice(0x9, 0xd).toString('hex'),
          unk3: Data.readInt32LE(0x11),
          unk4: _TYPE_ == Fhm2dType.Xboost && Data.readInt32LE(0x19) // 只有XB 才有这个
        }
        Items.push(item)
        if (_TYPE_ == Fhm2dType.Xboost) {
          Data = Data.slice(0x21)
        } else if (_TYPE_ == Fhm2dType.PS4GundamVersus) {
          Data = Data.slice(0x19)
        }
        loopingData(Data)
        break
      }

      case 0: {
        const item = {
          type: 'Item',
          unk1: Data.slice(0x1, 0x5).toString('hex'),
          fileIndex: Data.readInt32LE(0x5),
          unk2: Data.slice(0x9, 0xd).toString('hex'),
          unk3: Data.readInt32LE(0x11)
        }
        Items.push(item)
        Data = Data.slice(0x19)
        loopingData(Data)
        break
      }
      case 0xb: {
        let endMarkCount = 0
        let index = 0
        let stop = false
        while (!stop) {
          // File End
          if (Data.length == index) {
            stop = true
            break
          }
          if (Data.readInt8(index) == 0xb) {
            endMarkCount++
            index++
          } else {
            stop = true
          }
        }
        const item = {
          type: 'EndMark',
          endMarkCount: endMarkCount
        }
        Items.push(item)
        Data = Data.slice(index)
        // File End
        if (Data.length != 0) {
          loopingData(Data)
        }
        break
      }
      default:
        throw `${TYPE} is Not support`
    }
  }

  let fileEndDataJson = []
  loopingData(file)
  fileEndDataJson = Items
  return fileEndDataJson
}

function countOnesInBinary (num: number): number {
  // 将十进制数字转换为二进制字符串
  const binaryString: string = num.toString(2)

  // 使用正则表达式匹配二进制字符串中的所有1，并计算其个数
  const onesCount: number = (binaryString.match(/1/g) || []).length

  return onesCount
}
