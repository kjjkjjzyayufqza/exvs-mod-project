import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tree } from "react-arborist"
import type { NodeApi } from "react-arborist"
import { Button } from "@/components/ui/button"
import { Plus, Folder, FileText, ChevronRight, ChevronDown } from "lucide-react"
import { TreeDataItem } from "@/lib/utils"
import { useTemplateStore } from "@/store/templateStore"
import { NodePropertiesPanel } from "../../../../Repack/components/NodePropertiesPanel"

// Custom Node component for React Arborist
function CustomNode({ node, style, dragHandle }: {
    node: NodeApi<TreeDataItem>;
    style: React.CSSProperties;
    dragHandle?: (el: HTMLDivElement | null) => void
}) {
    const Icon = node.isLeaf ? FileText : Folder;
    const nodeData = node.data.data;

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent triggering selection when clicking toggle
        node.toggle();
    };

    const handleNodeClick = () => {
        node.select();
    };

    return (
        <div
            ref={dragHandle}
            style={style}
            className={`flex items-center gap-1 px-2 py-1 hover:bg-gray-100 cursor-pointer rounded ${node.isSelected ? 'bg-blue-100 text-blue-900' : ''
                } ${node.isFocused ? 'ring-2 ring-blue-500' : ''}`}
            onClick={handleNodeClick}
        >
            {/* Toggle arrow for folders */}
            {!node.isLeaf && (
                <button
                    onClick={handleToggle}
                    className="p-0.5 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                    aria-label={node.isOpen ? "Collapse folder" : "Expand folder"}
                >
                    {node.isOpen ? (
                        <ChevronDown className="h-3 w-3 text-gray-500" />
                    ) : (
                        <ChevronRight className="h-3 w-3 text-gray-500" />
                    )}
                </button>
            )}

            {/* Spacer for leaf nodes to align with folder content */}
            {node.isLeaf && <div className="w-4 flex-shrink-0" />}

            <Icon
                className={`h-4 w-4 ${node.isLeaf ? 'text-gray-600' : 'text-blue-600'} flex-shrink-0`}
            />
            <span className="text-sm select-none flex-1 min-w-0">
                {node.isEditing ? (
                    <input
                        type="text"
                        defaultValue={node.data.name}
                        onBlur={(e) => node.submit(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                node.submit(e.currentTarget.value);
                            } else if (e.key === 'Escape') {
                                node.reset();
                            }
                        }}
                        className="px-1 py-0 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                        autoFocus
                    />
                ) : (
                    <span className="truncate">{node.data.name}</span>
                )}
            </span>
            {nodeData?.type === 'Item' && nodeData.fileType && (
                <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
                    {nodeData.fileType}
                </span>
            )}
        </div>
    );
}

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

export function ProjectStructure({
    files,
    settings
}: {
    files: FileInfo[]
    settings: TemplateSettings
}) {
    const treeRef = useRef<any>(null)
    const {
        treeData,
        setTreeData,
        selectedItem,
        setSelectedItem,
        copiedItem,
        copyNode,
        pasteNode,
        renameNode,
        deleteNode,
        createNode,
        moveNode,
        updateNodeProperty,
        updateFileType,
        completeProjectData
    } = useTemplateStore()

    // Initialize tree data from actual files and settings
    useEffect(() => {
        if (treeData.length === 0 && files.length > 0) {
            // Create flat structure based on settings and files (matching the JSON format)
            const generateTreeData = (): TreeDataItem[] => {
                // Helper function to find file index by path
                const findFileIndex = (filePath: string): number => {
                    if (!filePath) return -1;
                    // Convert path separators and find matching file
                    const normalizedPath = filePath.replace(/\\/g, '/');
                    const file = files.find(f => f.path.replace(/\\/g, '/') === normalizedPath);
                    return file ? files.indexOf(file) : -1;
                };

                // Get file indices from settings
                const nusktbIndex = findFileIndex(settings.nusktb);
                const numatb1Index = findFileIndex(settings.numatb1);
                const numatb2Index = findFileIndex(settings.numatb2);
                const numshbIndex = findFileIndex(settings.numshb);
                const numdlbIndex = findFileIndex(settings.numdlb);
                const binIndex = findFileIndex(settings.bin);

                // Get nutexb files indices
                const nutexbIndices = files
                    .map((file, index) => ({ file, index }))
                    .filter(({ file }) => file.name.toLowerCase().endsWith('.nutexb'))
                    .map(({ index }) => index);

                const treeItems: TreeDataItem[] = [];

                // Add all nutexb files to Textures Folder 1
                if (nutexbIndices.length > 0) {
                    const textureCount = nutexbIndices.length
                    treeItems.push({
                        id: 'textures_folder',
                        name: 'Textures Folder 1',
                        data: {
                            type: 'Folder',
                            folderCount: textureCount,
                            unk1: "00000000",
                            unk2: "00000000",
                            unk3: 32,
                            unk4: 1
                        },
                        children: []
                    });

                    // Add all nutexb files to the textures folder
                    for (let i = 0; i < textureCount; i++) {
                        const fileIndex = nutexbIndices[i];
                        treeItems[treeItems.length - 1].children!.push({
                            id: `texture_${i}_item`,
                            name: files[fileIndex].name,
                            data: {
                                type: 'Item',
                                fileIndex: fileIndex,
                                unk1: "00000000",
                                unk2: "00000000",
                                unk3: 0,
                                originalFileIndex: fileIndex,
                                fileType: '.nutexb',
                                fileUrl: files[fileIndex].path,
                                index: fileIndex
                            }
                        });
                    }

                    // Create Textures Folder 2 as a copy of Textures Folder 1
                    treeItems.push({
                        id: 'textures_folder_2',
                        name: 'Textures Folder 2',
                        data: {
                            type: 'Folder',
                            folderCount: textureCount,
                            unk1: "00000000",
                            unk2: "00000000",
                            unk3: 32,
                            unk4: 1
                        },
                        children: []
                    });

                    // Copy all nutexb files to Textures Folder 2 with different IDs
                    for (let i = 0; i < textureCount; i++) {
                        const fileIndex = nutexbIndices[i];
                        treeItems[treeItems.length - 1].children!.push({
                            id: `texture_2_${i}_item`,
                            name: files[fileIndex].name,
                            data: {
                                type: 'Item',
                                fileIndex: fileIndex,
                                unk1: "00000000",
                                unk2: "00000000",
                                unk3: 0,
                                originalFileIndex: fileIndex,
                                fileType: '.nutexb',
                                fileUrl: files[fileIndex].path,
                                index: fileIndex
                            }
                        });
                    }
                }

                // Add model files directly to root level
                if (nusktbIndex !== -1) {
                    treeItems.push({
                        id: 'nusktb_item',
                        name: files[nusktbIndex].name,
                        data: {
                            type: 'Item',
                            fileIndex: nusktbIndex,
                            unk1: "00000000",
                            unk2: "00000000",
                            unk3: 0,
                            originalFileIndex: nusktbIndex,
                            fileType: '.nusktb',
                            fileUrl: files[nusktbIndex].path,
                            index: nusktbIndex
                        }
                    });
                }

                if (numatb1Index !== -1) {
                    treeItems.push({
                        id: 'numatb1_item',
                        name: files[numatb1Index].name,
                        data: {
                            type: 'Item',
                            fileIndex: numatb1Index,
                            unk1: "00000000",
                            unk2: "00000000",
                            unk3: 0,
                            originalFileIndex: numatb1Index,
                            fileType: '.numatb',
                            fileUrl: files[numatb1Index].path,
                            index: numatb1Index
                        }
                    });
                }

                if (numatb2Index !== -1 && numatb2Index !== numatb1Index) {
                    treeItems.push({
                        id: 'numatb2_item',
                        name: files[numatb2Index].name,
                        data: {
                            type: 'Item',
                            fileIndex: numatb2Index,
                            unk1: "00000000",
                            unk2: "00000000",
                            unk3: 0,
                            originalFileIndex: numatb2Index,
                            fileType: '.numatb',
                            fileUrl: files[numatb2Index].path,
                            index: numatb2Index
                        }
                    });
                }

                if (numshbIndex !== -1) {
                    treeItems.push({
                        id: 'numshb_item',
                        name: files[numshbIndex].name,
                        data: {
                            type: 'Item',
                            fileIndex: numshbIndex,
                            unk1: "00000000",
                            unk2: "00000000",
                            unk3: 0,
                            originalFileIndex: numshbIndex,
                            fileType: '.numshb',
                            fileUrl: files[numshbIndex].path,
                            index: numshbIndex
                        }
                    });
                }

                if (numdlbIndex !== -1) {
                    treeItems.push({
                        id: 'numdlb_item',
                        name: files[numdlbIndex].name,
                        data: {
                            type: 'Item',
                            fileIndex: numdlbIndex,
                            unk1: "00000000",
                            unk2: "00000000",
                            unk3: 0,
                            originalFileIndex: numdlbIndex,
                            fileType: '.numdlb',
                            fileUrl: files[numdlbIndex].path,
                            index: numdlbIndex
                        }
                    });
                }


                if (binIndex !== -1) {
                    treeItems.push({
                        id: 'bin_item',
                        name: files[binIndex].name,
                        data: {
                            type: 'Item',
                            fileIndex: binIndex,
                            unk1: "00000000",
                            unk2: "10000000",
                            unk3: 0,
                            originalFileIndex: binIndex,
                            fileType: '.bin',
                            fileUrl: files[binIndex].path,
                            index: binIndex
                        }
                    });
                }
                return treeItems;
            };

            const actualTreeData = generateTreeData();
            setTreeData(actualTreeData);
        }
    }, [files, settings, treeData.length, setTreeData]);

    const handleSelectChange = (nodes: NodeApi<TreeDataItem>[]) => {
        if (nodes.length > 0) {
            setSelectedItem(nodes[0].data);
        } else {
            setSelectedItem(null);
        }
    };

    const handleCreate = ({ parentId, index, type }: { parentId: string | null; index: number; type: string }) => {
        return createNode(parentId, index, type as 'folder' | 'file');
    };

    const handleRename = ({ id, name }: { id: string; name: string }) => {
        renameNode(id, name);
    };

    const handleMove = ({ dragIds, parentId, index }: { dragIds: string[]; parentId: string | null; index: number }) => {
        moveNode(dragIds, parentId, index);
    };

    const handleDelete = ({ ids }: { ids: string[] }) => {
        ids.forEach(id => deleteNode(id));
    };

    const addNewNode = (parentId: string, nodeType: 'folder' | 'file') => {
        if (!treeRef.current) return;

        const tree = treeRef.current;
        const parentNode = tree.get(parentId);
        if (parentNode) {
            tree.create({ parentId, type: nodeType });
        }
    };

    const handlePropertyChange = (nodeId: string, property: string, value: string | number) => {
        updateNodeProperty(nodeId, property, value);
    };

    const handleFileTypeChange = (nodeId: string, newFileType: string) => {
        updateFileType(nodeId, newFileType);
    };

    const handlePaste = () => {
        if (selectedItem && selectedItem.data?.type === 'Folder' && copiedItem) {
            pasteNode(selectedItem.id);
        }
    };

    return (
        treeData.length > 0 && (
            <div className="h-full flex flex-col">
                <div className="flex gap-2 mb-4">
                    <Button
                        onClick={() => selectedItem && addNewNode(selectedItem.id, 'folder')}
                        disabled={!selectedItem || selectedItem.data?.type !== 'Folder'}
                        size="sm"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Folder
                    </Button>
                    <Button
                        onClick={() => selectedItem && addNewNode(selectedItem.id, 'file')}
                        disabled={!selectedItem || selectedItem.data?.type !== 'Folder'}
                        variant="outline"
                        size="sm"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Add File
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                    {/* Tree View Panel */}
                    <Card className="lg:col-span-2">
                        <CardHeader>
                            <CardTitle>Template Structure</CardTitle>
                            <CardDescription>
                                Drag and drop items to reorganize your project structure
                            </CardDescription>
                            {completeProjectData && (
                                <div className="flex gap-6 text-sm text-gray-600 mt-2">
                                    <span>Magic: <span className="font-bold">{completeProjectData.Magic}</span></span>
                                    <span>Files: <span className="font-bold">{completeProjectData.Fhm2dTotalCount}</span></span>
                                    <span>UnkCount: <span className="font-bold">{completeProjectData.UnkCount}</span></span>
                                </div>
                            )}
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-lg p-4 overflow-hidden">
                                <Tree
                                    ref={treeRef}
                                    data={treeData}
                                    width="100%"
                                    height={600}
                                    indent={20}
                                    rowHeight={32}
                                    openByDefault={false}
                                    onSelect={handleSelectChange}
                                    onCreate={handleCreate}
                                    onMove={handleMove}
                                    onRename={handleRename}
                                    onDelete={handleDelete}
                                    searchMatch={(node, term) =>
                                        node.data.name.toLowerCase().includes(term.toLowerCase())
                                    }
                                >
                                    {CustomNode}
                                </Tree>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Properties Panel */}
                    <div className="space-y-6">
                        <NodePropertiesPanel
                            selectedItem={selectedItem || undefined}
                            onRename={renameNode}
                            onDelete={deleteNode}
                            onFileTypeChange={handleFileTypeChange}
                            onPropertyChange={handlePropertyChange}
                            copiedItem={copiedItem}
                            onPaste={handlePaste}
                        />
                    </div>
                </div>
            </div>
        )
    )
}
