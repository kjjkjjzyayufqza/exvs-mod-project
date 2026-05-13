import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, ChevronDown, Folder, File, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VirtualTreeFile {
  fileName: string;
  fileType: string;
  sizeBytes: number;
}

export interface VirtualTreeFolder {
  originalIndex: number;
  renamedName: string;
  role: string;
  files: VirtualTreeFile[];
}

interface StageRenamePreviewDialogProps {
  open: boolean;
  folders: VirtualTreeFolder[];
  warnings: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ROLE_COLORS: Record<string, string> = {
  base: "text-blue-400",
  info: "text-amber-400",
  sub_model: "text-green-400",
  textures: "text-purple-400",
};

function FolderNode({ folder }: { folder: VirtualTreeFolder }) {
  const [expanded, setExpanded] = useState(false);
  const roleColor = ROLE_COLORS[folder.role] ?? "text-muted-foreground";

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-1.5 py-1 px-2 hover:bg-muted/50 rounded cursor-pointer text-sm"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Folder className={cn("h-3.5 w-3.5 shrink-0", roleColor)} />
        <span className="font-mono font-medium">{folder.renamedName}/</span>
        <span className="text-muted-foreground ml-1">
          ← {folder.originalIndex}/
        </span>
        <span className={cn("ml-auto text-xs px-1.5 py-0.5 rounded-sm bg-muted", roleColor)}>
          {folder.role}
        </span>
      </div>
      {expanded && (
        <div className="ml-6 border-l border-border/50 pl-2">
          {folder.files.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 py-0.5 px-2 text-xs text-muted-foreground"
            >
              <File className="h-3 w-3 shrink-0" />
              <span className="font-mono">{file.fileName}</span>
              <span className="ml-auto tabular-nums">{formatSize(file.sizeBytes)}</span>
            </div>
          ))}
          {folder.files.length === 0 && (
            <div className="py-0.5 px-2 text-xs text-muted-foreground italic">
              (empty)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StageRenamePreviewDialog({
  open,
  folders,
  warnings,
  onConfirm,
  onCancel,
}: StageRenamePreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Stage Rename Preview</DialogTitle>
          <DialogDescription>
            Verify the folder rename mapping before loading the stage bundle.
          </DialogDescription>
        </DialogHeader>

        {warnings.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              {warnings.map((w, i) => (
                <div key={i} className="text-yellow-200/80">{w}</div>
              ))}
            </div>
          </div>
        )}

        <ScrollArea className="flex-1 min-h-0 max-h-[50vh] rounded-md border bg-background/50 p-2">
          <div className="space-y-0.5">
            {folders.map((folder) => (
              <FolderNode key={folder.originalIndex} folder={folder} />
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>
            Confirm &amp; Load
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
