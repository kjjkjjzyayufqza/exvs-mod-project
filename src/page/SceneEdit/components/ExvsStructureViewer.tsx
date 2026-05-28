import { useState, useCallback, useMemo, memo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Bone,
  Palette,
  Box,
  Boxes,
  Image,
  Table2,
  File,
  Sparkles,
  Search,
  Layers,
  Copy,
} from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types ────────────────────────────────────────────────────────────────────

type StructureFolder = {
  type: "Folder";
  unk1: string;
  folderCount: number;
  unk2: string;
  unk2_1: number;
  unk3: number;
  unk4: number;
  unk5: number;
  unk6: number;
};

type StructureItem = {
  type: "Item";
  unk1: string;
  fileIndex: number;
  unk2: string;
  unk2_1: number;
  unk3: number;
  unk4: number;
  originalFileIndex?: number;
};

type StructureEndMark = {
  type: "EndMark";
  endMarkCount: number;
};

type StructureEntry = StructureFolder | StructureItem | StructureEndMark;

type SubFileDataEntry = {
  index: number;
  fileType: string;
  fileIndex: number;
  fileUrl: string;
  fileBaseName: string;
};

export type ExvsStructureData = {
  Magic: number;
  Fhm2dTotalCount: number;
  UnkCount: number;
  SubFileData: SubFileDataEntry[];
  SubFileStructure: StructureEntry[];
};

// ── Tree conversion ──────────────────────────────────────────────────────────

type TreeNode = {
  kind: "folder" | "item";
  entry: StructureFolder | StructureItem;
  children: TreeNode[];
  resolvedFile?: SubFileDataEntry;
  semanticRole: string;
  depth: number;
};

function buildTreeFromFlat(entries: StructureEntry[], filePool: SubFileDataEntry[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const stack: { children: TreeNode[]; depth: number }[] = [{ children: roots, depth: -1 }];

  for (const entry of entries) {
    if (entry.type === "Folder") {
      const node: TreeNode = {
        kind: "folder",
        entry,
        children: [],
        semanticRole: classifyFolder(entry),
        depth: stack.length - 1,
      };
      stack[stack.length - 1].children.push(node);
      stack.push({ children: node.children, depth: node.depth + 1 });
    } else if (entry.type === "Item") {
      const resolved = filePool.find((f) => f.fileIndex === entry.fileIndex);
      stack[stack.length - 1].children.push({
        kind: "item",
        entry,
        children: [],
        resolvedFile: resolved,
        semanticRole: classifyItem(entry),
        depth: stack.length - 1,
      });
    } else if (entry.type === "EndMark") {
      for (let i = 0; i < entry.endMarkCount; i++) {
        if (stack.length > 1) stack.pop();
      }
    }
  }
  return roots;
}

function classifyFolder(e: StructureFolder): string {
  if (e.unk3 === 32 && e.unk5 === 1) return "tex";
  if (e.unk3 === 64) return "shared";
  return "dir";
}

function classifyItem(e: StructureItem): string {
  switch (e.unk2) {
    case "10000000": return "skel";
    case "21000000": return "mat";
    case "30000000": return "mesh";
    case "40000000": return "mdl";
    case "50000000": return "jnt";
    case "01010000": return "fx";
    default: return "file";
  }
}

// ── Visual config ────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { icon: typeof File; accent: string; tag: string }> = {
  skel: { icon: Bone, accent: "text-sky-500 dark:text-sky-400", tag: "SKEL" },
  mat: { icon: Palette, accent: "text-violet-500 dark:text-violet-400", tag: "MAT" },
  mesh: { icon: Boxes, accent: "text-emerald-500 dark:text-emerald-400", tag: "MESH" },
  mdl: { icon: Box, accent: "text-amber-500 dark:text-amber-400", tag: "MDL" },
  jnt: { icon: Table2, accent: "text-teal-500 dark:text-teal-400", tag: "JNT" },
  fx: { icon: Sparkles, accent: "text-rose-500 dark:text-rose-400", tag: "FX" },
  file: { icon: File, accent: "text-muted-foreground", tag: "" },
  tex: { icon: Image, accent: "text-yellow-600 dark:text-yellow-400", tag: "TEX" },
  shared: { icon: Image, accent: "text-yellow-500 dark:text-yellow-400", tag: "SHARED" },
  dir: { icon: Folder, accent: "text-muted-foreground", tag: "" },
};

const TAG_COLORS: Record<string, string> = {
  skel: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  mat: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  mesh: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  mdl: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  jnt: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  fx: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  tex: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  shared: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
};

function folderDisplayName(role: string): string {
  if (role === "tex") return "textures";
  if (role === "shared") return "textures/";
  return "folder";
}

function formatStructureTreeText(nodes: TreeNode[]): string {
  const lines: string[] = [];

  const walk = (node: TreeNode) => {
    const prefix = "  ".repeat(node.depth);
    if (node.kind === "folder") {
      const entry = node.entry;
      lines.push(
        `${prefix}${folderDisplayName(node.semanticRole)}/  x${entry.folderCount}  u1=${entry.unk1} u2=${entry.unk2} u2_1=${entry.unk2_1} u3=${entry.unk3} u4=${entry.unk4} u5=${entry.unk5} u6=${entry.unk6}`,
      );
    } else {
      const entry = node.entry;
      const file = node.resolvedFile;
      const meta = ROLE_META[node.semanticRole] ?? ROLE_META.file;
      const tag = meta.tag ? ` [${meta.tag}]` : "";
      lines.push(
        `${prefix}${file?.fileBaseName ?? "???"}  ${file?.fileType ?? ""}${tag}  u1=${entry.unk1} u2=${entry.unk2} u2_1=${entry.unk2_1} u3=${entry.unk3} u4=${entry.unk4}  [${entry.fileIndex}]`,
      );
    }
    for (const child of node.children) {
      walk(child);
    }
  };

  for (const node of nodes) {
    walk(node);
  }
  return lines.join("\n");
}

async function copyStructureTreeToClipboard(nodes: TreeNode[]): Promise<void> {
  try {
    await writeText(formatStructureTreeText(nodes));
    toast.success("Copied structure tree to clipboard");
  } catch {
    toast.error("Failed to copy to clipboard");
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export interface ExvsStructureViewerProps {
  data: ExvsStructureData;
}

export const ExvsStructureViewer = memo(function ExvsStructureViewer({ data }: ExvsStructureViewerProps) {
  const [filter, setFilter] = useState("");
  const tree = useMemo(() => buildTreeFromFlat(data.SubFileStructure, data.SubFileData), [data]);

  const handleCopyTree = useCallback(() => {
    void copyStructureTreeToClipboard(tree);
  }, [tree]);

  return (
    <div className="flex h-full flex-col text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          FHM2D Structure
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopyTree}
                aria-label="Copy structure tree"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Copy entire tree
            </TooltipContent>
          </Tooltip>
          <Badge variant="secondary" className="h-5 px-2 text-[10px] font-mono">
            {data.Fhm2dTotalCount} files
          </Badge>
          <Badge variant="outline" className="h-5 px-2 text-[10px] font-mono">
            unk={data.UnkCount}
          </Badge>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-1.5 border-b px-2 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter..."
            className="h-7 pl-8 text-xs placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5">
        {(["skel", "mat", "mesh", "mdl", "jnt", "fx", "tex"] as const).map((role) => {
          const m = ROLE_META[role];
          const Icon = m.icon;
          return (
            <div key={role} className="flex items-center gap-1">
              <Icon className={cn("h-3 w-3", m.accent)} />
              <span className="text-[10px] font-medium text-muted-foreground">{m.tag}</span>
            </div>
          );
        })}
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="p-1">
          {tree.map((node, i) => (
            <NodeRow key={i} node={node} filter={filter} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
});

// ── Node Row ─────────────────────────────────────────────────────────────────

const NodeRow = memo(function NodeRow({
  node,
  filter,
}: {
  node: TreeNode;
  filter: string;
}) {
  const [expanded, setExpanded] = useState(node.depth < 2);
  const hasChildren = node.children.length > 0;
  const handleToggle = useCallback(() => setExpanded((v) => !v), []);

  const visible = useMemo(() => {
    if (!filter) return true;
    const lower = filter.toLowerCase();
    const check = (n: TreeNode): boolean => {
      if (n.kind === "item") return (n.resolvedFile?.fileBaseName ?? "").toLowerCase().includes(lower);
      return n.children.some(check);
    };
    return check(node);
  }, [node, filter]);

  if (!visible) return null;

  const meta = ROLE_META[node.semanticRole] ?? ROLE_META.file;
  const Icon = meta.icon;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1.5 rounded-sm px-2 py-1 select-none",
          "hover:bg-accent/60 cursor-default transition-colors",
        )}
        style={{ paddingLeft: `${node.depth * 16 + 6}px` }}
        onClick={hasChildren ? handleToggle : undefined}
      >
        {hasChildren ? (
          <button
            className="h-5 w-5 flex items-center justify-center shrink-0 hover:bg-accent rounded-sm"
            onClick={(e) => { e.stopPropagation(); handleToggle(); }}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}

        <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.accent)} />

        {node.kind === "folder" ? (
          <FolderLabel entry={node.entry as StructureFolder} role={node.semanticRole} />
        ) : (
          <ItemLabel node={node} />
        )}
      </div>

      {expanded && hasChildren && node.children.map((child, i) => (
        <NodeRow key={i} node={child} filter={filter} />
      ))}
    </div>
  );
});

// ── Folder label with ALL unk fields ─────────────────────────────────────────

function FolderLabel({ entry, role }: { entry: StructureFolder; role: string }) {
  const tagColor = TAG_COLORS[role];

  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <span className="truncate font-medium text-foreground/80">
        {folderDisplayName(role)}
      </span>
      <span className="text-muted-foreground/50 font-mono text-[9px]">×{entry.folderCount}</span>

      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground/70 border border-border/50">
        u1={entry.unk1} u2={entry.unk2} u2_1={entry.unk2_1} u3={entry.unk3} u4={entry.unk4} u5={entry.unk5} u6={entry.unk6}
      </span>

      {tagColor && (
        <Badge variant="outline" className={cn("ml-auto h-4 px-1.5 text-[9px] font-bold border shrink-0", tagColor)}>
          {ROLE_META[role]?.tag}
        </Badge>
      )}
    </div>
  );
}

// ── Item label with ALL unk fields ───────────────────────────────────────────

function ItemLabel({ node }: { node: TreeNode }) {
  const entry = node.entry as StructureItem;
  const file = node.resolvedFile;
  const meta = ROLE_META[node.semanticRole] ?? ROLE_META.file;
  const tagColor = TAG_COLORS[node.semanticRole];

  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <span className="truncate font-medium text-foreground/90">
        {file?.fileBaseName ?? "???"}
      </span>
      <span className="text-[9px] text-muted-foreground/40">{file?.fileType}</span>

      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground/70 border border-border/50">
        u1={entry.unk1} u2={entry.unk2} u2_1={entry.unk2_1} u3={entry.unk3} u4={entry.unk4}
      </span>

      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        {meta.tag && tagColor && (
          <Badge variant="outline" className={cn("h-4 px-1.5 text-[9px] font-bold border", tagColor)}>
            {meta.tag}
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums">
          [{entry.fileIndex}]
        </span>
      </div>
    </div>
  );
}
