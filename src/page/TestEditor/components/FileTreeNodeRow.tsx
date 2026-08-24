import { memo, type MouseEvent } from "react";
import type { NodeRendererProps } from "react-arborist";
import {
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  GripVertical,
  Package,
  Sparkles,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { TestTreeNode } from "../types";
import { normalizePathForStar } from "../utils/fileTreeStars";
import {
  normalizeStructureJsonPathKey,
  parseWorkspacePackNodeTarget,
  STRUCTURE_JSON_SUFFIX,
} from "./fileTreeNodeRowUtils";

export type FileTreeNodeRowContext = {
  currentJsonPath: string | null | undefined;
  jsonPathHighlightSet: ReadonlySet<string>;
  hasUnsavedChanges: boolean;
  currentDir: string | undefined;
  workspaceDocument: TestEditorWorkspaceDocument;
  dirtyPackKeys: ReadonlySet<string>;
  starredPathSet: ReadonlySet<string>;
  structureJsonPathKeys: ReadonlySet<string>;
  onToggleStar: (path: string) => void;
  onUserSelectInTree: () => void;
  openRepackDialogForNode: (node: TestTreeNode) => void | Promise<void>;
  handleOpenNodePath: (node: TestTreeNode) => void | Promise<void>;
  handleOpenNodeFolder: (node: TestTreeNode) => void | Promise<void>;
  onOpenAsEffectProject?: (filePath: string) => void;
};

function fileExtensionSuffix(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1);
}

type Props = NodeRendererProps<TestTreeNode> & {
  ctx: FileTreeNodeRowContext;
};

function FileTreeNodeRowImpl({ node, style, dragHandle, ctx }: Props) {
  const isDir = node.data.isDir;
  const {
    currentJsonPath,
    jsonPathHighlightSet,
    hasUnsavedChanges,
    currentDir,
    workspaceDocument,
    dirtyPackKeys,
    starredPathSet,
    structureJsonPathKeys,
    onToggleStar,
    onUserSelectInTree,
    openRepackDialogForNode,
    handleOpenNodePath,
    handleOpenNodeFolder,
    onOpenAsEffectProject,
  } = ctx;

  const isCurrentJson =
    !isDir &&
    node.data.name.toLowerCase().endsWith(".json") &&
    currentJsonPath === node.data.path;

  const isInPath = jsonPathHighlightSet.has(node.data.path);

  const handleToggle = (e: MouseEvent) => {
    e.stopPropagation();
    node.toggle();
  };

  const handleRowClick = () => {
    onUserSelectInTree();
    node.select();
  };

  const depth = node.level;
  const indentPadding = depth * 12;

  const packTarget = parseWorkspacePackNodeTarget(
    node.data,
    currentDir,
    workspaceDocument,
    structureJsonPathKeys,
  );
  const isPackDirty = Boolean(packTarget && dirtyPackKeys.has(packTarget.packKey));
  const isStarred = starredPathSet.has(normalizePathForStar(node.data.path));

  const extLabel = !isDir ? fileExtensionSuffix(node.data.name) : null;

  const folderStructureExists =
    isDir && packTarget
      ? structureJsonPathKeys.has(normalizeStructureJsonPathKey(packTarget.structureJsonPath))
      : undefined;
  const folderRepackReady = folderStructureExists === true;
  const folderRepackDisabled = isDir && Boolean(packTarget) && !folderRepackReady;

  const hasRepackItems = Boolean(packTarget);
  const isBinFile = !isDir && node.data.name.toLowerCase().endsWith(".bin");
  const canOpenEffectProject = isBinFile && typeof onOpenAsEffectProject === "function";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={dragHandle}
          style={{
            ...style,
            paddingLeft: `${indentPadding}px`,
          }}
          className={cn(
            "group relative flex cursor-pointer select-none items-center gap-1.5 py-1.5 pr-3",
            "transition-all duration-150 ease-out",
            node.isSelected
              ? "bg-primary/10 text-primary"
              : isInPath
                ? hasUnsavedChanges
                  ? "bg-yellow-200/80 text-foreground hover:bg-yellow-200 dark:bg-yellow-900/40 dark:hover:bg-yellow-900/50"
                  : "bg-yellow-100/60 text-foreground hover:bg-yellow-100 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30"
                : "text-foreground/80 hover:bg-muted/60",
            node.isFocused && "ring-1 ring-inset ring-primary/40",
            node.isDragging && "opacity-60 shadow-lg",
          )}
          onClick={handleRowClick}
          onDoubleClick={() => isDir && node.toggle()}
          title={node.data.name}
        >
          {isPackDirty && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-yellow-400"
              aria-label="Pack changed"
              title="Pack changed"
            />
          )}
          <div
            className={cn(
              "flex w-3 items-center justify-center opacity-0 transition-opacity",
              "cursor-grab active:cursor-grabbing group-hover:opacity-40",
            )}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>

          <button
            type="button"
            onClick={handleToggle}
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm transition-colors duration-150",
              "hover:bg-muted-foreground/10",
              !isDir && "invisible pointer-events-none",
            )}
            aria-label={node.isOpen ? "Collapse" : "Expand"}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                node.isOpen && "rotate-90",
              )}
            />
          </button>

          <div
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded",
              isDir
                ? node.isOpen
                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {isDir ? (
              node.isOpen ? (
                <FolderOpen className="h-3.5 w-3.5" />
              ) : (
                <Folder className="h-3.5 w-3.5" />
              )
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-sm",
                node.isSelected && "font-medium",
                isCurrentJson && "font-semibold",
              )}
            >
              {node.data.name}
            </span>
          </div>

          {isStarred && (
            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-hidden />
          )}

          {extLabel && (
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {extLabel}
            </span>
          )}

          {node.isSelected && (
            <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[11rem] max-w-[20rem]">
        <ContextMenuItem onClick={() => onToggleStar(node.data.path)} className="flex items-center gap-2">
          <Star className={cn("h-4 w-4", isStarred && "fill-amber-400 text-amber-500")} />
          <span>{isStarred ? "Unstar" : "Star"}</span>
        </ContextMenuItem>
        {!isDir && (
          <ContextMenuItem onClick={() => void handleOpenNodePath(node.data)} className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            <span>Open File</span>
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => void handleOpenNodeFolder(node.data)} className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          <span>Open Folder</span>
        </ContextMenuItem>
        {canOpenEffectProject ? (
          <ContextMenuItem
            onClick={() => {
              onOpenAsEffectProject?.(node.data.path);
            }}
            className="flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            <span>Open as effect_project</span>
          </ContextMenuItem>
        ) : null}
        {hasRepackItems ? <ContextMenuSeparator /> : null}
        {packTarget && (
          <ContextMenuItem
            disabled={folderRepackDisabled}
            onClick={() => void openRepackDialogForNode(node.data)}
            className={cn("flex flex-col items-stretch gap-0.5 py-2", folderRepackDisabled && "cursor-not-allowed")}
          >
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4 shrink-0" />
              <span>Repack</span>
            </span>
            {folderRepackDisabled ? (
              <span className="pl-6 text-[10px] leading-snug text-muted-foreground">
                {folderStructureExists === false
                  ? `No ${packTarget.hashFolderName}${STRUCTURE_JSON_SUFFIX} beside folder`
                  : "Checking structure file…"}
              </span>
            ) : null}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export const FileTreeNodeRow = memo(FileTreeNodeRowImpl, (prev, next) => {
  return (
    prev.node.id === next.node.id &&
    prev.node.isOpen === next.node.isOpen &&
    prev.node.isSelected === next.node.isSelected &&
    prev.style?.top === next.style?.top &&
    prev.style?.height === next.style?.height &&
    prev.ctx === next.ctx
  );
});
