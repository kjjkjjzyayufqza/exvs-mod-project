import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
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
import { VirtualizedList } from "./VirtualizedList";

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

async function copyTextToClipboard(text: string, successMessage: string, errorMessage = "Failed to copy to clipboard"): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error(errorMessage);
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

/** py-0.5 + text-sm / text-xs rows with h-3.5 icons */
const TREE_ROW_HEIGHT = 24;
const TREE_INDENT_PX = 16;
const STAGE_PREVIEW_DIMENSIONS = {
  width: 760,
  height: 680,
  minWidth: 480,
  minHeight: 380,
};

type FlatTreeRow =
  | { kind: "folder"; key: string; depth: number; folder: VirtualTreeFolder; folderPath: string }
  | { kind: "file"; key: string; depth: number; file: VirtualTreeFile };

function folderPathKey(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

function collectDefaultExpanded(folder: VirtualTreeFolder, depth: number, parentPath: string): Set<string> {
  const folderPath = folderPathKey(parentPath, folder.name);
  const expanded = new Set<string>();
  if (depth < 2) {
    expanded.add(folderPath);
  }
  for (const child of folder.children) {
    for (const path of collectDefaultExpanded(child, depth + 1, folderPath)) {
      expanded.add(path);
    }
  }
  return expanded;
}

function flattenVisibleTree(
  folder: VirtualTreeFolder,
  depth: number,
  parentPath: string,
  expandedFolders: Set<string>,
  rows: FlatTreeRow[],
): void {
  const folderPath = folderPathKey(parentPath, folder.name);
  rows.push({ kind: "folder", key: folderPath, depth, folder, folderPath });

  if (!expandedFolders.has(folderPath)) {
    return;
  }

  for (const child of folder.children) {
    flattenVisibleTree(child, depth + 1, folderPath, expandedFolders, rows);
  }
  for (const file of folder.files) {
    rows.push({
      kind: "file",
      key: `${folderPath}/f:${file.fileIndex}:${file.fileName}`,
      depth: depth + 1,
      file,
    });
  }
}

interface TreeFolderRowProps {
  folder: VirtualTreeFolder;
  depth: number;
  expanded: boolean;
  onToggle: (folderPath: string) => void;
  folderPath: string;
}

const TreeFolderRow = memo(function TreeFolderRow({
  folder,
  depth,
  expanded,
  onToggle,
  folderPath,
}: TreeFolderRowProps) {
  const { t } = useTranslation("scene-stage-dialogs");
  const fileCount = countAllFiles(folder);
  const totalSize = countAllSize(folder);
  const hasContent = folder.children.length > 0 || folder.files.length > 0;

  return (
    <div
      className={cn(
        "flex h-full select-none items-center gap-1.5 rounded px-1 py-0.5 text-sm",
        hasContent && "cursor-pointer hover:bg-muted/50",
      )}
      style={{ paddingLeft: depth * TREE_INDENT_PX + 4 }}
      onClick={() => hasContent && onToggle(folderPath)}
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
      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
        {folder.children.length > 0 && `${t("preview.folders", { count: folder.children.length })}, `}
        {t("preview.files", { count: fileCount })}, {formatSize(totalSize)}
      </span>
    </div>
  );
});

interface TreeFileRowProps {
  file: VirtualTreeFile;
  depth: number;
}

const TreeFileRow = memo(function TreeFileRow({ file, depth }: TreeFileRowProps) {
  return (
    <div
      className="flex h-full items-center gap-1.5 px-1 py-0.5 text-xs text-muted-foreground"
      style={{ paddingLeft: depth * TREE_INDENT_PX + 4 }}
    >
      <span className="w-3.5" />
      <File className="h-3 w-3 shrink-0" />
      <span className="font-mono">{file.fileName}</span>
      <span className="ml-1 text-muted-foreground/60">{file.fileType}</span>
      <span className="ml-auto tabular-nums">{formatSize(file.sizeBytes)}</span>
    </div>
  );
});

function VirtualizedTreePreview({ tree }: { tree: VirtualTreeFolder }) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() =>
    collectDefaultExpanded(tree, 0, ""),
  );

  useEffect(() => {
    setExpandedFolders(collectDefaultExpanded(tree, 0, ""));
  }, [tree]);

  const toggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);

  const flatRows = useMemo(() => {
    const rows: FlatTreeRow[] = [];
    flattenVisibleTree(tree, 0, "", expandedFolders, rows);
    return rows;
  }, [tree, expandedFolders]);

  return (
    <VirtualizedList
      items={flatRows}
      rowHeight={TREE_ROW_HEIGHT}
      getItemKey={(row) => row.key}
      className="max-h-[calc(55vh-1rem)] overflow-y-auto"
      renderRow={(row) => {
        if (row.kind === "folder") {
          return (
            <TreeFolderRow
              folder={row.folder}
              depth={row.depth}
              expanded={expandedFolders.has(row.folderPath)}
              onToggle={toggleFolder}
              folderPath={row.folderPath}
            />
          );
        }
        return <TreeFileRow file={row.file} depth={row.depth} />;
      }}
    />
  );
}

function WarningsBlock({ warnings }: { warnings: string[] }) {
  const { t } = useTranslation("scene-stage-dialogs");
  const [expanded, setExpanded] = useState(false);

  const handleCopy = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      void copyTextToClipboard(formatWarningsText(warnings), t("preview.copiedWarnings"), t("preview.copyFailed"));
    },
    [warnings, t],
  );

  if (warnings.length === 0) return null;

  const warningRows = useMemo(
    () =>
      warnings.map((warning, index) => ({
        key: `${warning.startsWith("[ERROR]") ? "error" : "warning"}:${index}`,
        level: warning.startsWith("[ERROR]") ? ("error" as const) : ("warning" as const),
        message: warning.replace(/^\[ERROR]\s*/, ""),
      })),
    [warnings],
  );
  const errorCount = warningRows.filter((row) => row.level === "error").length;
  const warningCount = warningRows.length - errorCount;

  return (
    <div
      className="rounded-md border border-yellow-500/30 bg-yellow-500/5 cursor-pointer select-none"
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        {errorCount > 0 ? (
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
        )}
        <span className="font-medium">
          {errorCount > 0 && (
            <span className="text-destructive">{t("preview.errors", { count: errorCount })}</span>
          )}
          {errorCount > 0 && warningCount > 0 && ", "}
          {warningCount > 0 && (
            <span className="text-yellow-500">{t("preview.warnings", { count: warningCount })}</span>
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
              {t("preview.copyWarnings")}
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
        <VirtualizedList
          items={warningRows}
          rowHeight={24}
          getItemKey={(row) => row.key}
          className="max-h-[20vh] overflow-y-auto px-3 pb-2"
          renderRow={(row) => (
            <div
              className={cn(
                "truncate text-xs leading-6",
                row.level === "error" ? "font-medium text-destructive" : "text-foreground/70",
              )}
              title={row.message}
            >
              {row.message}
            </div>
          )}
        />
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
  const { t } = useTranslation("scene-stage-dialogs");
  const folderCount = tree?.children.length ?? 0;

  const handleCopyTree = useCallback(() => {
    if (!tree) return;
    void copyTextToClipboard(formatTreeText(tree), t("preview.copiedTree"), t("preview.copyFailed"));
  }, [tree, t]);

  if (!open) return null;

  return (
    <AppRndModalShell
      titleId="stage-structure-preview-title"
      title={t("preview.title")}
      subtitle={t("preview.subtitle")}
      headerIcon={<Folder className="h-4 w-4 text-amber-400" />}
      dimensions={STAGE_PREVIEW_DIMENSIONS}
      storageKey="stage-structure-preview-dialog-size"
      closeDisabled={isLoadingBundle}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2 px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={isLoadingBundle}>
            {t("common.close")}
          </Button>
          <Button onClick={onLoad} disabled={isLoadingBundle}>
            {isLoadingBundle ? t("common.loading") : t("preview.loadIntoScene")}
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="font-mono text-xs">
            {sourceName}
          </Badge>
          <Badge variant="outline" className="text-xs tabular-nums">
            {t("preview.topFolders", { count: folderCount })}
          </Badge>
          <Badge variant="outline" className="text-xs tabular-nums">
            {t("preview.files", { count: totalFiles })}
          </Badge>
          <Badge variant="outline" className="text-xs tabular-nums">
            {formatSize(totalSizeBytes)}
          </Badge>
        </div>

        <WarningsBlock warnings={warnings} />

        <div className="flex-1 min-h-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs font-medium text-muted-foreground">{t("preview.folderTree")}</span>
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
                {t("preview.copyTree")}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex-1 min-h-0 max-h-[55vh] rounded-md border bg-background/50 p-2">
            {tree ? <VirtualizedTreePreview tree={tree} /> : null}
          </div>
        </div>
      </div>
    </AppRndModalShell>
  );
}
