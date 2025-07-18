import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { TreeDataItem } from '@/lib/utils'

interface SubFileDataItem {
  index: number
  fileType: string
  fileIndex: number
  fileUrl: string
  isError?: boolean
  originChunkCount?: number
  errorCompBufferData?: any
  errorOriginSize?: number
  originBinChunkBuffer?: any
}

interface SubFileStructureItem {
  type: 'Folder' | 'Item' | 'EndMark'
  Name?: string
  unk1?: string
  unk2?: string
  unk3?: number
  unk4?: number
  folderCount?: number
  fileIndex?: number
  originalFileIndex?: number
  endMarkCount?: number
}

interface CompleteProjectData {
  Magic: number
  Fhm2dTotalCount: number
  UnkCount: number
  SubFileData: SubFileDataItem[]
  SubFileStructure: SubFileStructureItem[]
  SubFileParseStructure: any
}

interface RepackStoreState {
  completeProjectData: CompleteProjectData | null
  treeData: TreeDataItem[]
  selectedItem: TreeDataItem | null
  copiedItem: TreeDataItem | null

  // Actions
  setCompleteProjectData: (data: CompleteProjectData) => void
  setTreeData: (data: TreeDataItem[]) => void
  setSelectedItem: (item: TreeDataItem | null) => void
  updateTreeDataItem: (itemId: string, updates: Partial<TreeDataItem>) => void
  exportProjectData: () => CompleteProjectData | null

  // Copy/Paste functions
  copyNode: (nodeId: string) => void
  pasteNode: (parentId: string) => void

  // Helper functions
  getMaxAvailableIndex: () => number
  getMaxAvailableFileIndex: () => number
  isIndexExists: (index: number) => boolean
  isFileIndexExists: (fileIndex: number) => boolean
  recalculateIndices: () => void
}

export const useRepackStore = create<RepackStoreState>((set, get) => ({
  completeProjectData: null,
  treeData: [],
  selectedItem: null,
  copiedItem: null,

  setCompleteProjectData: data => set({ completeProjectData: data }),

  setTreeData: data => set({ treeData: data }),

  setSelectedItem: item => set({ selectedItem: item }),

  updateTreeDataItem: (itemId, updates) => {
    const { treeData } = get()

    const updateItemRecursively = (items: TreeDataItem[]): TreeDataItem[] => {
      return items.map(item => {
        if (item.id === itemId) {
          return { ...item, ...updates }
        }
        if (item.children) {
          return {
            ...item,
            children: updateItemRecursively(item.children)
          }
        }
        return item
      })
    }

    set({ treeData: updateItemRecursively(treeData) })
  },

  exportProjectData: () => {
    const { completeProjectData, treeData } = get()
    if (!completeProjectData) return null

    // Simply extract data from tree without any sorting or index modification
    // This preserves the original order and indices exactly as they were loaded
    const { SubFileData, SubFileStructure } = convertTreeDataToStructureWithoutModification(treeData)

    // Update Fhm2dTotalCount to current file count
    const updatedData = {
      ...completeProjectData,
      Fhm2dTotalCount: SubFileData.length,
      SubFileData: SubFileData,
      SubFileStructure: SubFileStructure
    }

    return updatedData
  },

  // Helper function to get maximum available index from SubFileData
  getMaxAvailableIndex: () => {
    const { completeProjectData } = get()
    if (!completeProjectData || !completeProjectData.SubFileData) return 0

    const indices = completeProjectData.SubFileData.map(item => item.index)
    return indices.length > 0 ? Math.max(...indices) + 1 : 0
  },

  // Helper function to get maximum available fileIndex from SubFileData
  getMaxAvailableFileIndex: () => {
    const { completeProjectData } = get()
    if (!completeProjectData || !completeProjectData.SubFileData) return 0

    const fileIndices = completeProjectData.SubFileData.map(item => item.fileIndex)
    return fileIndices.length > 0 ? Math.max(...fileIndices) + 1 : 0
  },

  // Helper function to check if index exists in SubFileData
  isIndexExists: (index: number) => {
    const { completeProjectData } = get()
    if (!completeProjectData || !completeProjectData.SubFileData) return false

    return completeProjectData.SubFileData.some(item => item.index === index)
  },

  // Helper function to check if fileIndex exists in SubFileData
  isFileIndexExists: (fileIndex: number) => {
    const { completeProjectData } = get()
    if (!completeProjectData || !completeProjectData.SubFileData) return false

    return completeProjectData.SubFileData.some(item => item.fileIndex === fileIndex)
  },

  // Helper function to recalculate count after deletion without modifying indices
  recalculateIndices: () => {
    const { treeData, completeProjectData } = get()
    if (!completeProjectData) return

    // Extract SubFileData from current tree structure without modifications
    const { SubFileData } = convertTreeDataToStructureWithoutModification(treeData)

    // Update complete project data count only, preserve original indices
    const updatedCompleteProjectData = {
      ...completeProjectData,
      Fhm2dTotalCount: SubFileData.length,
      SubFileData: SubFileData
    }

    set({
      completeProjectData: updatedCompleteProjectData
    })
  },

  // Copy a node by ID
  copyNode: (nodeId: string) => {
    const { treeData } = get()

    // Find the node to copy
    const findNode = (items: TreeDataItem[]): TreeDataItem | null => {
      for (const item of items) {
        if (item.id === nodeId) {
          return item
        }
        if (item.children) {
          const found = findNode(item.children)
          if (found) return found
        }
      }
      return null
    }

    const nodeToCopy = findNode(treeData)
    if (nodeToCopy) {
      // Create a deep copy of the node
      const copyWithNewIds = (node: TreeDataItem): TreeDataItem => {
        const newId = uuidv4()
        return {
          ...node,
          id: newId,
          children: node.children ? node.children.map(copyWithNewIds) : undefined
        }
      }

      const copiedNode = copyWithNewIds(nodeToCopy)
      set({ copiedItem: copiedNode })
    }
  },

  // Paste the copied node to a parent folder
  pasteNode: (parentId: string) => {
    const { treeData, copiedItem, completeProjectData } = get()
    if (!copiedItem) return

    // Generate new indices for pasted items
    const generateNewIndices = (node: TreeDataItem): TreeDataItem => {
      const newId = uuidv4()
      let newData = node.data
      let newName = node.name // Default: keep original name

      if (node.data?.type === 'Item') {
        const newFileIndex = get().getMaxAvailableFileIndex()

        newData = {
          ...node.data // Keep all original data including unk1, unk2, unk3, unk4
        }

        // Add to completeProjectData.SubFileData if it exists
        if (completeProjectData && node.data.fileType) {
          const newSubFileDataItem = {
            index: node.data.index!,
            fileType: node.data.fileType,
            fileIndex: newFileIndex,
            fileUrl: newData.fileUrl || `.\\unknown\\${newFileIndex}.bin`,
            isError: node.data.isError,
            originChunkCount: node.data.originChunkCount,
            errorCompBufferData: node.data.errorCompBufferData,
            errorOriginSize: node.data.errorOriginSize,
            originBinChunkBuffer: node.data.originBinChunkBuffer
          }

          const updatedCompleteProjectData = {
            ...completeProjectData,
            Fhm2dTotalCount: completeProjectData.Fhm2dTotalCount + 1,
            SubFileData: [...completeProjectData.SubFileData, newSubFileDataItem]
          }

          set({ completeProjectData: updatedCompleteProjectData })
        }
      } else if (node.data?.type === 'Folder') {
        newName = `${node.name}`
      }

      return {
        ...node,
        id: newId,
        name: newName,
        data: newData,
        children: node.children ? node.children.map(generateNewIndices) : undefined
      }
    }

    const nodeToPaste = generateNewIndices(copiedItem)

    // Add the pasted node to the target parent
    const addNodeToParent = (items: TreeDataItem[]): TreeDataItem[] => {
      return items.map(item => {
        if (item.id === parentId && item.data?.type === 'Folder') {
          const children = item.children || []
          const newChildren = [...children, nodeToPaste]

          // Update folderCount for the parent folder
          const updatedData = {
            ...item.data,
            folderCount: newChildren.length
          }

          return {
            ...item,
            children: newChildren,
            data: updatedData
          }
        }
        if (item.children) {
          return {
            ...item,
            children: addNodeToParent(item.children)
          }
        }
        return item
      })
    }

    const newTreeData = addNodeToParent(treeData)
    set({ treeData: newTreeData })
  }
}))





// Helper function to optimize consecutive EndMarks into single EndMark with higher endMarkCount
function optimizeEndMarks(structure: SubFileStructureItem[]): SubFileStructureItem[] {
  const optimized: SubFileStructureItem[] = []
  
  for (let i = 0; i < structure.length; i++) {
    const current = structure[i]
    
    if (current.type === 'EndMark') {
      let totalEndMarkCount = current.endMarkCount || 1
      let j = i + 1
      
      // Count consecutive EndMarks
      while (j < structure.length && structure[j].type === 'EndMark') {
        totalEndMarkCount += structure[j].endMarkCount || 1
        j++
      }
      
      // Add single optimized EndMark
      optimized.push({
        type: 'EndMark',
        endMarkCount: totalEndMarkCount
      })
      
      // Skip the consecutive EndMarks we just processed
      i = j - 1
    } else {
      optimized.push(current)
    }
  }
  
  return optimized
}





// New function to convert tree data without any modifications to preserve original order
function convertTreeDataToStructureWithoutModification (treeData: TreeDataItem[]): {
  SubFileData: SubFileDataItem[]
  SubFileStructure: SubFileStructureItem[]
} {

  // Step 1: Extract SubFileData from tree structure without modifications
  const extractedSubFileData = extractSubFileDataFromTreeWithoutModification(treeData)


  // Step 2: Sort SubFileData by file type and reassign indices  
  const sortedSubFileData = sortSubFileDataByType(extractedSubFileData)

  // Step 3: Generate SubFileStructure preserving original fileIndex values
  const subFileStructure = generateSubFileStructureWithoutMapping(treeData)

  // Step 4: Store reference copies before index reassignment
  const tempSubFileData1 = JSON.parse(JSON.stringify(sortedSubFileData))
  const tempSubFileStructure1 = JSON.parse(JSON.stringify(subFileStructure))

  // Step 5: Reassign sequential indices and update SubFileStructure
  const { finalSubFileData, finalSubFileStructure } = reassignSequentialIndices(sortedSubFileData, subFileStructure)


  return {
    SubFileData: finalSubFileData,
    SubFileStructure: finalSubFileStructure
  }
}

// New function to reassign sequential indices and update SubFileStructure accordingly
function reassignSequentialIndices(
  subFileData: SubFileDataItem[], 
  subFileStructure: SubFileStructureItem[]
): {
  finalSubFileData: SubFileDataItem[]
  finalSubFileStructure: SubFileStructureItem[]
} {
  
  // Create deep copies to avoid mutation
  const finalSubFileData = JSON.parse(JSON.stringify(subFileData))
  const finalSubFileStructure = JSON.parse(JSON.stringify(subFileStructure))
  
  // Step 1: Create mapping table for fileIndex changes
  const fileIndexMapping = new Map<number, number>()
  
  console.log('--- Building fileIndex mapping table ---')
  for (let i = 0; i < finalSubFileData.length; i++) {
    const item = finalSubFileData[i]
    
    // If index needs to be changed, record the mapping
    if (item.index !== i) {
      const originalFileIndex = item.fileIndex
      const newFileIndex = i
      
      fileIndexMapping.set(originalFileIndex, newFileIndex)
      console.log(`  Mapping: fileIndex ${originalFileIndex} -> ${newFileIndex}`)
    }
  }
  
  // Step 2: Update all SubFileData indices
  console.log('--- Updating SubFileData indices ---')
  for (let i = 0; i < finalSubFileData.length; i++) {
    const item = finalSubFileData[i]
    
    if (item.index !== i) {
      console.log(`  Item ${i}: updating index ${item.index} -> ${i}, fileIndex ${item.fileIndex} -> ${i}`)
      item.index = i
      item.fileIndex = i
    }
  }
  
  // Step 3: Update all SubFileStructure fileIndex values using mapping table
  console.log('--- Updating SubFileStructure fileIndex values ---')
  for (let j = 0; j < finalSubFileStructure.length; j++) {
    const structureItem = finalSubFileStructure[j]
    
    if (structureItem.type === 'Item' && structureItem.fileIndex !== undefined) {
      const originalFileIndex = structureItem.fileIndex
      
      // Check if this fileIndex needs to be updated according to our mapping
      if (fileIndexMapping.has(originalFileIndex)) {
        const newFileIndex = fileIndexMapping.get(originalFileIndex)!
        
        console.log(`  SubFileStructure[${j}]: updating fileIndex ${originalFileIndex} -> ${newFileIndex}`)
        structureItem.fileIndex = newFileIndex
      }
    }
  }
  
  console.log('--- Sequential indices reassignment completed ---')
  
  return {
    finalSubFileData,
    finalSubFileStructure
  }
}

// Helper function to sort SubFileData by file type only
function sortSubFileDataByType (data: SubFileDataItem[]): SubFileDataItem[] {
  const fileTypeOrder = [
    '.nutexb', // 0xb (first priority)
    '.nushdb', // 0xa
    '.nusktb', // 0xc
    '.numatb', // 0xd
    '.numshb', // 0xe
    '.numdlb', // 0xf
    '.nuhlpb', // 0x13
    '.nus3bank', // 0x14
    '.nudnbb', // 0x17
    '.nufxlb', // 0x18
    '.nurpdb', // 0x19
    '.bin' // 0 (last)
  ]

  console.log('--- Sorting SubFileData by fle type only ---')

  // Sort by file type only, preserve original indices
  const sortedData = data.sort((a, b) => {
    const aTypeIndex = fileTypeOrder.indexOf(a.fileType)
    const bTypeIndex = fileTypeOrder.indexOf(b.fileType)

    // If not found in order, put at end
    const aTypeOrder = aTypeIndex === -1 ? fileTypeOrder.length : aTypeIndex
    const bTypeOrder = bTypeIndex === -1 ? fileTypeOrder.length : bTypeIndex

    return aTypeOrder - bTypeOrder
  })

  return sortedData
}

// Helper function to extract SubFileData from tree structure without any modifications
function extractSubFileDataFromTreeWithoutModification (treeData: TreeDataItem[]): SubFileDataItem[] {
  const subFileData: SubFileDataItem[] = []
  const seenFileIndices = new Set<number>()

  const processItems = (items: TreeDataItem[]) => {
    items.forEach(item => {
      if (item.data?.type === 'Item' && item.data.fileType && item.data.fileIndex !== undefined) {
        // Only add if we haven't seen this fileIndex before
        if (!seenFileIndices.has(item.data.fileIndex)) {
          // Validate required fields for Items
          if (item.data.originalFileIndex === undefined || item.data.originalFileIndex === null) {
            throw new Error(`Missing originalFileIndex for item: ${item.name}`)
          }
          if (!item.data.fileUrl) {
            throw new Error(`Missing fileUrl for item: ${item.name}`)
          }

          // Preserve original index and fileIndex exactly as they were
          // Use the current fileIndex as both index and fileIndex to maintain consistency
          const currentFileIndex = item.data.fileIndex
          const currentIndex = item.data.fileIndex // Use fileIndex as index to maintain consistency


          subFileData.push({
            index: currentIndex, // Use fileIndex as index to maintain consistency  
            fileType: item.data.fileType,
            fileIndex: currentFileIndex, // Preserve original fileIndex
            fileUrl: item.data.fileUrl,
            isError: item.data.isError,
            originChunkCount: item.data.originChunkCount,
            errorCompBufferData: item.data.errorCompBufferData,
            errorOriginSize: item.data.errorOriginSize,
            originBinChunkBuffer: item.data.originBinChunkBuffer
          })

          seenFileIndices.add(item.data.fileIndex)
        } else {
        }
      }
      if (item.children) {
        processItems(item.children)
      }
    })
  }

  processItems(treeData)
  
  // Sort by fileIndex to maintain original order
  subFileData.sort((a, b) => a.fileIndex - b.fileIndex)
  
  return subFileData
}

// Helper function to generate SubFileStructure without any mapping modifications
function generateSubFileStructureWithoutMapping (treeData: TreeDataItem[]): SubFileStructureItem[] {
  const subFileStructure: SubFileStructureItem[] = []

  const processItems = (items: TreeDataItem[], depth: number = 0) => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      
      if (item.data?.type === 'Folder') {
        // Calculate actual folder count based on current children
        const actualFolderCount = item.children ? item.children.length : 0

        subFileStructure.push({
          type: 'Folder',
          Name: item.name,
          unk1: item.data.unk1,
          unk2: item.data.unk2,
          unk3: item.data.unk3,
          unk4: item.data.unk4,
          folderCount: actualFolderCount
        })

        // Process children
        if (item.children && item.children.length > 0) {
          processItems(item.children, depth + 1)
        }

        // Calculate endMarkCount based on folder nesting level
        let endMarkCount = 1
        
        // Check if this is the last item in its parent's children array
        const isLastInParent = i === items.length - 1
        
        if (isLastInParent && depth > 0) {
          // This folder is the last child at its level
          endMarkCount = 1
        }

        subFileStructure.push({
          type: 'EndMark',
          endMarkCount: endMarkCount
        })
      } else if (item.data?.type === 'Item' && item.data.fileIndex !== undefined) {
        // Preserve original fileIndex without any modifications
        const currentFileIndex = item.data.fileIndex
        const originalFileIndex = item.data.originalFileIndex || item.data.fileIndex


        subFileStructure.push({
          type: 'Item',
          Name: item.name,
          unk1: item.data.unk1,
          unk2: item.data.unk2,
          unk3: item.data.unk3,
          fileIndex: currentFileIndex, // Preserve original fileIndex
          originalFileIndex: originalFileIndex // Keep original unchanged
        })
      }
    }
  }

  processItems(treeData)
  
  // Post-process to optimize EndMark sequences
  return optimizeEndMarks(subFileStructure)
}
