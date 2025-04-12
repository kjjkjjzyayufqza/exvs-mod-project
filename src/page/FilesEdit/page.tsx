import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen, Loader2 } from "lucide-react";
import { readDir, readFile } from "@tauri-apps/plugin-fs";
import { FileList } from "./components/FileList";
import { CONVERT_DIR_NAME, FileInfo as NumatbFileInfo, useNumatbStore } from "../../store/numatbStore";
import { FileInfo as NutexbFileInfo } from "../../store/nutexbStore";
import { useNutexbStore } from "../../store/nutexbStore";
import { Button } from "../../components/ui/button";
import { resourceDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { findNutexbString } from "../../module/commonFunc";
import { Command } from '@tauri-apps/plugin-shell';

type FileInfo = NumatbFileInfo | NutexbFileInfo;

export default function FilesEdit() {
  const [folderPath, setFolderPath] = useState("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [handleDebugRepack, setHandleDebugRepack] = useState(false);

  const convertNumatbFile = useNumatbStore((e) => e.convertFile);
  const resetNumatbConversion = useNumatbStore((e) => e.resetConversion);

  const convertNutexbFile = useNutexbStore((e) => e.convertFile);
  const resetNutexbConversion = useNutexbStore((e) => e.resetConversion);

  const getFileInfos = useNutexbStore((e) => e.getFileInfos);

  const convertFile = (file: FileInfo) => {
    if (file.name.endsWith('.numatb')) {
      convertNumatbFile(file);
    } else if (file.name.endsWith('.nutexb')) {
      convertNutexbFile(file);
    }
  };

  const resetConversion = () => {
    resetNumatbConversion();
    resetNutexbConversion();
  };

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
        const filteredEntries: any[] = entries
          .filter((entry) => entry.isFile)
          .filter((entry) => {
            // remove "__convert" folder and files
            if (entry.name === CONVERT_DIR_NAME) {
              return false;
            } else {
              return true;
            }
          })
          .map(entry => ({
            name: entry.name || "",
            path: selected + "/" + entry.name
          })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        for (const file of filteredEntries) {
          if (file.name.endsWith('.nutexb')) {
            const fileBuffer = await readFile(file.path);
            const string = findNutexbString(fileBuffer);
            if (string !== null) {
              file.string = string;
            }
          }
        }
        console.log("done")
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
        "-r"
      ], { encoding: 'utf-8' }).execute();
      if(command.code !== 0) {
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
      <div className="mb-4 flex gap-2">
        <Button onClick={handleTestRepack} disabled={handleDebugRepack} size="sm">
          {handleDebugRepack && <Loader2 className="animate-spin" />}
          Repack
        </Button>
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
