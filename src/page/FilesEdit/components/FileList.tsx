import { FileEdit, FolderOpen, Image } from "lucide-react";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { FileDialog } from './FileDialog';
import { NutexbDialog } from './NutexbDialog';
import { FileInfo as NumatbFileInfo } from "../../../store/numatbStore";
import { FileInfo as NutexbFileInfo } from "../../../store/nutexbStore";
import { convertFileSrc } from "@tauri-apps/api/core";
import { filterFiles } from "./fileListUtils";

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

const FILE_ROW_HEIGHT = 72;
const FILE_EDITOR_DIMENSIONS = {
  width: 1000,
  height: 720,
  minWidth: 640,
  minHeight: 420,
};

export function FileList({ files, isLoading, folderPath, onFileSelect, resetConversion }: FileListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [fileType, setFileType] = useState("all");
  const [editingFile, setEditingFile] = useState<FileInfo | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filteredFiles = useMemo(
    () => filterFiles(files, deferredSearchQuery, fileType),
    [deferredSearchQuery, fileType, files],
  );

  const getScrollElement = useCallback(() => scrollRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: filteredFiles.length,
    getScrollElement,
    estimateSize: () => FILE_ROW_HEIGHT,
    getItemKey: (index) => filteredFiles[index]?.path ?? filteredFiles[index]?.name ?? index,
    overscan: 8,
  });

  const closeEditor = useCallback(() => {
    setEditingFile(null);
    resetConversion();
  }, [resetConversion]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        Loading files...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
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
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1"
        />
        <Select value={fileType} onValueChange={setFileType}>
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
      {filteredFiles.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          No files match the current filters
        </div>
      ) : (
        <div ref={scrollRef} className="h-[60vh] min-h-48 overflow-auto overscroll-contain">
          <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const file = filteredFiles[virtualRow.index];
              if (!file) return null;
              const isEditable = file.name.endsWith('.numatb') || file.name.endsWith('.nutexb');

              return (
                <div
                  key={virtualRow.key}
                  className="absolute left-0 top-0 w-full pb-2"
                  style={{
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div className="flex h-16 items-center justify-between gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {file.previewPath ? (
                        <div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                          <img
                            src={convertFileSrc(file.previewPath)}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              event.currentTarget.hidden = true;
                            }}
                          />
                        </div>
                      ) : file.name.endsWith('.nutexb') ? (
                        <Image className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <FileEdit className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    </div>
                    {file.string ? (
                      <span className="max-w-[35%] truncate text-sm text-muted-foreground">{file.string}</span>
                    ) : null}
                    {isEditable ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 hover:bg-muted"
                        onClick={() => {
                          onFileSelect(file);
                          setEditingFile(file);
                        }}
                      >
                        Edit
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editingFile ? (
        <AppRndModalShell
          titleId="files-edit-file-editor-title"
          title={`Edit ${editingFile.name}`}
          subtitle={editingFile.name.endsWith(".numatb") ? "Material editor" : "Texture editor"}
          headerIcon={<FileEdit className="h-5 w-5" />}
          dimensions={FILE_EDITOR_DIMENSIONS}
          storageKey="files-edit-file-editor-size"
          onClose={closeEditor}
        >
          <div className="min-h-0 flex-1 overflow-auto p-4">
          {editingFile?.name.endsWith('.numatb') ? <FileDialog file={editingFile} /> : null}
          {editingFile?.name.endsWith('.nutexb') ? <NutexbDialog file={editingFile} /> : null}
          </div>
        </AppRndModalShell>
      ) : null}
    </div>
  );
}
