import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { save, message } from "@tauri-apps/plugin-dialog"
import { writeTextFile } from "@tauri-apps/plugin-fs"

interface TemplateSettings {
    nusktb: string
    numatb1: string
    numatb2: string
    numshb: string
    numdlb: string
    bin: string
}

interface FileInfo {
    name: string
    path: string
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

interface TreeDataItem {
    id: string
    name: string
    children?: TreeDataItem[]
    data?: {
        type: 'Folder' | 'Item' | 'EndMark'
        index?: number
        fileType?: string
        fileIndex?: number
        fileUrl?: string
        originalFileIndex?: number
        folderCount?: number
        endMarkCount?: number
        unk1?: string
        unk2?: string
        unk3?: number
        unk4?: number
    }
}

interface FileSettingsProps {
    files: FileInfo[]
    settings: TemplateSettings
    nutexbFiles: FileInfo[]
    completeProjectData: TemplateProjectData | null
    treeData: TreeDataItem[]
    selectedItem: TreeDataItem | null
    copiedItem: TreeDataItem | null
    onSettingChange: (key: keyof TemplateSettings, value: string) => void
    onResetAll: () => void
}

export function FileSettings({
    files,
    settings,
    nutexbFiles,
    completeProjectData,
    treeData,
    selectedItem,
    copiedItem,
    onSettingChange,
    onResetAll
}: FileSettingsProps) {
    const handleGenerateTemplate = async () => {
        if (!completeProjectData) {
            alert("No template data available. Please scan a folder first.")
            return
        }

        try {
            const savePath = await save({
                filters: [
                    {
                        name: 'JSON Files',
                        extensions: ['json']
                    }
                ]
            })

            if (savePath) {
                const jsonString = JSON.stringify(completeProjectData, null, 2)
                await writeTextFile(savePath, jsonString)
                alert(`Template JSON generated successfully at: ${savePath}`)
            }
        } catch (error) {
            console.error("Error generating template:", error)
            alert("Failed to generate template JSON: " + (error as Error).message)
        }
    }

    const resetAll = () => {
        onResetAll()
    }

    return (
        files.length > 0 && (
            <Card>
                <CardHeader>
                    <CardTitle>Settings</CardTitle>
                    <CardDescription>
                        Configure file mappings for template generation.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Region 1: File Path Settings */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">File Path Settings</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="nusktb">1. .nusktb的文件路径</Label>
                                <Input
                                    id="nusktb"
                                    value={settings.nusktb}
                                    onChange={(e) => onSettingChange('nusktb', e.target.value)}
                                    placeholder="如果打开的文件夹已经有，那就用第一个找到的.nusktb"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="numatb1">2. .numatb(1)的文件路径</Label>
                                <Input
                                    id="numatb1"
                                    value={settings.numatb1}
                                    onChange={(e) => onSettingChange('numatb1', e.target.value)}
                                    placeholder="如果打开的文件夹已经有，那就用第一个找到的.numatb"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="numatb2">3. .numatb(2)的文件路径</Label>
                                <Input
                                    id="numatb2"
                                    value={settings.numatb2}
                                    onChange={(e) => onSettingChange('numatb2', e.target.value)}
                                    placeholder="如果打开的文件夹已经有，那就用第一个找到的.numatb"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="numshb">4. .numshb的文件路径</Label>
                                <Input
                                    id="numshb"
                                    value={settings.numshb}
                                    onChange={(e) => onSettingChange('numshb', e.target.value)}
                                    placeholder="如果打开的文件夹已经有，那就用第一个找到的.numshb"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="numdlb">5. .numdlb的文件路径</Label>
                                <Input
                                    id="numdlb"
                                    value={settings.numdlb}
                                    onChange={(e) => onSettingChange('numdlb', e.target.value)}
                                    placeholder="如果打开的文件夹已经有，那就用第一个找到的.numdlb"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="bin">6. .bin "注释，JNTT"的文件路径</Label>
                                <Input
                                    id="bin"
                                    value={settings.bin}
                                    onChange={(e) => onSettingChange('bin', e.target.value)}
                                    placeholder="如果打开的文件夹已经有，那就用第一个找到的.bin"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Region 2: Nutexb Paths */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Nutexb Paths</h3>
                        <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
                            {nutexbFiles.length > 0 ? (
                                <div className="space-y-2">
                                    {nutexbFiles.map((file, index) => (
                                        <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                                            <span className="font-mono text-sm">{file.name}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {file.path.replace(/\\/g, '/')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-muted-foreground">No .nutexb files found in the selected folder.</p>
                            )}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2">
                        <Button
                            onClick={resetAll}
                            variant="outline"
                        >
                            Reset All
                        </Button>
                        <Button onClick={handleGenerateTemplate}>
                            Generate Template JSON
                        </Button>
                    </div>
                </CardContent>
            </Card>
        )
    )
}
