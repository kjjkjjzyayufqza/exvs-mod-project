import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tree, type NodeApi, type NodeRendererProps } from "react-arborist";
import {
  Search,
  FolderOpen,
  Folder,
  FileText,
  ChevronRight,
  GripVertical,
  ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { exists } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { TestTreeNode } from "../types";

function fileExtensionSuffix(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1);
}

type FileTreePaneProps = {
  data: TestTreeNode[];
  onSelect: (node: TestTreeNode | null) => void;
  selectedId?: string | null;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onPickFolder: (folderPath: string) => void;
  onRefresh?: () => void;
  folderStoreKey: string;
  isLoading?: boolean;
  currentDir?: string;
  currentJsonPath?: string | null;
  hasUnsavedChanges?: boolean;
  dirtyTopLevelFolderNames?: string[];
};

export function FileTreePane({
  data,
  onSelect,
  selectedId,
  searchTerm,
  onSearchChange,
  onPickFolder,
  onRefresh,
  folderStoreKey,
  isLoading = false,
  currentDir,
  currentJsonPath,
  hasUnsavedChanges = false,
  dirtyTopLevelFolderNames = [],
}: FileTreePaneProps) {
  const empty = data.length === 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [treeHeight, setTreeHeight] = useState(480);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const updateHeight = () => setTreeHeight(el.clientHeight || 480);
    updateHeight();

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const selection = useMemo(() => selectedId ?? undefined, [selectedId]);
  const treeRef = useRef<any>(null);
  const isUserClickRef = useRef(false);

  useEffect(() => {
    if (!selectedId || !treeRef.current) return;
    // Skip scrolling when the selection was triggered by a user click in the tree;
    // only scroll to center when selection is changed programmatically (e.g., reveal-in-tree).
    if (isUserClickRef.current) {
      isUserClickRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      treeRef.current.scrollTo(selectedId, "center");
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedId]);

  const dirtyTopLevelSet = useMemo(() => new Set(dirtyTopLevelFolderNames), [dirtyTopLevelFolderNames]);

  const resolveTopLevelName = useCallback(
    (nodePath: string): string | null => {
      if (!currentDir) return null;
      const normalize = (input: string) => input.replace(/\\/g, "/");
      const normalizedRoot = normalize(currentDir).replace(/\/+$/, "");
      const normalizedNode = normalize(nodePath);
      if (!normalizedNode.startsWith(normalizedRoot)) return null;
      const relative = normalizedNode.slice(normalizedRoot.length).replace(/^\/+/, "");
      if (!relative) return null;
      const segments = relative.split("/");
      if (segments.length === 1 && !relative.includes("/")) {
        return segments[0];
      }
      return null;
    },
    [currentDir]
  );

  // Check if a node is in the path to the current JSON file
  const isInJsonPath = useMemo(() => {
    if (!currentJsonPath) return new Set<string>();

    const pathSet = new Set<string>();

    // Function to find the JSON node and mark all ancestors
    const findAndMarkPath = (nodes: TestTreeNode[], targetPath: string, ancestors: string[] = []): boolean => {
      for (const node of nodes) {
        const currentAncestors = [...ancestors, node.path];

        // If this is the target JSON file, mark all ancestors
        if (node.path === targetPath) {
          ancestors.forEach(path => pathSet.add(path));
          pathSet.add(node.path);
          return true;
        }

        // If this is a directory, search its children
        if (node.isDir && node.children) {
          if (findAndMarkPath(node.children, targetPath, currentAncestors)) {
            return true;
          }
        }
      }
      return false;
    };

    findAndMarkPath(data, currentJsonPath);
    return pathSet;
  }, [currentJsonPath, data]);

  const getParentDirPath = useCallback((rawPath: string): string | null => {
    const trimmed = rawPath.replace(/[\\/]+$/, "");
    const lastSlash = trimmed.lastIndexOf("/");
    const lastBackslash = trimmed.lastIndexOf("\\");
    const idx = Math.max(lastSlash, lastBackslash);
    if (idx < 0) return null;

    const parent = trimmed.slice(0, idx);
    if (/^[a-zA-Z]:$/.test(parent)) return `${parent}\\`;
    if (parent === "" && trimmed.startsWith("/")) return "/";
    return parent;
  }, []);

  const openAnyPath = useCallback(async (rawPath: string) => {
    try {
      const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(rawPath) || rawPath.startsWith("\\\\");
      const normalizedPath = isWindowsPath ? rawPath.replace(/\//g, "\\") : rawPath.replace(/\\/g, "/");

      if (normalizedPath.includes('"')) {
        toast.error('Invalid path: contains a quote character (")');
        return;
      }

      const pathExists = await exists(normalizedPath);
      if (!pathExists) {
        toast.error("Path does not exist");
        return;
      }

      await openPath(normalizedPath);
    } catch (error) {
      console.error("Error opening path:", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message ? `Failed to open: ${message}` : "Failed to open");
    }
  }, []);

  const handleOpenNodePath = useCallback(
    async (node: TestTreeNode) => {
      await openAnyPath(node.path);
    },
    [openAnyPath]
  );

  const handleOpenNodeFolder = useCallback(
    async (node: TestTreeNode) => {
      const folderPath = node.isDir ? node.path : getParentDirPath(node.path);
      if (!folderPath) {
        toast.error("Cannot resolve folder path");
        return;
      }
      await openAnyPath(folderPath);
    },
    [getParentDirPath, openAnyPath]
  );

  const NodeRow = ({ node, style, dragHandle }: NodeRendererProps<TestTreeNode>) => {
    const isDir = node.data.isDir;

    const isCurrentJson =
      !isDir &&
      node.data.name.toLowerCase().endsWith(".json") &&
      currentJsonPath === node.data.path;

    const isInPath = isInJsonPath.has(node.data.path);

    const handleToggle = (e: React.MouseEvent) => {
      e.stopPropagation();
      node.toggle();
    };

    const handleRowClick = () => {
      isUserClickRef.current = true;
      node.select();
    };

    const depth = node.level;
    const indentPadding = depth * 12;

    const topLevelName = resolveTopLevelName(node.data.path);
    const isTopLevelDirty = Boolean(topLevelName && dirtyTopLevelSet.has(topLevelName));

    const extLabel = !isDir ? fileExtensionSuffix(node.data.name) : null;

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
              node.isDragging && "opacity-60 shadow-lg"
            )}
            onClick={handleRowClick}
            onDoubleClick={() => isDir && node.toggle()}
            title={node.data.name}
          >
            {isTopLevelDirty && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-yellow-400"
                aria-label="Folder changed"
                title="Folder changed"
              />
            )}
            <div
              className={cn(
                "flex w-3 items-center justify-center opacity-0 transition-opacity",
                "cursor-grab active:cursor-grabbing group-hover:opacity-40"
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
                !isDir && "invisible pointer-events-none"
              )}
              aria-label={node.isOpen ? "Collapse" : "Expand"}
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                  node.isOpen && "rotate-90"
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
                  : "bg-muted text-muted-foreground"
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
                  isCurrentJson && "font-semibold"
                )}
              >
                {node.data.name}
              </span>
            </div>

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
        <ContextMenuContent className="w-48">
          {!isDir && (
            <ContextMenuItem onClick={() => handleOpenNodePath(node.data)} className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              <span>Open File</span>
            </ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => handleOpenNodeFolder(node.data)} className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            <span>Open Folder</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <Card className="flex h-full min-h-0 flex-col rounded-none border-0 bg-transparent shadow-none">
      <CardHeader className="shrink-0 space-y-2 p-0 pb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files..."
            className="h-8 bg-background/50 pl-8 pr-8 text-xs transition-colors focus-visible:bg-background"
          />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div
          ref={containerRef}
          className="min-h-0 flex-1 overflow-hidden rounded-none border bg-card/50"
        >
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground p-4 text-center">
              <FolderOpen className="h-8 w-8 opacity-20" />
              <p>Select a folder in the toolbar to start</p>
            </div>
          ) : (
            <Tree
              ref={treeRef}
              data={data}
              width="100%"
              height={treeHeight}
              indent={0}
              rowHeight={36}
              openByDefault={false}
              childrenAccessor={(node) => (node.isDir ? node.children ?? [] : node.children ?? null)}
              selection={selection}
              onSelect={(nodes: NodeApi<TestTreeNode>[]) => {
                isUserClickRef.current = true;
                onSelect(nodes[0]?.data ?? null);
              }}
            >
              {(props) => <NodeRow {...props} />}
            </Tree>
          )}
        </div>
      </CardContent>
    </Card>
  );
}