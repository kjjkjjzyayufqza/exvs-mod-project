import { useCallback, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  AlertTriangle,
  XCircle,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface VirtualTreeFile {
  fileName: string;
  fileType: string;
  sizeBytes: number;
  fileIndex: number;
}

export interface VirtualTreeFolder {
  name: string;
  children: VirtualTreeFolder[];
  files: VirtualTreeFile[];
}

interface StageRenamePreviewDialogProps {
  open: boolean;
  tree: VirtualTreeFolder | null;
  warnings: string[];
  sourceName: string;
  totalFiles: number;
  totalSizeBytes: number;
  isLoadingBundle: boolean;
  onLoad: () => void;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countAllFiles(folder: VirtualTreeFolder): number {
  let count = folder.files.length;
  for (const child of folder.children) {
    count += countAllFiles(child);
  }
  return count;
}

function countAllSize(folder: VirtualTreeFolder): number {
  let size = folder.files.reduce((s, f) => s + f.sizeBytes, 0);
  for (const child of folder.children) {
    size += countAllSize(child);
  }
  return size;
}

async function copyTextToClipboard(text: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error("Failed to copy to clipboard");
  }
}

function formatWarningsText(warnings: string[]): string {
  return warnings.join("\n");
}

function formatTreeFolderLines(folder: VirtualTreeFolder, indent: number): string[] {
  const prefix = "  ".repeat(indent);
  const lines: string[] = [];
  const fileCount = countAllFiles(folder);
  const totalSize = countAllSize(folder);
  const statsParts: string[] = [];
  if (folder.children.length > 0) {
    statsParts.push(`${folder.children.length} folders`);
  }
  statsParts.push(`${fileCount} files`);
  statsParts.push(formatSize(totalSize));
  lines.push(`${prefix}${folder.name}/  (${statsParts.join(", ")})`);

  for (const child of folder.children) {
    lines.push(...formatTreeFolderLines(child, indent + 1));
  }
  for (const file of folder.files) {
    const filePrefix = "  ".repeat(indent + 1);
    lines.push(`${filePrefix}${file.fileName}  ${file.fileType}  ${formatSize(file.sizeBytes)}`);
  }
  return lines;
}

function formatTreeText(tree: VirtualTreeFolder): string {
  return formatTreeFolderLines(tree, 0).join("\n");
}

function FolderNode({ folder, depth }: { folder: VirtualTreeFolder; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const fileCount = countAllFiles(folder);
  const totalSize = countAllSize(folder);
  const hasContent = folder.children.length > 0 || folder.files.length > 0;

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-1.5 py-0.5 px-1 rounded cursor-pointer text-sm",
          "hover:bg-muted/50",
        )}
        onClick={() => hasContent && setExpanded(!expanded)}
      >
        {hasContent ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        <Folder className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        <span className="font-mono font-medium">{folder.name}/</span>
        <span className="text-muted-foreground text-xs tabular-nums ml-auto">
          {folder.children.length > 0 && `${folder.children.length} folders, `}
          {fileCount} files, {formatSize(totalSize)}
        </span>
      </div>
      {expanded && hasContent && (
        <div className="ml-4 border-l border-border/40 pl-1">
          {folder.children.map((child, i) => (
            <FolderNode key={`${child.name}-${i}`} folder={child} depth={depth + 1} />
          ))}
          {folder.files.map((file, i) => (
            <div
              key={`f-${i}`}
              className="flex items-center gap-1.5 py-0.5 px-1 text-xs text-muted-foreground"
            >
              <span className="w-3.5" />
              <File className="h-3 w-3 shrink-0" />
              <span className="font-mono">{file.fileName}</span>
              <span className="text-muted-foreground/60 ml-1">{file.fileType}</span>
              <span className="ml-auto tabular-nums">{formatSize(file.sizeBytes)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WarningsBlock({ warnings }: { warnings: string[] }) {
  const [expanded, setExpanded] = useState(false);

  const handleCopy = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      void copyTextToClipboard(formatWarningsText(warnings), "Copied warnings to clipboard");
    },
    [warnings],
  );

  if (warnings.length === 0) return null;

  const errors = warnings.filter((w) => w.startsWith("[ERROR]"));
  const warns = warnings.filter((w) => !w.startsWith("[ERROR]"));

  return (
    <div
      className="rounded-md border border-yellow-500/30 bg-yellow-500/5 cursor-pointer select-none"
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        {errors.length > 0 ? (
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
        )}
        <span className="font-medium">
          {errors.length > 0 && (
            <span className="text-destructive">{errors.length} error(s)</span>
          )}
          {errors.length > 0 && warns.length > 0 && ", "}
          {warns.length > 0 && (
            <span className="text-yellow-500">{warns.length} warning(s)</span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={handleCopy}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Copy all warnings
            </TooltipContent>
          </Tooltip>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>
      {expanded && (
        <ScrollArea className="max-h-[20vh] px-3 pb-2">
          <div className="space-y-0.5">
            {errors.map((w, i) => (
              <div key={`e-${i}`} className="text-xs text-destructive font-medium">
                {w.replace(/^\[ERROR]\s*/, "")}
              </div>
            ))}
            {warns.map((w, i) => (
              <div key={`w-${i}`} className="text-xs text-foreground/70">{w}</div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export function StageRenamePreviewDialog({
  open,
  tree,
  warnings,
  sourceName,
  totalFiles,
  totalSizeBytes,
  isLoadingBundle,
  onLoad,
  onClose,
}: StageRenamePreviewDialogProps) {
  const folderCount = tree?.children.length ?? 0;

  const handleCopyTree = useCallback(() => {
    if (!tree) return;
    void copyTextToClipboard(formatTreeText(tree), "Copied folder tree to clipboard");
  }, [tree]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isLoadingBundle) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Stage Structure Preview</DialogTitle>
          <DialogDescription>
            FHM2D internal folder structure with semantic rename.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="font-mono text-xs">
            {sourceName}
          </Badge>
          <Badge variant="outline" className="text-xs tabular-nums">
            {folderCount} top folders
          </Badge>
          <Badge variant="outline" className="text-xs tabular-nums">
            {totalFiles} files
          </Badge>
          <Badge variant="outline" className="text-xs tabular-nums">
            {formatSize(totalSizeBytes)}
          </Badge>
        </div>

        <WarningsBlock warnings={warnings} />

        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-medium text-muted-foreground">Folder Tree</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCopyTree}
                  disabled={!tree}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Copy entire tree
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex-1 min-h-0 max-h-[55vh] overflow-y-auto rounded-md border bg-background/50 p-2">
            {tree && <FolderNode folder={tree} depth={0} />}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isLoadingBundle}>
            Close
          </Button>
          <Button onClick={onLoad} disabled={isLoadingBundle}>
            {isLoadingBundle ? "Loading..." : "Load into Scene"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
