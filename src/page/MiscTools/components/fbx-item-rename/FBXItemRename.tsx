import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { open, save } from "@tauri-apps/plugin-dialog"
import { readFile, writeFile } from "@tauri-apps/plugin-fs"
import { FBXLoader } from "three-stdlib"
import JsonView from "@uiw/react-json-view"
import { useDebounce } from "use-debounce"

export function FBXItemRename() {
    const [fbxPath, setFbxPath] = useState("")
    const [isOpen, setIsOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [fbxData, setFbxData] = useState<Uint8Array | null>(null)
    const [fbxObject, setFbxObject] = useState<any>(null)
    const [fbxItems, setFbxItems] = useState<{
        mesh: { id: string, name: string }[],
        bone: { id: string, name: string }[]
    }>({ mesh: [], bone: [] })
    const [jsonText, setJsonText] = useState<string>("")
    const [debouncedJsonText] = useDebounce(jsonText, 500)

    const handleSelectFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                directory: false,
                filters: [
                    {
                        name: "FBX Files",
                        extensions: ["fbx"]
                    }
                ]
            })

            if (selected && typeof selected === "string") {
                setFbxPath(selected)
                await loadFBXFile(selected)
            }
        } catch (error) {
            console.error("Error selecting file:", error)
        }
    }

    const handleJsonTextChange = (text: string) => {
        setJsonText(text)
    }

    // Update fbxItems when debounced json text changes
    useEffect(() => {
        try {
            const parsed = JSON.parse(debouncedJsonText)
            if (parsed && typeof parsed === 'object') {
                const updatedMeshes = fbxItems.mesh.map((item, index) => ({
                    ...item,
                    name: parsed.mesh && parsed.mesh[index] ? parsed.mesh[index] : item.name
                }))
                const updatedBones = fbxItems.bone.map((item, index) => ({
                    ...item,
                    name: parsed.bone && parsed.bone[index] ? parsed.bone[index] : item.name
                }))
                setFbxItems({
                    mesh: updatedMeshes,
                    bone: updatedBones
                })
            }
        } catch (error) {
            // Invalid JSON, don't update fbxItems
            console.log("Invalid JSON format")
        }
    }, [debouncedJsonText, fbxItems.mesh.length, fbxItems.bone.length])

    const handleSaveFile = async () => {
        if (!fbxData) {
            console.error("No FBX data to save")
            return
        }

        try {
            const savePath = await save({
                filters: [
                    {
                        name: "FBX Files",
                        extensions: ["fbx"]
                    },
                    {
                        name: "JSON Files",
                        extensions: ["json"]
                    }
                ]
            })

            if (savePath) {
                // Check if user wants to save as JSON (name mapping) or FBX
                if (savePath.toLowerCase().endsWith('.json')) {
                    // Save name mapping as JSON
                    const nameMapping = {
                        originalFile: fbxPath,
                        modifiedItems: fbxItems,
                        exportDate: new Date().toISOString(),
                        note: "This file contains the name mappings for the FBX file. The actual FBX file cannot be modified due to technical limitations."
                    }
                    const jsonContent = JSON.stringify(nameMapping, null, 2)
                    await writeFile(savePath, new TextEncoder().encode(jsonContent))
                    console.log("Name mapping saved as JSON to:", savePath)
                } else {
                    // Save original FBX file with a warning
                    await writeFile(savePath, fbxData)
                    console.log("FBX file saved successfully to:", savePath)
                    console.log("WARNING: Name changes are NOT applied to the FBX file due to technical limitations")
                    console.log("Consider saving as JSON to preserve the name mappings")
                    console.log("Edited names:", fbxItems)
                }
            }
        } catch (error) {
            console.error("Error saving file:", error)
        }
    }

    const loadFBXFile = async (filePath: string) => {
        setIsLoading(true)
        try {
            // Read the FBX file as binary data
            const fileData = await readFile(filePath)
            setFbxData(fileData)

            // Create a File object from the binary data
            const file = new File([fileData], "model.fbx", { type: "application/octet-stream" })

            // Create FBX loader
            const loader = new FBXLoader()

            // Load the FBX file
            const object = await new Promise<any>((resolve, reject) => {
                loader.load(
                    URL.createObjectURL(file),
                    (fbx) => resolve(fbx),
                    (progress) => {
                        console.log("Loading progress:", (progress.loaded / progress.total * 100) + "%")
                    },
                    (error) => reject(error)
                )
            })

            // Save the loaded FBX object
            setFbxObject(object)

            // Parse mesh and bone names with IDs
            const meshes: { id: string, name: string }[] = []
            const bones: { id: string, name: string }[] = []

            object.traverse((child: any) => {
                if (child.isMesh && child.material && child.material.name) {
                    const meshId = `mesh_${meshes.length}`
                    meshes.push({
                        id: meshId,
                        name: child.material.name
                    })
                }
                if (child.isBone && child.name) {
                    const boneId = `bone_${bones.length}`
                    bones.push({
                        id: boneId,
                        name: child.name
                    })
                }
            })

            setFbxItems({ mesh: meshes, bone: bones })

            // Update JSON text for editing
            const jsonData = {
                mesh: meshes.map(item => item.name),
                bone: bones.map(item => item.name)
            }
            setJsonText(JSON.stringify(jsonData, null, 2))


            // Traverse and log all objects in the FBX
            object.traverse((child: any) => {
                console.log("Object:", child.name, child.type, child)
                if (child.geometry) {
                    console.log("  Geometry:", child.geometry)
                }
                if (child.material) {
                    console.log("  Material:", child.material)
                }
            })

            console.log("FBX loading completed successfully!")

        } catch (error) {
            console.error("Error loading FBX file:", error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                    Open FBX Item Rename
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[1000px] max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle>FBX Item Rename</DialogTitle>
                    <DialogDescription>
                        Select an FBX file to load and rename its mesh/bone items. Save as FBX (original file) or JSON (name mappings).
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {!fbxData ? (
                        <div className="flex justify-center">
                            <Button
                                onClick={handleSelectFile}
                                disabled={isLoading}
                                size="lg"
                            >
                                {isLoading ? "Loading..." : "Select FBX File"}
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-4">
                                <div className="text-center text-sm text-muted-foreground">
                                    Loaded: {fbxPath}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* Left panel - JSON Preview */}
                                    <div className="border rounded-lg p-4">
                                        <h3 className="text-lg font-semibold mb-2">JSON Preview</h3>
                                        <div className="max-h-96 overflow-auto">
                                            <JsonView
                                                value={{
                                                    mesh: fbxItems.mesh.map(item => item.name),
                                                    bone: fbxItems.bone.map(item => item.name)
                                                }}
                                                displayDataTypes={false}
                                                style={{ fontSize: '14px' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Right panel - JSON Editor */}
                                    <div className="border rounded-lg p-4">
                                        <h3 className="text-lg font-semibold mb-2">JSON Editor</h3>
                                        <div className="max-h-96 overflow-auto">
                                            <textarea
                                                className="w-full h-full min-h-[300px] font-mono text-sm border-none outline-none resize-none"
                                                value={jsonText}
                                                onChange={(e) => handleJsonTextChange(e.target.value)}
                                                placeholder="Edit JSON here..."
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-center gap-2">
                                    <Button
                                        onClick={handleSelectFile}
                                        variant="outline"
                                        disabled={isLoading}
                                    >
                                        Load Another FBX
                                    </Button>
                                    <Button
                                        onClick={handleSaveFile}
                                        disabled={isLoading}
                                    >
                                        Save FBX File
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
                {isLoading && (
                    <div className="text-center text-sm text-muted-foreground">
                        Loading FBX file, please check console for details...
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
