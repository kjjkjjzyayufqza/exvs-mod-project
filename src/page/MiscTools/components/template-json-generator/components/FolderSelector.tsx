import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { open } from "@tauri-apps/plugin-dialog"
import { readDir } from "@tauri-apps/plugin-fs"
import { FolderOpen, Loader2, AlertTriangle } from "lucide-react"
import { useTemplateStore } from "@/store/templateStore"

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

const ALLOWED_EXTENSIONS = ['.bin', '.nusktb', '.numatb', '.numshb', '.numdlb', '.nutexb']

interface FolderSelectorProps {
    selectedFolder: string
    setSelectedFolder: (folder: string) => void
    isLoading: boolean
    setIsLoading: (loading: boolean) => void
    setFiles: (files: FileInfo[]) => void
    setNutexbFiles: (files: FileInfo[]) => void
    setCompleteProjectData: (data: TemplateProjectData | null) => void
    setSettings: (settings: TemplateSettings) => void
}

export function FolderSelector({
    selectedFolder,
    setSelectedFolder,
    isLoading,
    setIsLoading,
    setFiles,
    setNutexbFiles,
    setCompleteProjectData,
    setSettings
}: FolderSelectorProps) {
    const { resetAll } = useTemplateStore()
    const handleFolderSelect = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
            })

            if (selected && !Array.isArray(selected)) {
                await scanFolder(selected)
                setSelectedFolder(selected) // Set selected folder after resetting store
            }
        } catch (error) {
            console.error("Error selecting folder:", error)
        }
    }

    // Recursive function to scan all files in directory and subdirectories
    const scanDirectoryRecursive = async (dirPath: string, basePath: string): Promise<FileInfo[]> => {
        const files: FileInfo[] = []

        try {
            const entries = await readDir(dirPath)

            for (const entry of entries) {
                if (entry.isFile && entry.name) {
                    // Check if file has allowed extension
                    const extension = entry.name.substring(entry.name.lastIndexOf('.')).toLowerCase()
                    if (ALLOWED_EXTENSIONS.includes(extension)) {
                        files.push({
                            name: entry.name,
                            path: `${dirPath}/${entry.name}`
                        })
                    }
                } else if (entry.isDirectory && entry.name) {
                    // Recursively scan subdirectories
                    const subDirFiles = await scanDirectoryRecursive(`${dirPath}/${entry.name}`, basePath)
                    files.push(...subDirFiles)
                }
            }
        } catch (error) {
            console.error(`Error scanning directory ${dirPath}:`, error)
        }

        return files
    }

    const scanFolder = async (folderPath: string) => {
        setIsLoading(true)
        try {
            // Reset all store data when selecting a new folder
            resetAll()
            // Check if there's a /data directory
            const entries = await readDir(folderPath)
            const dataDir = entries.find(entry => entry.name === 'data' && entry.isDirectory)

            if (!dataDir) {
                alert("Selected folder must contain a 'data' directory. Only files within the data directory will be processed.")
                setSelectedFolder("")
                return
            }

            // Recursively scan all files in the data directory and subdirectories
            const dataPath = `${folderPath}/data`
            const allFiles = await scanDirectoryRecursive(dataPath, dataPath)

            // Sort files by name
            const filteredFiles = allFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

            console.log(filteredFiles)
            setFiles(filteredFiles)

            // Extract nutexb files
            const nutexbFilesFiltered = filteredFiles.filter(file =>
                file.name.toLowerCase().endsWith('.nutexb')
            )
            setNutexbFiles(nutexbFilesFiltered)

            // Generate SubFileData from scanned files
            const generateSubFileData = (): SubFileDataItem[] => {
                const subFileData: SubFileDataItem[] = []

                filteredFiles.forEach((file, index) => {
                    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
                    subFileData.push({
                        index: index,
                        fileType: extension,
                        fileIndex: index,
                        fileUrl: `.\\${file.name}`
                    })
                })

                return subFileData
            }

            // Generate SubFileStructure with dynamic fileIndex and originalFileIndex
            const generateSubFileStructure = (): SubFileStructureItem[] => {
                const structure: SubFileStructureItem[] = []

                // For now, create a simple structure based on the files we have
                // Add a root folder
                structure.push({
                    "type": "Folder",
                    "unk1": "00000000",
                    "folderCount": filteredFiles.length,
                    "unk2": "00000000",
                    "unk3": 0,
                    "unk4": 0
                })

                // Add items for each file
                filteredFiles.forEach((file, index) => {
                    structure.push({
                        "type": "Item",
                        "unk1": "00000000",
                        "fileIndex": index,
                        "unk2": "00000000",
                        "unk3": 0,
                        "originalFileIndex": index
                    })
                })

                // Add EndMark
                structure.push({
                    "type": "EndMark",
                    "endMarkCount": 1
                })

                return structure
            }

            // Generate SubFileData and SubFileStructure
            const subFileData = generateSubFileData()
            const subFileStructure = generateSubFileStructure()

            // Set complete project data
            setCompleteProjectData({
                Magic: 0, // Using the magic from the example file
                Fhm2dTotalCount: subFileData.length,
                UnkCount: 0,
                SubFileData: subFileData,
                SubFileStructure: subFileStructure
            })

            // Auto-fill settings if files exist - use the first found file for each type
            const nusktbFile = filteredFiles.find(file => file.name.toLowerCase().endsWith('.nusktb'))
            const numatbFiles = filteredFiles.filter(file => file.name.toLowerCase().endsWith('.numatb'))
            const numshbFile = filteredFiles.find(file => file.name.toLowerCase().endsWith('.numshb'))
            const numdlbFile = filteredFiles.find(file => file.name.toLowerCase().endsWith('.numdlb'))
            const binFile = filteredFiles.find(file => file.name.toLowerCase().endsWith('.bin'))

            setSettings({
                nusktb: nusktbFile ? nusktbFile.path.replace(/\\/g, '/') : "",
                numatb1: numatbFiles.length > 0 ? numatbFiles[0].path.replace(/\\/g, '/') : "",
                numatb2: numatbFiles.length > 1 ? numatbFiles[1].path.replace(/\\/g, '/') : "",
                numshb: numshbFile ? numshbFile.path.replace(/\\/g, '/') : "",
                numdlb: numdlbFile ? numdlbFile.path.replace(/\\/g, '/') : "",
                bin: binFile ? binFile.path.replace(/\\/g, '/') : ""
            })

        } catch (error) {
            console.error("Error scanning folder:", error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FolderOpen className="h-5 w-5" />
                    Folder Selection
                </CardTitle>
                <CardDescription>
                    Select a folder containing a /data directory. Only files within the data directory will be processed.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            value={selectedFolder}
                            readOnly
                            placeholder="No folder selected"
                        />
                        <Button
                            onClick={handleFolderSelect}
                            disabled={isLoading}
                            variant="outline"
                        >
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <FolderOpen className="h-4 w-4" />
                            )}
                            Select Folder
                        </Button>
                    </div>

                    {selectedFolder && (
                        <Alert>
                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                            <AlertDescription className="text-orange-600">
                                Selected folder: {selectedFolder}
                                <br />
                                Only files with extensions {ALLOWED_EXTENSIONS.join(', ')} within the /data directory will be processed.
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
