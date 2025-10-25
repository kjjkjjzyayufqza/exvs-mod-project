import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { FolderSelector } from "./components/FolderSelector"
import { ProjectStructure } from "./components/ProjectStructure"
import { useTemplateStore } from "@/store/templateStore"
import { writeTextFile } from "@tauri-apps/plugin-fs"

export function TemplateJsonGenerator() {
    const [isOpen, setIsOpen] = useState(false)
    const {
        selectedFolder,
        setSelectedFolder,
        isLoading,
        setIsLoading,
        files,
        setFiles,
        nutexbFiles,
        setNutexbFiles,
        completeProjectData,
        setCompleteProjectData,
        setSettings,
        settings,
        treeData,
        selectedItem,
        copiedItem,
        resetAll
    } = useTemplateStore()

    const handleSettingChange = (key: keyof typeof settings, value: string) => {
        setSettings({ ...settings, [key]: value })
    }

    const handleGenerateJson = async () => {
        if (!selectedFolder || !completeProjectData) {
            alert("Please select a folder and ensure data is loaded first.")
            return
        }

        try {
            let maxExistingFileIndex = -1;

            const findMaxFileIndex = (nodes: any[]) => {
                nodes.forEach(node => {
                    if (node.data?.type === 'Item' && node.data?.fileIndex !== undefined) {
                        if (node.data.fileIndex > maxExistingFileIndex) {
                            maxExistingFileIndex = node.data.fileIndex;
                        }
                    }
                    if (node.children) {
                        findMaxFileIndex(node.children);
                    }
                });
            };

            findMaxFileIndex(treeData);

            // Create a unified fileIndex mapping for all items in the tree
            const createFileIndexMapping = (): Map<string, number> => {
                const fileIndexMap = new Map<string, number>()
                const processedFileUrls = new Set<string>()
                let fileIndexCounter = 0

                const processTreeNode = (node: any): void => {
                    if (node.data?.type === 'Item') {
                        // Format fileUrl to use backslashes for mapping key
                        const originalFileUrl = node.data.fileUrl || ''
                        const formattedFileUrl = originalFileUrl.replace(/\//g, '\\')

                        // Skip if this fileUrl has already been processed
                        if (processedFileUrls.has(formattedFileUrl)) {
                            return
                        }

                        // Mark as processed
                        processedFileUrls.add(formattedFileUrl)

                        // Use existing fileIndex if available, otherwise assign sequential
                        const fileIndex = node.data.fileIndex !== undefined ? node.data.fileIndex : fileIndexCounter
                        fileIndexMap.set(node.data.fileUrl || node.name, fileIndex)

                        // Only increment counter if we assigned a new fileIndex
                        if (node.data.fileIndex === undefined) {
                            fileIndexCounter++
                        }
                    }

                    // Process children recursively
                    if (node.children && node.children.length > 0) {
                        node.children.forEach((child: any) => processTreeNode(child))
                    }
                }

                // Process all root level nodes
                treeData.forEach(node => processTreeNode(node))

                return fileIndexMap
            }

            // Generate SubFileStructure from current tree data
            const generateSubFileStructure = (fileIndexMap: Map<string, number>): any[] => {
                const structure: any[] = []

                const processTreeNode = (node: any, depth: number = 0): void => {
                    if (node.data?.type === 'Folder') {
                        // Add folder entry
                        structure.push({
                            type: 'Folder',
                            Name: node.name,
                            unk1: node.data.unk1 || "00000000",
                            folderCount: node.children?.length || 0,
                            unk2: node.data.unk2 || "00000000",
                            unk3: node.data.unk3 || 32,
                            unk4: node.data.unk4 || 1
                        })

                        // Process children
                        if (node.children && node.children.length > 0) {
                            node.children.forEach((child: any) => {
                                processTreeNode(child, depth + 1)
                            })
                        }

                        // Add EndMark after folder contents
                        structure.push({
                            type: 'EndMark',
                            endMarkCount: 1
                        })

                    } else if (node.data?.type === 'Item') {
                        // Get fileIndex from the unified mapping
                        const fileIndex = fileIndexMap.get(node.data.fileUrl || node.name)!

                        structure.push({
                            type: 'Item',
                            Name: node.name,
                            unk1: node.data.unk1 || "00000000",
                            fileIndex: fileIndex,
                            unk2: node.data.unk2 || "00000000",
                            unk3: node.data.unk3 || 0,
                            originalFileIndex: fileIndex
                        })
                    }
                }

                // Process all root level nodes
                treeData.forEach(node => processTreeNode(node))

                return structure
            }

            // Generate SubFileData based on tree structure
            const generateSubFileData = (fileIndexMap: Map<string, number>): any[] => {
                const subFileData: any[] = []
                const processedFileUrls = new Set<string>()
                let sequentialIndex = 0

                const processTreeNode = (node: any): void => {
                    if (node.data?.type === 'Item') {
                        // Format fileUrl to use backslashes
                        const originalFileUrl = node.data.fileUrl || ''
                        const formattedFileUrl = originalFileUrl.replace(/\//g, '\\')

                        // Skip if this fileUrl has already been processed
                        if (processedFileUrls.has(formattedFileUrl)) {
                            return
                        }

                        // Mark as processed
                        processedFileUrls.add(formattedFileUrl)

                        // Get fileIndex from the unified mapping
                        const fileIndex = fileIndexMap.get(node.data.fileUrl || node.name)!

                        // Find corresponding file info
                        const fileInfo = files.find(f =>
                            f.path.replace(/\\/g, '/') === (node.data.fileUrl || '').replace(/\\/g, '/')
                        )

                        subFileData.push({
                            index: sequentialIndex,
                            fileType: node.data.fileType || '.bin',
                            fileIndex: fileIndex,
                            fileUrl: formattedFileUrl || `.\\unknown\\${fileIndex}.bin`
                        })
                        sequentialIndex++
                    }

                    // Process children recursively
                    if (node.children && node.children.length > 0) {
                        node.children.forEach((child: any) => processTreeNode(child))
                    }
                }

                // Process all root level nodes
                treeData.forEach(node => processTreeNode(node))

                return subFileData
            }

            // Create unified fileIndex mapping
            const fileIndexMap = createFileIndexMapping()

            // Generate updated data using the unified mapping
            const subFileStructure = generateSubFileStructure(fileIndexMap)
            const subFileData = generateSubFileData(fileIndexMap)

            // Generate the JSON data with synchronized fileIndex
            const jsonData = {
                SubFileData: subFileData,
                SubFileStructure: subFileStructure
            }

            // Create the data.json file path (same level as /data folder)
            const dataJsonPath = `${selectedFolder}/data.json`

            // Write the JSON file
            await writeTextFile(dataJsonPath, JSON.stringify(jsonData, null, 2))

            alert(`data.json generated successfully at: ${dataJsonPath}`)
        } catch (error) {
            console.error("Error generating data.json:", error)
            alert("Failed to generate data.json. Please check the console for details.")
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                    Open Template JSON Generator
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Template JSON Generator</DialogTitle>
                    <DialogDescription>
                        Generate template JSON files by scanning a folder structure. Only files within the /data directory will be processed.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="modal" className="w-full">
                    <TabsList className="grid w-full grid-cols-1">
                        <TabsTrigger value="modal">Modal</TabsTrigger>
                    </TabsList>

                    <TabsContent value="modal" className="space-y-4">
                        <FolderSelector
                            selectedFolder={selectedFolder}
                            setSelectedFolder={setSelectedFolder}
                            isLoading={isLoading}
                            setIsLoading={setIsLoading}
                            setFiles={setFiles}
                            setNutexbFiles={setNutexbFiles}
                            setCompleteProjectData={setCompleteProjectData}
                            setSettings={setSettings}
                        />

                        <ProjectStructure
                            files={files}
                            settings={settings}
                            completeProjectData={completeProjectData}
                            selectedFolder={selectedFolder}
                            onGenerateJson={handleGenerateJson}
                            mode="Model"
                        />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
