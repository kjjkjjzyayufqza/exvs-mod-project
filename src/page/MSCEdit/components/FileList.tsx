import { FileEdit, FolderOpen, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { Command } from '@tauri-apps/plugin-shell';
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { readDir, readFile, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { resourceDir } from "@tauri-apps/api/path";

interface FileInfo {
  name: string;
  path: string;
}

interface FileListProps {
  files: FileInfo[];
  isLoading: boolean;
  folderPath: string;
}

interface FileAction {
  label: string;
  onClick: () => Promise<void>;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  className?: string;
  disabled?: boolean;
}

const FILE_TYPES = [
  { value: "all", label: "All Files" },
  { value: "bin", label: ".bin" },
  { value: "c", label: ".c" },
  { value: "txt", label: ".txt" }
];

// Button color styles for different action types - using black/white/gray tones
const BUTTON_STYLES = {
  convert: "bg-gray-900 hover:bg-black text-white border-gray-900 shadow-sm",
  edit: "bg-gray-700 hover:bg-gray-800 text-white border-gray-700 shadow-sm", 
  replace: "bg-gray-600 hover:bg-gray-700 text-white border-gray-600 shadow-sm",
  repack: "bg-gray-800 hover:bg-gray-900 text-white border-gray-800 shadow-sm",
  view: "bg-gray-500 hover:bg-gray-600 text-white border-gray-500 shadow-sm"
};

export function FileList({ files, isLoading, folderPath }: FileListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [fileType, setFileType] = useState("all");
  const [localFiles, setLocalFiles] = useState<FileInfo[]>(files);
  const [processing, setProcessing] = useState<string | null>(null);

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
          const matchesType = type === "all" ||
            (type === "bin" && entry.name?.endsWith('.bin')) ||
            (type === "c" && entry.name?.endsWith('.c')) ||
            (type === "txt" && entry.name?.endsWith('.txt'));
          return entry.isFile && matchesSearch && matchesType;
        })
        .map(entry => ({
          name: entry.name || "",
          path: folderPath + "/" + entry.name
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setLocalFiles(filteredEntries);
    } catch (error) {
      console.error("Error reading directory:", error);
    }
  };

  const handleFileTypeChange = (type: string) => {
    setFileType(type);
    handleSearch(searchQuery, type);
  };

  const handleConvertBinToC = async (file: FileInfo) => {
    try {
      setProcessing(file.name);
      const inputPath = file.path;
      const outputPath = inputPath.replace('.bin', '.c');
      const logPath = inputPath.replace('.bin', '.txt');
      const resourcePath = await resourceDir();

      // Run mscdec.py
      const command = await Command.create('exec-python', [
        resourcePath + '/tools/mscdec.py',
        inputPath,
        '-o',
        outputPath,
        '-log',
        logPath
      ]).execute();

      if (command.code !== 0) {
        console.error(`Failed to convert ${file.name}:`, command.stderr);
        toast.error(`Failed to convert ${file.name}: ${command.stderr}`);
      } else {
        toast.success(`Successfully converted ${file.name} to ${file.name.replace('.bin', '.c')}`);
        // Refresh file list to show the new .c file
        handleSearch(searchQuery, fileType);
      }
    } catch (error) {
      console.error(`Error converting ${file.name}:`, error);
      toast.error(`Error converting ${file.name}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleReplaceFuncToMain = async (file: FileInfo) => {
    try {
      setProcessing(file.name);

      // Read the file using tauri fs
      const fileContent = await readTextFile(file.path);

      // Replace func_0 with main
      const replacedContent = fileContent.replace(/func_0/g, 'main');

      // Write the file back
      await writeTextFile(file.path, replacedContent);

      toast.success(`Successfully replaced func_0 to main in ${file.name}`);
    } catch (error) {
      console.error(`Error replacing in ${file.name}:`, error);
      toast.error(`Error replacing in ${file.name}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleRepackCToBin = async (file: FileInfo) => {
    try {
      setProcessing(file.name);
      const inputPath = file.path;
      const outputPath = inputPath.replace('.c', '.bin');
      const resourcePath = await resourceDir();

      // Run msclang.py
      console.log(`Full command: python ${resourcePath}/tools/msclang.py ${inputPath} -o ${outputPath} -i`);
      const command = await Command.create('exec-python', [
        resourcePath + '/tools/msclang.py',
        inputPath,
        '-o',
        outputPath,
        "-i"
      ], { encoding: 'utf-8' }).execute();
      if (command.code !== 0) {
        console.error(`Failed to repack ${file.name}:`, command.stderr);
        toast.error(`Failed to repack ${file.name}: ${command.stderr}`);
      } else {
        toast.success(`Successfully repacked ${file.name} to ${file.name.replace('.c', '.bin')}`);
        // Refresh file list
        handleSearch(searchQuery, fileType);
      }
    } catch (error) {
      console.error(`Error repacking ${file.name}:`, error);
      toast.error(`Error repacking ${file.name}`);
    } finally {
      setProcessing(null);
    }
  };

  const handleOpenInVSCode = async (file: FileInfo) => {
    try {
      console.log(file.path)

      // Open the file in VSCode using shell commands
      const command = await Command.create('exec-cmd', [
        "/C",
        "code",
        file.path
      ]).execute();
      if (command.code !== 0) {
        console.error(`Failed to open ${file.name} in VSCode:`, command.stderr);
        toast.error(`Failed to open ${file.name} in VSCode: ${command.stderr}`);
      }
    } catch (error) {
      console.error(`Error opening ${file.name} in VSCode:`, error);
      toast.error(`Error opening ${file.name} in VSCode`);
    }
  };

  // Factory function to generate file actions based on file extension
  const createFileActions = (file: FileInfo): FileAction[] => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'bin':
        return [
          {
            label: processing === file.name ? "Converting..." : "Convert",
            onClick: () => handleConvertBinToC(file),
            className: BUTTON_STYLES.convert,
            disabled: processing === file.name
          }
        ];
        
      case 'c':
        return [
          {
            label: "Open VSCode",
            onClick: () => handleOpenInVSCode(file),
            className: BUTTON_STYLES.edit
          },
          {
            label: "Replace",
            onClick: () => handleReplaceFuncToMain(file),
            className: BUTTON_STYLES.replace,
            disabled: processing === file.name
          },
          {
            label: processing === file.name ? "Repacking..." : "Repack",
            onClick: () => handleRepackCToBin(file),
            className: BUTTON_STYLES.repack,
            disabled: processing === file.name
          }
        ];
        
      case 'txt':
        return [
          {
            label: "Open VSCode",
            onClick: () => handleOpenInVSCode(file),
            className: BUTTON_STYLES.view
          }
        ];
        
      default:
        return [];
    }
  };

  // Get file icon based on extension
  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'bin':
        return <FileEdit className="h-4 w-4 text-gray-900" />;
      case 'c':
        return <Code className="h-4 w-4 text-gray-700" />;
      case 'txt':
        return <FileEdit className="h-4 w-4 text-gray-500" />;
      default:
        return <FileEdit className="h-4 w-4 text-gray-400" />;
    }
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
        {localFiles.map((file: FileInfo, index: number) => {
          const actions = createFileActions(file);
          
          return (
            <Card
              key={index}
              className="p-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  {getFileIcon(file.name)}
                  <span className="truncate">{file.name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  {actions.map((action, actionIndex) => (
                    <Button
                      key={actionIndex}
                      size="sm"
                      className={action.className}
                      onClick={action.onClick}
                      disabled={action.disabled}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
