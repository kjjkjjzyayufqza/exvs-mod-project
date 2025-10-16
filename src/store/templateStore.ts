import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { TreeDataItem } from '@/lib/utils'

interface FileInfo {
    name: string
    path: string
}

interface TemplateSettings {
    nusktb: string
    numatb1: string
    numatb2: string
    numshb: string
    numdlb: string
    bin: string
}

interface SubFileDataItem {
    index: number
    fileType: string
    fileIndex: number
    fileUrl: string
}

interface SubFileStructureItem {
    type: 'Folder' | 'Item' | 'EndMark'
    unk1?: string
    folderCount?: number
    unk2?: string
    unk3?: number
    unk4?: number
    fileIndex?: number
    originalFileIndex?: number
    endMarkCount?: number
}

interface TemplateProjectData {
    Magic: number
    Fhm2dTotalCount: number
    UnkCount: number
    SubFileData: SubFileDataItem[]
    SubFileStructure: SubFileStructureItem[]
    SubFileParseStructure?: any
}

interface TemplateStoreState {
    // Data states
    completeProjectData: TemplateProjectData | null
    treeData: TreeDataItem[]
    selectedItem: TreeDataItem | null
    copiedItem: TreeDataItem | null

    // UI states
    selectedFolder: string
    isLoading: boolean
    files: FileInfo[]
    settings: TemplateSettings
    nutexbFiles: FileInfo[]

    // Actions
    setCompleteProjectData: (data: TemplateProjectData | null) => void
    setTreeData: (data: TreeDataItem[]) => void
    setSelectedItem: (item: TreeDataItem | null) => void
    setCopiedItem: (item: TreeDataItem | null) => void

    // UI actions
    setSelectedFolder: (folder: string) => void
    setIsLoading: (loading: boolean) => void
    setFiles: (files: FileInfo[]) => void
    setSettings: (settings: TemplateSettings) => void
    setNutexbFiles: (files: FileInfo[]) => void

    // Tree operations
    copyNode: (nodeId: string) => void
    pasteNode: (parentId: string) => void
    renameNode: (nodeId: string, newName: string) => void
    deleteNode: (nodeId: string) => void
    createNode: (parentId: string | null, index: number, type: 'folder' | 'file') => { id: string }
    moveNode: (dragIds: string[], parentId: string | null, index: number) => void

    // Helper functions
    getMaxAvailableIndex: () => number
    getMaxAvailableFileIndex: () => number
    isIndexExists: (index: number) => boolean
    isFileIndexExists: (fileIndex: number) => boolean

    // Property operations
    updateNodeProperty: (nodeId: string, property: string, value: string | number) => void
    updateFileType: (nodeId: string, newFileType: string) => void

    // Reset function
    resetAll: () => void
}

export const useTemplateStore = create<TemplateStoreState>((set, get) => ({
    // Initial states
    completeProjectData: null,
    treeData: [],
    selectedItem: null,
    copiedItem: null,
    selectedFolder: "",
    isLoading: false,
    files: [],
    settings: {
        nusktb: "",
        numatb1: "",
        numatb2: "",
        numshb: "",
        numdlb: "",
        bin: ""
    },
    nutexbFiles: [],

    // Basic setters
    setCompleteProjectData: data => set({ completeProjectData: data }),
    setTreeData: data => set({ treeData: data }),
    setSelectedItem: item => set({ selectedItem: item }),
    setCopiedItem: item => set({ copiedItem: item }),
    setSelectedFolder: folder => set({ selectedFolder: folder }),
    setIsLoading: loading => set({ isLoading: loading }),
    setFiles: files => set({ files }),
    setSettings: settings => set({ settings }),
    setNutexbFiles: files => set({ nutexbFiles: files }),

    // Tree operations
    copyNode: (nodeId: string) => {
        const { treeData } = get()

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

    pasteNode: (parentId: string) => {
        const { treeData, copiedItem, completeProjectData } = get()
        if (!copiedItem) return

        const generateNewIndices = (node: TreeDataItem): TreeDataItem => {
            const newId = uuidv4()
            let newData = node.data
            let newName = node.name

            if (node.data?.type === 'Item') {
                const newFileIndex = get().getMaxAvailableFileIndex()

                newData = {
                    ...node.data
                }

                if (completeProjectData && node.data.fileType) {
                    const newSubFileDataItem = {
                        index: node.data.index!,
                        fileType: node.data.fileType,
                        fileIndex: newFileIndex,
                        fileUrl: newData.fileUrl || `.\\unknown\\${newFileIndex}.bin`
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

        const addNodeToParent = (items: TreeDataItem[]): TreeDataItem[] => {
            return items.map(item => {
                if (item.id === parentId && item.data?.type === 'Folder') {
                    const children = item.children || []
                    const newChildren = [...children, nodeToPaste]

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
    },

    renameNode: (nodeId: string, newName: string) => {
        const { treeData } = get()

        const renameNodeRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
            return nodes.map(node => {
                if (node.id === nodeId) {
                    const updatedNode = {
                        ...node,
                        name: newName,
                        data: node.data
                    }

                    set({ selectedItem: updatedNode })
                    return updatedNode
                }
                if (node.children) {
                    return {
                        ...node,
                        children: renameNodeRecursively(node.children)
                    }
                }
                return node
            })
        }

        const newTreeData = renameNodeRecursively(treeData)
        set({ treeData: newTreeData })
    },

    deleteNode: (nodeId: string) => {
        const { treeData, selectedItem } = get()

        const deleteNodesRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
            return nodes.filter(node => {
                if (node.id === nodeId) {
                    return false
                }
                if (node.children) {
                    node.children = deleteNodesRecursively(node.children)
                    if (node.data?.type === 'Folder') {
                        node.data = {
                            ...node.data,
                            folderCount: node.children.length
                        }
                    }
                }
                return true
            })
        }

        const newTreeData = deleteNodesRecursively(treeData)
        set({ treeData: newTreeData })

        if (selectedItem && selectedItem.id === nodeId) {
            set({ selectedItem: null })
        }
    },

    createNode: (parentId: string | null, index: number, type: 'folder' | 'file') => {
        const nodeType = type === 'folder' ? 'Folder' : 'Item'
        const newNodeName = nodeType === 'Folder' ? 'New Folder' : 'New File.bin'
        const newId = uuidv4()

        let newIndex = index
        let newFileIndex = index

        if (nodeType === 'Item') {
            newIndex = get().getMaxAvailableIndex()
            newFileIndex = get().getMaxAvailableFileIndex()
        }

        const newNode: TreeDataItem = {
            id: newId,
            name: newNodeName,
            data: {
                type: nodeType,
                index: newIndex,
                fileType: nodeType === 'Item' ? '.bin' : undefined,
                fileIndex: nodeType === 'Item' ? newFileIndex : undefined,
                fileUrl: nodeType === 'Item' ? `./${newNodeName}` : undefined,
                originalFileIndex: nodeType === 'Item' ? newIndex : undefined,
                folderCount: nodeType === 'Folder' ? 0 : undefined,
                unk1: "00000000",
                unk2: "00000000",
                unk3: 0,
                unk4: nodeType === 'Folder' ? 0 : undefined
            },
            children: nodeType === 'Folder' ? [] : undefined
        }

        const { treeData, completeProjectData } = get()

        const addNodeRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
            if (parentId === null) {
                const newNodes = [...nodes]
                newNodes.splice(index, 0, newNode)
                return newNodes
            }

            return nodes.map(node => {
                if (node.id === parentId) {
                    const children = node.children || []
                    const newChildren = [...children]
                    newChildren.splice(index, 0, newNode)

                    const updatedData = node.data ? {
                        ...node.data,
                        folderCount: newChildren.length
                    } : undefined

                    return {
                        ...node,
                        children: newChildren,
                        data: updatedData
                    }
                }
                if (node.children) {
                    return {
                        ...node,
                        children: addNodeRecursively(node.children)
                    }
                }
                return node
            })
        }

        const newTreeData = addNodeRecursively(treeData)
        set({ treeData: newTreeData })

        if (nodeType === 'Item' && completeProjectData) {
            const newSubFileDataItem = {
                index: newIndex,
                fileType: '.bin',
                fileIndex: newFileIndex,
                fileUrl: `.\\${completeProjectData.SubFileData[0]?.fileUrl.match(/\\([^\\]+)\\/)?.[1] || 'unknown'}\\${newFileIndex}.bin`
            }

            const updatedCompleteProjectData = {
                ...completeProjectData,
                Fhm2dTotalCount: completeProjectData.Fhm2dTotalCount + 1,
                SubFileData: [...completeProjectData.SubFileData, newSubFileDataItem]
            }

            set({ completeProjectData: updatedCompleteProjectData })
        }

        return { id: newId }
    },

    moveNode: (dragIds: string[], parentId: string | null, index: number) => {
        const { treeData } = get()

        const findAndExtractNodes = (nodes: TreeDataItem[], nodeIds: string[]): { extracted: TreeDataItem[], remaining: TreeDataItem[] } => {
            const extracted: TreeDataItem[] = []
            const remaining: TreeDataItem[] = []

            nodes.forEach(node => {
                if (nodeIds.includes(node.id)) {
                    extracted.push(node)
                } else {
                    let updatedNode = { ...node }
                    if (node.children) {
                        const childResult = findAndExtractNodes(node.children, nodeIds)
                        extracted.push(...childResult.extracted)
                        updatedNode.children = childResult.remaining

                        if (childResult.extracted.length > 0 && node.data?.type === 'Folder') {
                            updatedNode.data = {
                                ...node.data,
                                folderCount: childResult.remaining.length
                            }
                        }
                    }
                    remaining.push(updatedNode)
                }
            })

            return { extracted, remaining }
        }

        const insertNodesAtLocation = (nodes: TreeDataItem[], targetParentId: string | null, insertIndex: number, nodesToInsert: TreeDataItem[]): TreeDataItem[] => {
            if (targetParentId === null) {
                const newNodes = [...nodes]
                newNodes.splice(insertIndex, 0, ...nodesToInsert)
                return newNodes
            }

            return nodes.map(node => {
                if (node.id === targetParentId) {
                    const children = node.children || []
                    const newChildren = [...children]
                    newChildren.splice(insertIndex, 0, ...nodesToInsert)

                    const updatedData = node.data ? {
                        ...node.data,
                        folderCount: newChildren.length
                    } : undefined

                    return {
                        ...node,
                        children: newChildren,
                        data: updatedData
                    }
                }
                if (node.children) {
                    return {
                        ...node,
                        children: insertNodesAtLocation(node.children, targetParentId, insertIndex, nodesToInsert)
                    }
                }
                return node
            })
        }

        const { extracted, remaining } = findAndExtractNodes(treeData, dragIds)
        const updatedData = insertNodesAtLocation(remaining, parentId, index, extracted)

        set({ treeData: updatedData })
    },

    // Helper functions
    getMaxAvailableIndex: () => {
        const { completeProjectData } = get()
        if (!completeProjectData || !completeProjectData.SubFileData) return 0

        const indices = completeProjectData.SubFileData.map(item => item.index)
        return indices.length > 0 ? Math.max(...indices) + 1 : 0
    },

    getMaxAvailableFileIndex: () => {
        const { completeProjectData } = get()
        if (!completeProjectData || !completeProjectData.SubFileData) return 0

        const fileIndices = completeProjectData.SubFileData.map(item => item.fileIndex)
        return fileIndices.length > 0 ? Math.max(...fileIndices) + 1 : 0
    },

    isIndexExists: (index: number) => {
        const { completeProjectData } = get()
        if (!completeProjectData || !completeProjectData.SubFileData) return false

        return completeProjectData.SubFileData.some(item => item.index === index)
    },

    isFileIndexExists: (fileIndex: number) => {
        const { completeProjectData } = get()
        if (!completeProjectData || !completeProjectData.SubFileData) return false

        return completeProjectData.SubFileData.some(item => item.fileIndex === fileIndex)
    },

    // Property operations
    updateNodeProperty: (nodeId: string, property: string, value: string | number) => {
        const { treeData, selectedItem } = get()

        const updateNodeRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
            return nodes.map(node => {
                if (node.id === nodeId && node.data) {
                    const updatedData = {
                        ...node.data,
                        [property]: value
                    }

                    const updatedNode: TreeDataItem = {
                        ...node,
                        data: updatedData
                    }

                    if (selectedItem && selectedItem.id === nodeId) {
                        set({ selectedItem: updatedNode })
                    }

                    return updatedNode
                }
                if (node.children) {
                    return {
                        ...node,
                        children: updateNodeRecursively(node.children)
                    }
                }
                return node
            })
        }

        const newTreeData = updateNodeRecursively(treeData)
        set({ treeData: newTreeData })
    },

    updateFileType: (nodeId: string, newFileType: string) => {
        const { treeData, selectedItem } = get()

        const updateFileTypeRecursively = (nodes: TreeDataItem[]): TreeDataItem[] => {
            return nodes.map(node => {
                if (node.id === nodeId) {
                    const updatedNode = {
                        ...node,
                        data: node.data ? {
                            ...node.data,
                            fileType: newFileType
                        } : {
                            type: 'Item' as const,
                            fileType: newFileType
                        }
                    }

                    if (selectedItem && selectedItem.id === nodeId) {
                        set({ selectedItem: updatedNode })
                    }

                    return updatedNode
                }
                if (node.children) {
                    return {
                        ...node,
                        children: updateFileTypeRecursively(node.children)
                    }
                }
                return node
            })
        }

        const newTreeData = updateFileTypeRecursively(treeData)
        set({ treeData: newTreeData })
    },

    resetAll: () => {
        set({
            completeProjectData: null,
            treeData: [],
            selectedItem: null,
            copiedItem: null,
            selectedFolder: "",
            isLoading: false,
            files: [],
            settings: {
                nusktb: "",
                numatb1: "",
                numatb2: "",
                numshb: "",
                numdlb: "",
                bin: ""
            },
            nutexbFiles: []
        })
    }
}))
