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

    // Convert treeData back to the required format
    // The convertTreeDataToStructure function now handles:
    // 1. Extracting SubFileData from tree structure
    // 2. Sorting SubFileData by file type (.nutexb first, .bin last)
    // 3. Reassigning sequential fileIndex values (0, 1, 2...)
    // 4. Updating SubFileStructure items with correct fileIndex mappings
    const { SubFileData, SubFileStructure } = convertTreeDataToStructure(treeData)

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

  // Helper function to recalculate all indices after deletion (similar to export logic)
  recalculateIndices: () => {
    const { treeData, completeProjectData } = get()
    if (!completeProjectData) return

    // Extract SubFileData from current tree structure
    const { SubFileData } = convertTreeDataToStructure(treeData)

    // Sort and reassign indices using the same logic as export
    const sortedSubFileData = sortSubFileData(SubFileData)

    // Create mapping from old fileIndex to new fileIndex
    const fileIndexMapping = new Map<number, number>()
    sortedSubFileData.forEach((item, newIndex) => {
      // Find the original item to get its original fileIndex
      const originalItem = SubFileData.find(orig => orig.fileType === item.fileType && orig.fileUrl === item.fileUrl && orig.index === item.index)
      if (originalItem) {
        fileIndexMapping.set(originalItem.fileIndex, newIndex)
      }
    })

    // Update tree data with new indices
    const updateTreeDataIndices = (items: TreeDataItem[]): TreeDataItem[] => {
      return items.map(item => {
        if (item.data?.type === 'Item' && item.data.fileIndex !== undefined) {
          const newFileIndex = fileIndexMapping.get(item.data.fileIndex)
          const newIndex = newFileIndex !== undefined ? newFileIndex : item.data.fileIndex
          return {
            ...item,
            data: {
              ...item.data,
              index: newIndex,
              fileIndex: newIndex,
              originalFileIndex: newIndex
            }
          }
        }
        if (item.children) {
          return {
            ...item,
            children: updateTreeDataIndices(item.children)
          }
        }
        return item
      })
    }

    const updatedTreeData = updateTreeDataIndices(treeData)

    // Update complete project data with new indices
    const updatedCompleteProjectData = {
      ...completeProjectData,
      Fhm2dTotalCount: sortedSubFileData.length,
      SubFileData: sortedSubFileData
    }

    set({
      completeProjectData: updatedCompleteProjectData,
      treeData: updatedTreeData
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

// Helper function to extract SubFileData from tree structure
function extractSubFileDataFromTree (treeData: TreeDataItem[]): SubFileDataItem[] {
  const subFileData: SubFileDataItem[] = []
  const seenFileIndices = new Set<number>()

  console.log('--- Extracting SubFileData from tree structure ---')

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

          // Extract original values from tree data
          // Use originalFileIndex as both index and fileIndex for mapping purposes
          const originalIndex = item.data.originalFileIndex
          const originalFileIndex = item.data.originalFileIndex

          // console.log(`  Extracting item: ${item.name}, originalIndex:${originalIndex}, originalFileIndex:${originalFileIndex}, currentFileIndex:${item.data.fileIndex}, fileType:${item.data.fileType}`);

          subFileData.push({
            index: originalIndex, // Use original index
            fileType: item.data.fileType,
            fileIndex: originalFileIndex, // Use original fileIndex for mapping
            fileUrl: item.data.fileUrl,
            isError: item.data.isError,
            originChunkCount: item.data.originChunkCount,
            errorCompBufferData: item.data.errorCompBufferData,
            errorOriginSize: item.data.errorOriginSize,
            originBinChunkBuffer: item.data.originBinChunkBuffer
          })

          seenFileIndices.add(item.data.fileIndex)
        } else {
          console.log(`  Skipping duplicate fileIndex: ${item.data.fileIndex} for item: ${item.name}`)
        }
      }
      if (item.children) {
        processItems(item.children)
      }
    })
  }

  processItems(treeData)
  console.log(`--- Extracted ${subFileData.length} items from tree ---`)
  return subFileData
}

// Helper function to create mapping from original fileIndex to new sorted position
function createFileIndexMapping (originalData: SubFileDataItem[], sortedData: SubFileDataItem[]): Map<number, number> {
  const mapping = new Map<number, number>()

  console.log('--- Creating FileIndex Mapping ---')

  // Create mapping from original fileIndex to new sequential position by matching fileUrl
  sortedData.forEach((sortedItem, newPosition) => {
    // Find the corresponding original item by fileUrl
    const originalItem = originalData.find(orig => orig.fileUrl === sortedItem.fileUrl)
    if (originalItem) {
      // Map original fileIndex to new sequential position
      // originalItem.fileIndex contains the original fileIndex from tree data
      // newPosition is the new sequential position (0, 1, 2, ...)
      mapping.set(originalItem.fileIndex, newPosition)
      // console.log(`  Mapping: originalFileIndex ${originalItem.fileIndex} -> newPosition ${newPosition} (${sortedItem.fileUrl})`);
    }
  })

  console.log('--- Mapping Created ---')
  return mapping
}

// Helper function to generate SubFileStructure with correct fileIndex values
function generateSubFileStructureWithMapping (treeData: TreeDataItem[], fileIndexMapping: Map<number, number>): SubFileStructureItem[] {
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
        // Check if this is the last item at current level and we need to close multiple levels
        let endMarkCount = 1
        
        // Check if this is the last item in its parent's children array
        const isLastInParent = i === items.length - 1
        
        if (isLastInParent && depth > 0) {
          // This folder is the last child at its level
          // We might need to close multiple levels if this is nested deeply
          endMarkCount = 1
        }

        subFileStructure.push({
          type: 'EndMark',
          endMarkCount: endMarkCount
        })
      } else if (item.data?.type === 'Item' && item.data.originalFileIndex !== undefined) {
        // Use the original fileIndex values without mapping
        // Preserve the original fileIndex as requested by user
        const originalFileIndex = item.data.originalFileIndex
        const currentFileIndex = item.data.fileIndex

        if (currentFileIndex === undefined) {
          console.warn(`Item "${item.name}" has undefined fileIndex, skipping`)
          continue
        }

        // Use the original fileIndex directly without any mapping
        // This preserves the original fileIndex values (1,7,6,13...) instead of forcing (0,1,2,3...)
        // console.log(`SubFileStructure Item: "${item.name}", using original fileIndex: ${currentFileIndex}, originalFileIndex: ${originalFileIndex}`);

        subFileStructure.push({
          type: 'Item',
          Name: item.name,
          unk1: item.data.unk1,
          unk2: item.data.unk2,
          unk3: item.data.unk3,
          fileIndex: currentFileIndex, // Use original fileIndex without mapping
          originalFileIndex: originalFileIndex // Keep original unchanged
        })
      }
    }
  }

  processItems(treeData)
  
  // Post-process to optimize EndMark sequences
  return optimizeEndMarks(subFileStructure)
}

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

// Main function to convert tree data back to structure format
function convertTreeDataToStructure (treeData: TreeDataItem[]): {
  SubFileData: SubFileDataItem[]
  SubFileStructure: SubFileStructureItem[]
} {
  console.log('=== EXPORT DEBUG: Starting convertTreeDataToStructure ===')

  // Step 1: Extract SubFileData from tree structure
  const extractedSubFileData = extractSubFileDataFromTree(treeData)
  console.log('Step 1 - Extracted SubFileData (before sorting):')
  extractedSubFileData.forEach((item, idx) => {
    // console.log(`  [${idx}] originalIndex:${item.index}, originalFileIndex:${item.fileIndex}, fileType:${item.fileType}, fileUrl:${item.fileUrl}`);
  })

  // Step 2: Sort SubFileData by file type and reassign indices
  const sortedSubFileData = sortSubFileData(extractedSubFileData)
  console.log('Step 2 - Sorted SubFileData (after sorting with sequential indices):')
  sortedSubFileData.forEach((item, idx) => {
    // console.log(`  [${idx}] newIndex:${item.index}, newFileIndex:${item.fileIndex}, fileType:${item.fileType}, fileUrl:${item.fileUrl}`);
  })

  // Verify that indices are sequential
  const expectedIndices = sortedSubFileData.map((_, idx) => idx)
  const actualIndices = sortedSubFileData.map(item => item.index)
  const actualFileIndices = sortedSubFileData.map(item => item.fileIndex)

  console.log('Index verification:')
  console.log(`  Expected indices: [${expectedIndices.join(', ')}]`)
  console.log(`  Actual indices: [${actualIndices.join(', ')}]`)
  console.log(`  Actual fileIndices: [${actualFileIndices.join(', ')}]`)
  console.log(`  Indices are sequential: ${JSON.stringify(actualIndices) === JSON.stringify(expectedIndices)}`)
  console.log(`  FileIndices are sequential: ${JSON.stringify(actualFileIndices) === JSON.stringify(expectedIndices)}`)

  // Step 3: Generate SubFileStructure using original fileIndex values
  // No mapping needed since we preserve original fileIndex values
  const subFileStructure = generateSubFileStructureWithMapping(treeData, new Map())

  console.log('=== EXPORT DEBUG: Completed convertTreeDataToStructure ===')

  return {
    SubFileData: sortedSubFileData,
    SubFileStructure: subFileStructure
  }
}

// Helper function to sort SubFileData according to fileTypeOptions order
function sortSubFileData (data: SubFileDataItem[]): SubFileDataItem[] {
  const fileTypeOrder = [
    '.nutexb', // 0xb (first priority as requested)
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

  // Sort by file type only, preserve original order within same file type
  // This maintains the original fileIndex values and order within each file type
  const sortedData = data.sort((a, b) => {
    const aTypeIndex = fileTypeOrder.indexOf(a.fileType)
    const bTypeIndex = fileTypeOrder.indexOf(b.fileType)

    // If not found in order, put at end
    const aTypeOrder = aTypeIndex === -1 ? fileTypeOrder.length : aTypeIndex
    const bTypeOrder = bTypeIndex === -1 ? fileTypeOrder.length : bTypeIndex

    // Only compare by file type, maintain original order within same type
    return aTypeOrder - bTypeOrder
  })

  // Only reassign index for SubFileData array position, preserve original fileIndex
  // This ensures SubFileData has continuous array indices but keeps original fileIndex values
  return sortedData.map((item, newPosition) => {
    return {
      ...item,
      index: newPosition, // Sequential index for SubFileData array position
      fileIndex: item.fileIndex, // Preserve original fileIndex value
      fileUrl: item.fileUrl // Preserve the complete original File URL
    }
  })
}
