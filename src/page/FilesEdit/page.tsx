import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen } from "lucide-react";
import { readDir } from "@tauri-apps/plugin-fs";
import { FileList } from "./components/FileList";
import { FileInfo, useNumatbStore } from "../../store/numatbStore";

export default function FilesEdit() {
  const [folderPath, setFolderPath] = useState("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const convertFile = useNumatbStore((e) => e.convertFile);
  const resetConversion = useNumatbStore((e) => e.resetConversion);

  const handleFolderSelect = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected && !Array.isArray(selected)) {
      setFolderPath(selected);
      setIsLoading(true);
      try {
        const entries = await readDir(selected);
        const filteredEntries = entries
          .filter((entry) => entry.isFile)
          .map(entry => ({
            name: entry.name || "",
            path: selected + "/" + entry.name
          })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        setFiles(filteredEntries);
      } catch (error) {
        console.error("Error reading directory:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="h-full flex flex-col p-6 bg-gray-50/30">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight mb-4">Files Editor</h2>
        <div className="max-w-xl">
          <Label htmlFor="folder-input" className="text-sm font-medium mb-2 block text-gray-600">
            Select Folder
          </Label>
          <div className="relative">
            <FolderOpen className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 h-5 w-5" />
            <Input
              id="folder-input"
              value={folderPath}
              onClick={handleFolderSelect}
              readOnly
              placeholder="Click to select folder"
              className="pl-10 cursor-pointer hover:bg-gray-50 transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 flex-1">
        <div className="col-span-2 bg-white rounded-lg shadow-sm border p-4">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Files</h3>
          <FileList
            files={files}
            isLoading={isLoading}
            folderPath={folderPath}
            onFileSelect={convertFile}
            resetConversion={resetConversion}
          />
        </div>
      </div>
    </div>
  );
}
