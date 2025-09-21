import { FileEdit, FolderOpen, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { FileDialog } from './FileDialog';
import { NutexbDialog } from './NutexbDialog';
import { FileInfo as NumatbFileInfo } from "../../../store/numatbStore";
import { FileInfo as NutexbFileInfo, useNutexbStore } from "../../../store/nutexbStore";
import { readDir } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";

// Extend FileInfo to include possible properties
interface ExtendedFileInfo extends NumatbFileInfo, NutexbFileInfo {
  previewPath?: string | null;
  string?: string;  // Make string property optional
}

type FileInfo = ExtendedFileInfo;

interface FileListProps {
  files: FileInfo[];
  isLoading: boolean;
  folderPath: string;
  onFileSelect: (file: FileInfo) => void;
  resetConversion: () => void;
}

const FILE_TYPES = [
  { value: "all", label: "All Files" },
  { value: "numatb", label: ".numatb" },
  { value: "nutexb", label: ".nutexb" },
  { value: "numdlb", label: ".numdlb" },
  { value: "numshb", label: ".numshb" }
];

export function FileList({ files, isLoading, folderPath, onFileSelect, resetConversion }: FileListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [fileType, setFileType] = useState("all");
  const [localFiles, setLocalFiles] = useState<FileInfo[]>(files);
  const getFileInfos = useNutexbStore((e) => e.getFileInfos);

  useEffect(() => {
    setLocalFiles(files);
  }, [files]);

  const handleSearch = async (query: string, type: string = fileType) => {
    setSearchQuery(query);

    if (!folderPath) return;

    try {
      const entries = await readDir(folderPath);
      const filteredEntries = entries
        .filter((entry) => {
          const matchesSearch = entry.name?.toLowerCase().includes(query.toLowerCase());
          const matchesType = type === "all" || entry.name?.endsWith(`.${type}`);
          return entry.isFile && matchesSearch && matchesType;
        })
        .map(entry => ({
          name: entry.name || "",
          path: folderPath + "/" + entry.name
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

      // 保留原有的nutexb预览和字符串信息
      const enrichedEntries = filteredEntries.map(filteredFile => {
        const originalFile = files.find(f => f.name === filteredFile.name);
        if (originalFile) {
          return {
            ...filteredFile,
            previewPath: originalFile.previewPath,
            string: originalFile.string
          };
        }
        return filteredFile;
      });

      setLocalFiles(enrichedEntries);
    } catch (error) {
      console.error("Error reading directory:", error);
    }
  };

  const handleFileTypeChange = (type: string) => {
    setFileType(type);
    handleSearch(searchQuery, type);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        Loading files...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-gray-500">
        <FolderOpen className="h-8 w-8 mb-2 opacity-50" />
        {folderPath ? 'No files found in this folder' : 'Select a folder to view files'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="flex-1"
        />
        <Select value={fileType} onValueChange={handleFileTypeChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="File type" />
          </SelectTrigger>
          <SelectContent>
            {FILE_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 overflow-auto max-h-[60vh]">
        {localFiles.map((file: FileInfo, index: number) => (
          <div
            key={index}
            className="flex justify-between items-center p-3 hover:bg-gray-50 rounded-md transition-colors border"
          >
            <div className="flex items-center space-x-3">
              {file.previewPath ? (
                <div className="w-xs flex items-center justify-center overflow-hidden rounded-sm">
                  <img 
                    src={convertFileSrc(file.previewPath)} 
                    alt="Preview" 
                    className="h-full object-cover"
                    onError={(e) => {
                      // Hide the broken image
                      e.currentTarget.style.display = 'none';
                      
                      // Create an error indicator safely
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        const errorIcon = document.createElement('span');
                        errorIcon.className = "h-4 w-4 text-gray-500";
                        errorIcon.textContent = "!";
                        parent.appendChild(errorIcon);
                      }
                    }}
                  />
                </div>
              ) : file.name.endsWith('.nutexb') ? (
                <Image className="h-4 w-4 text-gray-500" />
              ) : (
                <FileEdit className="h-4 w-4 text-gray-500" />
              )}
              <span className="truncate">{file.name}</span>
            </div>
            {file.string && (
              <div className="flex items-center space-x-3">
                <span className="truncate">{file.string}</span>
              </div>
            )}
            {(file.name.endsWith('.numatb') || file.name.endsWith('.nutexb')) && (
              <Dialog onOpenChange={(open) => !open && resetConversion()}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hover:bg-gray-100"
                    onClick={() => onFileSelect(file)}
                  >
                    Edit
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[1000px] max-h-[80vh] overflow-y-auto">
                  {file.name.endsWith('.numatb') && <FileDialog file={file} />}
                  {file.name.endsWith('.nutexb') && <NutexbDialog file={file} />}
                </DialogContent>
              </Dialog>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
