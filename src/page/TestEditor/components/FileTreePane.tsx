import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tree, type NodeApi, type NodeRendererProps } from "react-arborist";
import { Search, FolderOpen, Loader2, ChevronRight, ChevronDown, Folder, File, ExternalLink, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

  const NodeRow = ({ node, style }: NodeRendererProps<TestTreeNode>) => {
    const isDir = node.data.isDir;
    const Icon = isDir ? (node.isOpen ? ChevronDown : ChevronRight) : File;

    // Check if this is the current JSON file being edited
    const isCurrentJson = !isDir &&
      node.data.name.toLowerCase().endsWith('.json') &&
      currentJsonPath === node.data.path;

    // Check if this node is in the path to the current JSON file
    const isInPath = isInJsonPath.has(node.data.path);

    const handleClick = () => {
      onSelect(node.data);
      if (isDir) {
        node.toggle();
      }
    };

    // Determine background color based on state
    let bgClass = "hover:bg-muted";
    if (node.isSelected) {
      bgClass = "bg-primary/10 text-primary";
    } else if (isInPath) {
      // Yellow highlight for nodes in the path to current JSON file
      bgClass = hasUnsavedChanges
        ? "bg-yellow-200/80 dark:bg-yellow-900/40 hover:bg-yellow-200 dark:hover:bg-yellow-900/50"
        : "bg-yellow-100/60 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30";
    }

    const topLevelName = resolveTopLevelName(node.data.path);
    const isTopLevelDirty = Boolean(topLevelName && dirtyTopLevelSet.has(topLevelName));

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            style={style}
            className={`flex items-center gap-1 px-1.5 py-0.5 ${bgClass}`}
            onClick={handleClick}
            title={node.data.name}
          >
            {isTopLevelDirty && (
              <span
                className="h-2 w-2 rounded-full bg-yellow-400"
                aria-label="Folder changed"
                title="Folder changed"
              />
            )}
            <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.data.name}</span>
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
    <Card className="flex h-full flex-col border-none shadow-none bg-transparent">
      <CardHeader className="space-y-2 p-2 pb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files..."
            className="h-8 pl-8 pr-8 text-xs bg-background/50 focus-visible:bg-background transition-colors"
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-2 pt-0">
        <div
          ref={containerRef}
          className="h-full rounded-md border bg-background/50 overflow-hidden"
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
              indent={16}
              rowHeight={28}
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