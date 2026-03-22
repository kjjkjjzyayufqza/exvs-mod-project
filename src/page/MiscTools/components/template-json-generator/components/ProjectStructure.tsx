import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tree } from "react-arborist"
import type { NodeApi } from "react-arborist"
import { CustomTreeNode } from "@/components/CustomTreeNode"
import { Button } from "@/components/ui/button"
import { Plus, Download } from "lucide-react"
import { TreeDataItem } from "@/lib/utils"
import { useTemplateStore } from "@/store/templateStore"
import { NodePropertiesPanel } from "../../../../Repack/components/NodePropertiesPanel"


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

interface TemplateProjectData {
    Magic: number
    Fhm2dTotalCount: number
    UnkCount: number
    SubFileData: any[]
    SubFileStructure: any[]
    SubFileParseStructure?: any
}

export function ProjectStructure({
    files,
    settings,
    completeProjectData,
    selectedFolder,
    onGenerateJson,
    mode = 'Model'
}: {
    files: FileInfo[]
    settings: TemplateSettings
    completeProjectData: TemplateProjectData | null
    selectedFolder: string
    onGenerateJson: () => void
    mode?: string
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
        updateFileType
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

                // Counter for example file indices - start after existing files
                let exampleFileIndex = files.length;

                // Get nutexb files indices
                const nutexbIndices = files
                    .map((file, index) => ({ file, index }))
                    .filter(({ file }) => file.name.toLowerCase().endsWith('.nutexb'))
                    .map(({ index }) => index);

                const treeItems: TreeDataItem[] = [];

                // Always create Textures Folder 1 (empty if no nutexb files)
                treeItems.push({
                    id: 'textures_folder',
                    name: 'Textures Folder 1',
                    data: {
                        type: 'Folder',
                        folderCount: nutexbIndices.length,
                        unk1: "00000000",
                        unk2: "00000000",
                        unk3: 32,
                        unk4: 1
                    },
                    children: []
                });

                // Add nutexb files only if they exist
                if (nutexbIndices.length > 0) {
                    for (let i = 0; i < nutexbIndices.length; i++) {
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
                                index: fileIndex,
                                isExample: false
                            }
                        });
                    }
                }

                // Create Textures Folder 2 as a copy of Textures Folder 1 (empty if no nutexb files)
                treeItems.push({
                    id: 'textures_folder_2',
                    name: 'Textures Folder 2',
                    data: {
                        type: 'Folder',
                        folderCount: nutexbIndices.length,
                        unk1: "00000000",
                        unk2: "00000000",
                        unk3: 32,
                        unk4: 1
                    },
                    children: []
                });

                // Copy all files to Textures Folder 2 (only if they exist)
                if (nutexbIndices.length > 0) {
                    for (let i = 0; i < nutexbIndices.length; i++) {
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
                                index: fileIndex,
                                isExample: false
                            }
                        });
                    }
                }

                // Add model files directly to root level (always create, use actual file if exists, otherwise Example)
                // nusktb
                if (nusktbIndex !== -1) {
                    treeItems.push({
                        id: 'nusktb_item',
                        name: files[nusktbIndex].name,
                        data: {
                            type: 'Item',
                            fileIndex: nusktbIndex,
                            unk1: "00000000",
                            unk2: "10000000",
                            unk3: 0,
                            originalFileIndex: nusktbIndex,
                            fileType: '.nusktb',
                            fileUrl: files[nusktbIndex].path,
                            index: nusktbIndex,
                            isExample: false
                        }
                    });
                } else {
                    treeItems.push({
                        id: 'nusktb_item',
                        name: 'Example.nusktb',
                        data: {
                            type: 'Item',
                            fileIndex: exampleFileIndex,
                            unk1: "00000000",
                            unk2: "10000000",
                            unk3: 0,
                            originalFileIndex: exampleFileIndex,
                            fileType: '.nusktb',
                            fileUrl: '',
                            index: exampleFileIndex,
                            isExample: true
                        }
                    });
                    exampleFileIndex++;
                }

                // numatb1
                if (numatb1Index !== -1) {
                    treeItems.push({
                        id: 'numatb1_item',
                        name: files[numatb1Index].name,
                        data: {
                            type: 'Item',
                            fileIndex: numatb1Index,
                            unk1: "00000000",
                            unk2: "21000000",
                            unk3: 1,
                            originalFileIndex: numatb1Index,
                            fileType: '.numatb',
                            fileUrl: files[numatb1Index].path,
                            index: numatb1Index,
                            isExample: false
                        }
                    });
                } else {
                    treeItems.push({
                        id: 'numatb1_item',
                        name: 'Example.numatb',
                        data: {
                            type: 'Item',
                            fileIndex: exampleFileIndex,
                            unk1: "00000000",
                            unk2: "21000000",
                            unk3: 1,
                            originalFileIndex: exampleFileIndex,
                            fileType: '.numatb',
                            fileUrl: '',
                            index: exampleFileIndex,
                            isExample: true
                        }
                    });
                    exampleFileIndex++;
                }

                // numatb2 - always create, use actual file if exists, otherwise Example
                if (numatb2Index !== -1 && numatb2Index !== numatb1Index) {
                    // Use actual numatb2 file (only if different from numatb1)
                    treeItems.push({
                        id: 'numatb2_item',
                        name: files[numatb2Index].name,
                        data: {
                            type: 'Item',
                            fileIndex: numatb2Index,
                            unk1: "00000000",
                            unk2: "21000000",
                            unk3: 1,
                            originalFileIndex: numatb2Index,
                            fileType: '.numatb',
                            fileUrl: files[numatb2Index].path,
                            index: numatb2Index,
                            isExample: false
                        }
                    });
                } else {
                    // Always create second numatb as Example (either because no file provided or same as first)
                    treeItems.push({
                        id: 'numatb2_item',
                        name: 'Example2.numatb',
                        data: {
                            type: 'Item',
                            fileIndex: exampleFileIndex,
                            unk1: "00000000",
                            unk2: "21000000",
                            unk3: 1,
                            originalFileIndex: exampleFileIndex,
                            fileType: '.numatb',
                            fileUrl: '',
                            index: exampleFileIndex,
                            isExample: true
                        }
                    });
                    exampleFileIndex++;
                }

                // numshb
                if (numshbIndex !== -1) {
                    treeItems.push({
                        id: 'numshb_item',
                        name: files[numshbIndex].name,
                        data: {
                            type: 'Item',
                            fileIndex: numshbIndex,
                            unk1: "00000000",
                            unk2: "30000000",
                            unk3: 0,
                            originalFileIndex: numshbIndex,
                            fileType: '.numshb',
                            fileUrl: files[numshbIndex].path,
                            index: numshbIndex,
                            isExample: false
                        }
                    });
                } else {
                    treeItems.push({
                        id: 'numshb_item',
                        name: 'Example.numshb',
                        data: {
                            type: 'Item',
                            fileIndex: exampleFileIndex,
                            unk1: "00000000",
                            unk2: "30000000",
                            unk3: 0,
                            originalFileIndex: exampleFileIndex,
                            fileType: '.numshb',
                            fileUrl: '',
                            index: exampleFileIndex,
                            isExample: true
                        }
                    });
                    exampleFileIndex++;
                }

                // numdlb
                if (numdlbIndex !== -1) {
                    treeItems.push({
                        id: 'numdlb_item',
                        name: files[numdlbIndex].name,
                        data: {
                            type: 'Item',
                            fileIndex: numdlbIndex,
                            unk1: "00000000",
                            unk2: "40000000",
                            unk3: 0,
                            originalFileIndex: numdlbIndex,
                            fileType: '.numdlb',
                            fileUrl: files[numdlbIndex].path,
                            index: numdlbIndex,
                            isExample: false
                        }
                    });
                } else {
                    treeItems.push({
                        id: 'numdlb_item',
                        name: 'Example.numdlb',
                        data: {
                            type: 'Item',
                            fileIndex: exampleFileIndex,
                            unk1: "00000000",
                            unk2: "40000000",
                            unk3: 0,
                            originalFileIndex: exampleFileIndex,
                            fileType: '.numdlb',
                            fileUrl: '',
                            index: exampleFileIndex,
                            isExample: true
                        }
                    });
                    exampleFileIndex++;
                }

                // bin
                if (binIndex !== -1) {
                    treeItems.push({
                        id: 'bin_item',
                        name: files[binIndex].name,
                        data: {
                            type: 'Item',
                            fileIndex: binIndex,
                            unk1: "00000000",
                            unk2: "50000000",
                            unk3: 0,
                            originalFileIndex: binIndex,
                            fileType: '.bin',
                            fileUrl: files[binIndex].path,
                            index: binIndex,
                            isExample: false
                        }
                    });
                } else {
                    treeItems.push({
                        id: 'bin_item',
                        name: 'Example.bin',
                        data: {
                            type: 'Item',
                            fileIndex: exampleFileIndex,
                            unk1: "00000000",
                            unk2: "50000000",
                            unk3: 0,
                            originalFileIndex: exampleFileIndex,
                            fileType: '.bin',
                            fileUrl: '',
                            index: exampleFileIndex,
                            isExample: true
                        }
                    });
                    exampleFileIndex++;
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
            <Card>
                <CardContent className="py-4">
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
                            <Button
                                onClick={onGenerateJson}
                                disabled={!completeProjectData || !selectedFolder}
                                variant="default"
                                size="sm"
                            >
                                <Download className="h-4 w-4 mr-2" />
                                Generate JSON
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
                                            {(props) => <CustomTreeNode {...props} enableExampleHighlight={true} mode={mode} />}
                                        </Tree>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Properties Panel */}
                            <div className="h-full min-h-0 space-y-6">
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
                </CardContent>
            </Card>
        )
    )
}
