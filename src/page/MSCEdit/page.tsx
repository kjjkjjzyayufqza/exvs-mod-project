import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen, Loader2 } from "lucide-react";
import { readDir } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import { Command } from '@tauri-apps/plugin-shell';
import { FileList } from "./components/FileList";
import { resourceDir } from "@tauri-apps/api/path";

interface FileInfo {
  name: string;
  path: string;
}

export default function MSCEdit() {
  const [folderPath, setFolderPath] = useState("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [handleDebugRepack, setHandleDebugRepack] = useState(false);

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
          .filter((entry) => {
            // Only show .bin and .c files
            return entry.name?.endsWith('.bin') || entry.name?.endsWith('.c') || entry.name?.endsWith('.txt');
          })
          .map(entry => ({
            name: entry.name || "",
            path: selected + "/" + entry.name
          }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

        setFiles(filteredEntries);
      } catch (error) {
        console.error("Error reading directory:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleTestRepack = async () => {
    try {
      setHandleDebugRepack(true);
      const toolPath = "E:\\XB\\解包\\com\\compression.js";
      const filePath = folderPath + "_structure.json"
      const command = await Command.create('exec-node', [
        toolPath,
        filePath,
        "-r",
        "-com-path",
        folderPath.split("\\").slice(0, -1).join("\\") + "\\"
      ], { encoding: 'utf-8' }).execute();
      if (command.code !== 0) {
        console.error("Repack failed:", command.stderr);
      }
      console.log("Repack completed");
      setHandleDebugRepack(false);
    } catch (error) {
      console.error("Error during repack:", error);
      setHandleDebugRepack(false);
    }
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight mb-4">MSC Editor</h2>
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
      <div className="mb-4 flex gap-2">
        <Button onClick={handleTestRepack} disabled={handleDebugRepack} size="sm">
          {handleDebugRepack && <Loader2 className="animate-spin" />}
          Repack
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-6 flex-1">
        <div className="col-span-1 bg-white rounded-lg shadow-sm border p-4">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">MSC Files</h3>
          <FileList
            files={files}
            isLoading={isLoading}
            folderPath={folderPath}
          />
        </div>
      </div>
    </div>
  );
}
