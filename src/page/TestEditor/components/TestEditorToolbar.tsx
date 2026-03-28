import { Loader2, RefreshCw, Package, Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";

interface TestEditorToolbarProps {
  currentDir: string;
  folderStoreKey: string;
  isLoading: boolean;
  hasDirtyFolders: boolean;
  onPickFolder: (path: string) => void;
  onRefresh: () => void;
  onRepack: () => void;
  onClearDirty: () => void;
}

export function TestEditorToolbar({
  currentDir,
  folderStoreKey,
  isLoading,
  hasDirtyFolders,
  onPickFolder,
  onRefresh,
  onRepack,
  onClearDirty,
}: TestEditorToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-4 bg-background px-4">
      <div className="flex flex-1 items-center gap-2 max-w-xl">
        <div className="relative flex-1">
          {isLoading ? (
            <Loader2 className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground z-10" />
          ) : (
            <Package className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10" />
          )}
          <FilePathInput
            storeKey={folderStoreKey}
            picker={{ kind: "folder", multiple: false }}
            onPickedValue={(picked) => {
              if (Array.isArray(picked)) return;
              onPickFolder(picked);
            }}
            disabled={isLoading}
            placeholder="Select Workspace Root Folder..."
            className="h-9 pl-9 text-sm w-full bg-muted/50 hover:bg-muted transition-colors"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onRefresh}
          disabled={isLoading || !currentDir}
          title="Refresh Workspace"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!hasDirtyFolders || isLoading}
          onClick={onRepack}
          className="relative h-9 px-4 font-medium"
        >
          Repack Changes
          {hasDirtyFolders && (
            <span className="ml-2 flex h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={!hasDirtyFolders || isLoading}
          onClick={onClearDirty}
          className="h-9 w-9 shrink-0"
          title="Clear dirty state (skip repacking)"
        >
          <Eraser className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
