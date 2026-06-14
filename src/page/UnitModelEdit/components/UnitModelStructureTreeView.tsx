import { useMemo, useState } from "react";

import {
  Boxes,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  FileBox,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Pencil,
  ShieldHalf,
  Sparkles,
} from "lucide-react";

import { CopyInfoToAiButton } from "@/components/CopyInfoToAiButton";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ssbhEditorKindForPath } from "@/components/ssbh-model-preview/useSsbhFileEditorSessions";

import {
  buildUnitModelStructureTree,
  type UnitModelFolderRole,
  type UnitModelStructureTree,
  type UnitModelTreeNode,
} from "../utils/unitModelStructureTree";

interface UnitModelStructureTreeViewProps {
  /** Parsed `_structure.json` object. `null` while no model is loaded. */
  structureJson: unknown | null;
  structureJsonPath?: string | null;
  selectedFileIndex?: number | null;
  onSelectNode?: (node: UnitModelTreeNode) => void;
  /** Open the editor for an editable item node (double-click / context menu). */
  onOpenEditor?: (node: UnitModelTreeNode) => void;
  /** Reveal a node's file in the OS file explorer. */
  onRevealNode?: (node: UnitModelTreeNode) => void;
  /** Copy a node's absolute path to the clipboard. */
  onCopyNodePath?: (node: UnitModelTreeNode) => void;
  /** Jump a nutexb node to the Textures tab. */
  onShowTextureInPanel?: (node: UnitModelTreeNode) => void;
  /** Normalized-lowercase relative fileUrls with unsaved editor edits. */
  editingPaths?: ReadonlySet<string>;
  /** Normalized-lowercase relative fileUrls saved during this workspace session. */
  modifiedPaths?: ReadonlySet<string>;
  className?: string;
}

const ROLE_ICON: Record<UnitModelFolderRole, typeof Folder> = {
  root: Folder,
  models: Boxes,
  "model-group": FileBox,
  "texture-container": Layers,
  "weapon-icon": ImageIcon,
  nuhlpb: Sparkles,
  ragdoll: ShieldHalf,
  nudnbb: Folder,
  unknown: Folder,
};

function nodeChildKey(node: UnitModelTreeNode): string {
  return node.id;
}

function defaultExpanded(root: UnitModelTreeNode): Set<string> {
  const expanded = new Set<string>([root.id]);
  for (const child of root.children ?? []) {
    if (child.kind === "folder") expanded.add(child.id);
  }
  return expanded;
}

interface TreeRowProps {
  node: UnitModelTreeNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  selectedFileIndex?: number | null;
  onSelectNode?: (node: UnitModelTreeNode) => void;
  onOpenEditor?: (node: UnitModelTreeNode) => void;
  onRevealNode?: (node: UnitModelTreeNode) => void;
  onCopyNodePath?: (node: UnitModelTreeNode) => void;
  onShowTextureInPanel?: (node: UnitModelTreeNode) => void;
  editingPaths?: ReadonlySet<string>;
  modifiedPaths?: ReadonlySet<string>;
  structureJsonPath?: string | null;
}

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  selectedFileIndex,
  onSelectNode,
  onOpenEditor,
  onRevealNode,
  onCopyNodePath,
  onShowTextureInPanel,
  editingPaths,
  modifiedPaths,
  structureJsonPath,
}: TreeRowProps) {
  const isFolder = node.kind === "folder";
  const isOpen = expanded.has(node.id);
  const isSelected = node.kind === "item" && selectedFileIndex != null && node.fileIndex === selectedFileIndex;
  const Icon = isFolder ? (isOpen ? FolderOpen : ROLE_ICON[node.role ?? "unknown"]) : FileBox;

  const fileRef = node.kind === "item" ? node.fileUrl ?? node.fileType ?? "" : "";
  const editableKind = node.kind === "item" ? ssbhEditorKindForPath(fileRef) : null;
  const isNutexb = node.kind === "item" && fileRef.toLowerCase().endsWith(".nutexb");
  const compareKey = node.fileUrl ? node.fileUrl.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase() : null;
  const hasUnsaved = Boolean(compareKey && editingPaths?.has(compareKey));
  const wasModified = !hasUnsaved && Boolean(compareKey && modifiedPaths?.has(compareKey));
  const hasMenu =
    node.kind === "item" && Boolean(editableKind || isNutexb || onRevealNode || onCopyNodePath);

  const rowInner = (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded-md py-1 pr-1.5 transition-colors",
        "hover:bg-muted/60",
        isSelected && "bg-primary/10 text-primary",
      )}
      style={{ paddingLeft: `${depth * 14 + 4}px` }}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        onClick={() => {
          if (isFolder) toggle(node.id);
          onSelectNode?.(node);
        }}
        onDoubleClick={() => {
          if (editableKind) onOpenEditor?.(node);
        }}
      >
        {isFolder ? (
          isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )
        ) : (
          <span className="w-3.5 shrink-0" aria-hidden />
        )}
        <Icon
          className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")}
          aria-hidden
        />
        <span className="truncate text-[13px] leading-5">{node.label}</span>
        {hasUnsaved ? (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
            title="Unsaved edits"
            aria-label="Unsaved edits"
          />
        ) : null}
        {wasModified ? (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500"
            title="Modified this session"
            aria-label="Modified this session"
          />
        ) : null}
        {node.kind === "item" && node.fileType ? (
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
            {node.fileType}
          </span>
        ) : null}
        {isFolder && (node.children?.length ?? 0) > 0 ? (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">
            {node.children?.length}
          </span>
        ) : null}
      </button>
      <CopyInfoToAiButton
        size="icon"
        variant="ghost"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        label={`Copy ${isFolder ? node.role ?? "folder" : node.label} info to AI`}
        buildPayload={() => ({
          kind: "unit-model-structure-node",
          scope: isFolder ? `folder:${node.role ?? "unknown"}` : `item:${node.fileIndex}`,
          note: structureJsonPath ? `from ${structureJsonPath}` : undefined,
          data: node,
        })}
      />
    </div>
  );

  return (
    <li>
      {hasMenu ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>{rowInner}</ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            {editableKind ? (
              <ContextMenuItem onSelect={() => onOpenEditor?.(node)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit {editableKind.toUpperCase()}…
              </ContextMenuItem>
            ) : null}
            {isNutexb ? (
              <ContextMenuItem onSelect={() => onShowTextureInPanel?.(node)}>
                <ImageIcon className="mr-2 h-3.5 w-3.5" />
                Show in Textures
              </ContextMenuItem>
            ) : null}
            {editableKind || isNutexb ? <ContextMenuSeparator /> : null}
            <ContextMenuItem onSelect={() => onRevealNode?.(node)}>
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Reveal in Explorer
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onCopyNodePath?.(node)}>
              <ClipboardCopy className="mr-2 h-3.5 w-3.5" />
              Copy path
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        rowInner
      )}
      {isFolder && isOpen && (node.children?.length ?? 0) > 0 ? (
        <ul>
          {node.children?.map((child) => (
            <TreeRow
              key={nodeChildKey(child)}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selectedFileIndex={selectedFileIndex}
              onSelectNode={onSelectNode}
              onOpenEditor={onOpenEditor}
              onRevealNode={onRevealNode}
              onCopyNodePath={onCopyNodePath}
              onShowTextureInPanel={onShowTextureInPanel}
              editingPaths={editingPaths}
              modifiedPaths={modifiedPaths}
              structureJsonPath={structureJsonPath}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Left-side structure viewer for the Unit Model Editor: a collapsible tree of the canonical
 * `_structure.json` (models, texture sets, weapon_icon, nuhlpb, ragdoll, nudnbb, control bins),
 * with a "Copy info to AI" affordance on the whole tree and every node.
 */
export function UnitModelStructureTreeView({
  structureJson,
  structureJsonPath,
  selectedFileIndex,
  onSelectNode,
  onOpenEditor,
  onRevealNode,
  onCopyNodePath,
  onShowTextureInPanel,
  editingPaths,
  modifiedPaths,
  className,
}: UnitModelStructureTreeViewProps) {
  const parsed = useMemo<{ tree: UnitModelStructureTree | null; error: string | null }>(() => {
    if (structureJson == null) return { tree: null, error: null };
    try {
      return { tree: buildUnitModelStructureTree(structureJson), error: null };
    } catch (error) {
      return { tree: null, error: error instanceof Error ? error.message : String(error) };
    }
  }, [structureJson]);

  const [expanded, setExpanded] = useState<Set<string>>(() =>
    parsed.tree ? defaultExpanded(parsed.tree.root) : new Set(),
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className={cn("flex h-full min-h-0 flex-col border-r bg-card/40", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">Structure</h2>
          {parsed.tree ? (
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              magic {parsed.tree.summary.magic} · {parsed.tree.summary.totalFiles} files ·{" "}
              {parsed.tree.summary.modelCount} models · {parsed.tree.summary.textureCount} textures
            </p>
          ) : (
            <p className="truncate text-[11px] text-muted-foreground">No model loaded</p>
          )}
        </div>
        {parsed.tree ? (
          <CopyInfoToAiButton
            label="Copy structure to AI"
            buildPayload={() => ({
              kind: "unit-model-structure-tree",
              scope: "structure-tree",
              note: structureJsonPath ? `from ${structureJsonPath}` : undefined,
              data: { summary: parsed.tree?.summary, structureJson },
            })}
          />
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {parsed.error ? (
          <div className="m-3 rounded-md border border-red-500/40 bg-red-500/5 p-3 text-xs text-red-600 dark:text-red-400">
            Failed to parse structure JSON: {parsed.error}
          </div>
        ) : parsed.tree ? (
          <ul className="px-1.5 py-2">
            <TreeRow
              node={parsed.tree.root}
              depth={0}
              expanded={expanded}
              toggle={toggle}
              selectedFileIndex={selectedFileIndex}
              onSelectNode={onSelectNode}
              onOpenEditor={onOpenEditor}
              onRevealNode={onRevealNode}
              onCopyNodePath={onCopyNodePath}
              onShowTextureInPanel={onShowTextureInPanel}
              editingPaths={editingPaths}
              modifiedPaths={modifiedPaths}
              structureJsonPath={structureJsonPath}
            />
          </ul>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <Folder className="h-8 w-8 text-muted-foreground/50" aria-hidden />
            <p className="text-xs text-muted-foreground">
              Extract or open a unit-model folder to inspect its structure tree.
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
