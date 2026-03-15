import { Buffer } from "buffer"
import { PS4FhmData, getFileType } from "@/models/fhm2d"

type SubFileDataItem = {
  index: number
  fileType: string
  fileIndex: number
  fileUrl: string
}

type StructureItem = {
  type: "Folder" | "Item" | "EndMark"
  unk1?: string
  folderCount?: number
  fileIndex?: number
  endMarkCount?: number
  unk2?: string
  unk3?: number
  unk4?: number
  originalFileIndex?: number
}

export interface GvsMapToVs2OutputMeta {
  Magic: number
  Fhm2dTotalCount: number
  UnkCount: number
  SubFileData: SubFileDataItem[]
  SubFileStructure: StructureItem[]
  SubFileParseStructure: {
    name: string
    children: Array<Record<string, unknown>>
  }
}

export interface FlatExtractedFile {
  fileName: string
  data: Uint8Array
}

export interface GvsMapToVs2Package {
  outputMeta: GvsMapToVs2OutputMeta
  flatFiles: FlatExtractedFile[]
}

function containsAsciiKeyword(data: Uint8Array, keyword: string): boolean {
  const keywordBytes = new TextEncoder().encode(keyword)
  if (keywordBytes.length === 0 || data.length < keywordBytes.length) {
    return false
  }
  for (let i = 0; i <= data.length - keywordBytes.length; i++) {
    let allMatch = true
    for (let j = 0; j < keywordBytes.length; j++) {
      if (data[i + j] !== keywordBytes[j]) {
        allMatch = false
        break
      }
    }
    if (allMatch) {
      return true
    }
  }
  return false
}

function getFileTypeIndex(ext: string): number {
  const map: Record<string, number> = {
    ".bin": 0xffff,
    ".nushdb": 0xa,
    ".nutexb": 0xb,
    ".nusktb": 0xc,
    ".numatb": 0xd,
    ".numshb": 0xe,
    ".numdlb": 0xf,
    ".nuanmb": 0x11,
    ".nuhlpb": 0x13,
    ".nus3bank": 0x14,
    ".nudnbb": 0x17,
    ".nufxlb": 0x18,
    ".nurpdb": 0x19,
  }

  const idx = map[ext]
  if (typeof idx !== "number") {
    throw new Error(`Unsupported file type for sorting: ${ext}`)
  }
  return idx
}

function createFolderStructureXB(data: StructureItem[]) {
  const root: { name: string; children: Array<Record<string, unknown>> } = { name: "Root", children: [] }
  let currentFolder: Record<string, unknown> = root
  const folderStack: Array<Record<string, unknown>> = [root]
  const folderCounts = [0]
  const fileCounts = [0]

  for (const item of data) {
    if (item.type === "Folder") {
      const folderName = `${folderCounts[folderCounts.length - 1]++}`
      const newFolder: Record<string, unknown> = {
        type: item.type,
        name: folderName,
        link: item.unk3 === 1,
        unk1: item.unk1,
        unk2: item.unk2,
        unk3: item.unk3,
        unk4: item.unk4,
        children: [],
      }

      const currentChildren = currentFolder.children
      if (!Array.isArray(currentChildren)) {
        throw new Error("Invalid structure while creating folder tree")
      }
      currentChildren.push(newFolder)

      folderStack.push(currentFolder)
      currentFolder = newFolder
      folderCounts.push(0)
      fileCounts.push(0)
    } else if (item.type === "Item") {
      const itemName = `${item.fileIndex}`
      const currentChildren = currentFolder.children
      if (!Array.isArray(currentChildren)) {
        throw new Error("Invalid structure while creating item nodes")
      }

      currentChildren.push({
        type: item.type,
        name: itemName,
        link: item.unk3 === 1,
        unk1: item.unk1,
        unk2: item.unk2,
        unk3: item.unk3,
      })
    } else if (item.type === "EndMark") {
      for (let i = 0; i < (item.endMarkCount ?? 0); i++) {
        const nextFolder = folderStack.pop()
        if (!nextFolder) {
          throw new Error("Unexpected EndMark count in SubFileStructure")
        }
        currentFolder = nextFolder
        folderCounts.pop()
      }

      fileCounts.pop()
    }
  }

  return root
}

function reorderSubFileDataForPacker(subFileData: SubFileDataItem[]) {
  const sorted = subFileData
    .slice()
    .sort((a, b) => getFileTypeIndex(a.fileType) - getFileTypeIndex(b.fileType))

  const binItems = sorted.filter((item) => item.fileType === ".bin")
  const nonBinItems = sorted.filter((item) => item.fileType !== ".bin")
  return nonBinItems.concat(binItems)
}

function getFileNameFromFileUrl(fileUrl: string): string {
  const normalized = fileUrl.replace(/\//g, "\\")
  const parts = normalized.split("\\").filter(Boolean)
  const fileName = parts[parts.length - 1]
  if (!fileName) {
    throw new Error(`Invalid fileUrl: ${fileUrl}`)
  }
  return fileName
}

export function createGvsMapToVs2Package(fileBuffer: Uint8Array, fileNameNoExt: string): GvsMapToVs2Package {
  const ps4Data = new PS4FhmData(Buffer.from(fileBuffer))

  const typeList: string[] = []
  for (const fileTypeData of ps4Data.FileTypeData) {
    for (let i = 0; i < fileTypeData.FileCount; i++) {
      typeList.push(getFileType(fileTypeData.FileType))
    }
  }

  const fhm2dInfoJsonArray = ps4Data.SubFileData.map((item) => item.FileIndex)
  const normalizedSubFileStructure: StructureItem[] = ps4Data.SubFileStructure.map((item) => {
    if (item.type !== "Item") {
      return { ...item }
    }

    if (typeof item.fileIndex !== "number") {
      throw new Error("SubFileStructure item missing fileIndex")
    }

    const mappedIndex = fhm2dInfoJsonArray.indexOf(item.fileIndex)
    if (mappedIndex === -1) {
      throw new Error(`Cannot map SubFileStructure fileIndex: ${item.fileIndex}`)
    }

    return {
      ...item,
      originalFileIndex: item.fileIndex,
      fileIndex: mappedIndex,
    }
  })

  const outputMeta: GvsMapToVs2OutputMeta = {
    Magic: ps4Data.MetaHeader,
    Fhm2dTotalCount: ps4Data.FileCount,
    UnkCount: 5,
    SubFileData: ps4Data.SubFileData.map((item, i) => {
      const mappedType = typeList[item.FileIndex]
      if (typeof mappedType !== "string") {
        throw new Error(`Cannot resolve file type for index ${item.FileIndex}`)
      }

      return {
        index: i,
        fileType: mappedType,
        fileIndex: item.FileIndex,
        fileUrl: `.\\${fileNameNoExt}\\${i}${mappedType}`,
      }
    }),
    SubFileStructure: normalizedSubFileStructure,
    SubFileParseStructure: createFolderStructureXB(normalizedSubFileStructure),
  }

  const reorderedSubFileData = reorderSubFileDataForPacker(outputMeta.SubFileData)
  const flatFiles: FlatExtractedFile[] = reorderedSubFileData.map((item, index) => {
    const sourceRow = ps4Data.SubFileData[item.index]
    if (!sourceRow) {
      throw new Error(`Missing source sub file row for index: ${item.index}`)
    }

    return {
      fileName: getFileNameFromFileUrl(item.fileUrl),
      data: new Uint8Array(sourceRow.BufferData),
    }
  })

  const fileIndexList = reorderedSubFileData.map((item) => item.fileIndex)

  outputMeta.SubFileData = reorderedSubFileData.map((item, index) => ({
    ...item,
    index,
    fileIndex: index,
  }))

  outputMeta.SubFileStructure = outputMeta.SubFileStructure.map((item) => {
    if (item.type === "Folder" && item.unk2 === "20000000") {
      return {
        ...item,
        unk2: "00000000",
        unk3: 32,
        unk4: 1,
      }
    }

    if (item.type !== "Item") {
      return item
    }

    if (typeof item.originalFileIndex !== "number") {
      throw new Error("SubFileStructure item missing originalFileIndex")
    }

    const mappedIndex = fileIndexList.indexOf(item.originalFileIndex)
    if (mappedIndex === -1) {
      throw new Error(
        `Cannot remap SubFileStructure originalFileIndex: ${item.originalFileIndex}`
      )
    }

    return {
      ...item,
      originalFileIndex: mappedIndex,
      fileIndex: mappedIndex,
    }
  })

  outputMeta.SubFileParseStructure = createFolderStructureXB(outputMeta.SubFileStructure)
  return {
    outputMeta,
    flatFiles,
  }
}

export function createGvsMapToVs2OutputMeta(fileBuffer: Uint8Array, fileNameNoExt: string): GvsMapToVs2OutputMeta {
  return createGvsMapToVs2Package(fileBuffer, fileNameNoExt).outputMeta
}

export function extractOnlyGraphicParamFile(
  fileBuffer: Uint8Array,
  fileNameNoExt: string,
  keyword: string = "directional_lighting"
): FlatExtractedFile {
  const pack = createGvsMapToVs2Package(fileBuffer, fileNameNoExt)
  const matches = pack.flatFiles.filter((file) => containsAsciiKeyword(file.data, keyword))
  if (matches.length === 0) {
    throw new Error(`No graphic_param file found with keyword: ${keyword}`)
  }
  if (matches.length > 1) {
    const names = matches.map((item) => item.fileName).join(", ")
    throw new Error(`Multiple graphic_param candidates found: ${names}`)
  }
  return matches[0]
}

export function extractOnlyNumatbFiles(
  fileBuffer: Uint8Array,
  _fileNameNoExt: string
): FlatExtractedFile[] {
  const pack = createGvsMapToVs2Package(fileBuffer, _fileNameNoExt)
  const matches = pack.flatFiles.filter(
    (file) => file.fileName.toLowerCase().endsWith(".numatb")
  )
  if (matches.length === 0) {
    throw new Error("No numatb file found in package")
  }
  return matches
}
