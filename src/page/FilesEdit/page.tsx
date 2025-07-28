import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen, Loader2, Plus, ImageIcon } from "lucide-react";
import { readDir, readFile, exists } from "@tauri-apps/plugin-fs";
import { FileList } from "./components/FileList";
import { FileTypeDialog } from "./components/FileTypeDialog";
import { CONVERT_DIR_NAME, FileInfo as NumatbFileInfo, useNumatbStore } from "../../store/numatbStore";
import { FileInfo as NutexbFileInfo } from "../../store/nutexbStore";
import { useNutexbStore } from "../../store/nutexbStore";
import { Button } from "../../components/ui/button";
import { resourceDir, dirname, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { findNutexbString } from "../../module/commonFunc";
import { Command } from '@tauri-apps/plugin-shell';

// Extend FileInfo to include possible properties
interface ExtendedFileInfo extends NumatbFileInfo, NutexbFileInfo {
  previewPath?: string | null;
  string?: string;  // Make string property optional
}

type FileInfo = ExtendedFileInfo;

export default function FilesEdit() {
  const [folderPath, setFolderPath] = useState("");
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [handleDebugRepack, setHandleDebugRepack] = useState(false);
  const [isConvertingNutexb, setIsConvertingNutexb] = useState(false);

  const convertNumatbFile = useNumatbStore((e) => e.convertFile);
  const resetNumatbConversion = useNumatbStore((e) => e.resetConversion);

  const convertNutexbFile = useNutexbStore((e) => e.convertFile);
  const resetNutexbConversion = useNutexbStore((e) => e.resetConversion);

  const getNutexbFileInfos = useNutexbStore((e) => e.getFileInfos);
  const cacheNutexbFile = useNutexbStore((e) => e.cacheFile);

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

  const checkExistingPreview = async (file: FileInfo, folderPath: string) => {
    try {
      const convertDirPath = await join(folderPath, CONVERT_DIR_NAME);
      const outputFileName = file.name.replace(".nutexb", "_convert.png");
      const previewPath = await join(convertDirPath, outputFileName);
      
      const previewExists = await exists(previewPath);
      if (previewExists) {
        return previewPath;
      }
    } catch (e) {
      console.error("Error checking existing preview:", e);
    }
    return null;
  };

  const handleFileTypeSelect = async (fileType: string) => {
    console.log("File creation completed for type:", fileType);
    
    // Refresh the file list after successful file creation
    if (folderPath) {
      setIsLoading(true);
      try {
        const entries = await readDir(folderPath);
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
            path: folderPath + "/" + entry.name
          })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        
        // Get file info and check for existing previews
        for (const file of filteredEntries) {
          if (file.name.endsWith('.nutexb')) {
            try {
              const info = await getNutexbFileInfos(file);
              file.string = info.string;
              
              // Check for existing preview
              const existingPreview = await checkExistingPreview(file, folderPath);
              if (existingPreview) {
                file.previewPath = existingPreview;
              }
              
              // Keep existing previewPath if available from previous state
              const existingFile = files.find(f => f.name === file.name);
              if (existingFile?.previewPath && !file.previewPath) {
                file.previewPath = existingFile.previewPath;
              }
            } catch (e) {
              console.error("Error getting Nutexb file info:", e);
            }
          }
        }
        setFiles(filteredEntries);
      } catch (error) {
        console.error("Error refreshing directory:", error);
      } finally {
        setIsLoading(false);
      }
    }
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
        
        // Get file info and check for existing previews
        for (const file of filteredEntries) {
          if (file.name.endsWith('.nutexb')) {
            try {
              const info = await getNutexbFileInfos(file);
              file.string = info.string;
              
              // Check for existing preview
              const existingPreview = await checkExistingPreview(file, selected);
              if (existingPreview) {
                file.previewPath = existingPreview;
              }
            } catch (e) {
              console.error("Error getting Nutexb file info:", e);
            }
          }
        }
        setFiles(filteredEntries);
      } catch (error) {
        console.error("Error reading directory:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleConvertAllNutexb = async () => {
    setIsConvertingNutexb(true);
    try {
      const nutexbFiles = files.filter(file => file.name.endsWith('.nutexb'));
      const updatedFiles = [...files];
      
      for (const file of nutexbFiles) {
        try {
          const cache = await cacheNutexbFile(file);
          if (cache) {
            const index = updatedFiles.findIndex(f => f.name === file.name);
            if (index !== -1) {
              updatedFiles[index] = {
                ...updatedFiles[index],
                previewPath: cache.outputPath,
                string: cache.nutexbInfo.string || updatedFiles[index].string
              };
            }
          }
        } catch (e) {
          console.error("Error converting Nutexb file:", file.name, e);
        }
      }
      
      setFiles(updatedFiles);
    } catch (error) {
      console.error("Error during batch conversion:", error);
    } finally {
      setIsConvertingNutexb(false);
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
        <Button 
          onClick={handleConvertAllNutexb} 
          disabled={isConvertingNutexb || files.filter(f => f.name.endsWith('.nutexb')).length === 0} 
          size="sm"
          variant="outline"
        >
          {isConvertingNutexb && <Loader2 className="animate-spin mr-2" />}
          <ImageIcon className="h-4 w-4 mr-2" />
          Convert Nutexb to PNG
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-6 flex-1">
        <div className="col-span-2 bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Files</h3>
            <FileTypeDialog 
              onFileTypeSelect={handleFileTypeSelect}
              currentDirectory={folderPath}
            >
              <Button size="sm" variant="outline" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add File
              </Button>
            </FileTypeDialog>
          </div>
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
