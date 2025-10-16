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
import { FileSettings } from "./components/FileSettings"
import { ProjectStructure } from "./components/ProjectStructure"
import { useTemplateStore } from "@/store/templateStore"

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

                        <FileSettings
                            files={files}
                            settings={settings}
                            nutexbFiles={nutexbFiles}
                            completeProjectData={completeProjectData}
                            treeData={treeData}
                            selectedItem={selectedItem}
                            copiedItem={copiedItem}
                            onSettingChange={handleSettingChange}
                            onResetAll={resetAll}
                        />

                        <ProjectStructure
                            files={files}
                            settings={settings}
                        />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    )
}
