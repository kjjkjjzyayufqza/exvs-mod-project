import { useState } from "react"
import { FileJson } from "lucide-react"
import { useShallow } from "zustand/react/shallow"
import { AppRndModalShell } from "@/components/AppRndModalShell"
import { Button } from "@/components/ui/button"
import { FolderSelector } from "./components/FolderSelector"
import { ProjectStructure } from "./components/ProjectStructure"
import { useTemplateStore } from "@/store/templateStore"
import { writeTextFile } from "@tauri-apps/plugin-fs"
import { useTranslation } from "react-i18next"

const TEMPLATE_GENERATOR_DIMENSIONS = {
    width: 1200,
    height: 820,
    minWidth: 760,
    minHeight: 540,
}

export function TemplateJsonGenerator() {
    const { t } = useTranslation("misc-tools-b")
    const [isOpen, setIsOpen] = useState(false)
    const {
        selectedFolder,
        setSelectedFolder,
        isLoading,
        setIsLoading,
        files,
        setFiles,
        setNutexbFiles,
        completeProjectData,
        setCompleteProjectData,
        setSettings,
        settings,
        treeData,
    } = useTemplateStore(
        useShallow((state) => ({
            selectedFolder: state.selectedFolder,
            setSelectedFolder: state.setSelectedFolder,
            isLoading: state.isLoading,
            setIsLoading: state.setIsLoading,
            files: state.files,
            setFiles: state.setFiles,
            setNutexbFiles: state.setNutexbFiles,
            completeProjectData: state.completeProjectData,
            setCompleteProjectData: state.setCompleteProjectData,
            setSettings: state.setSettings,
            settings: state.settings,
            treeData: state.treeData,
        })),
    )

    const handleSettingChange = (key: keyof typeof settings, value: string) => {
        setSettings({ ...settings, [key]: value })
    }

    const handleGenerateJson = async () => {
        if (!selectedFolder || !completeProjectData) {
            alert(t("template.selectFirst"))
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

            alert(t("template.generated", { path: dataJsonPath }))
        } catch (error) {
            console.error("Error generating data.json:", error)
            alert(t("template.failed"))
        }
    }

    return (
        <>
            <Button variant="outline" className="w-full" onClick={() => setIsOpen(true)}>
                {t("template.open")}
            </Button>
            {isOpen ? (
                <AppRndModalShell
                    titleId="template-json-generator-title"
                    title={t("template.title")}
                    subtitle={t("template.subtitle")}
                    headerIcon={<FileJson className="h-5 w-5 text-primary" />}
                    dimensions={TEMPLATE_GENERATOR_DIMENSIONS}
                    storageKey="app.rnd-size.template-json-generator"
                    onClose={() => setIsOpen(false)}
                    closeDisabled={isLoading}
                >
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
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
                    </div>
                </AppRndModalShell>
            ) : null}
        </>
    )
}
