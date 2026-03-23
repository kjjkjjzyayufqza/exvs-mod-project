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
  Package,
  Loader2,
} from "lucide-react";
import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { repackFolderUsingStructure } from "@/utils/repackRunner";
import { normalizePackFolderName } from "../utils/packName";
import { removeMatchingModVgsht2 } from "../utils/modVgsht2";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { TestTreeNode } from "../types";

function fileExtensionSuffix(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1);
}

const STRUCTURE_JSON_SUFFIX = "_structure.json";

/** Workspace root direct child folder only (same packs as Repack Changes). */
function isWorkspaceDirectChildFolder(node: TestTreeNode, rootDir: string | undefined): boolean {
  if (!node.isDir || !rootDir) return false;
  const normalize = (input: string) => input.replace(/\\/g, "/");
  const normalizedRoot = normalize(rootDir).replace(/\/+$/, "");
  const normalizedNode = normalize(node.path).replace(/\/+$/, "");
  if (!normalizedNode.startsWith(normalizedRoot)) return false;
  const relative = normalizedNode.slice(normalizedRoot.length).replace(/^\/+/, "");
  return Boolean(relative && !relative.includes("/"));
}

/** Root-level *_structure.json only; matches Repack Changes folder naming. */
function parseRootStructureJsonRepackTarget(
  fileName: string,
  filePath: string,
  rootDir: string | undefined
): { folderName: string; structurePath: string } | null {
  if (!rootDir) return null;
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(STRUCTURE_JSON_SUFFIX)) return null;
  const normalize = (input: string) => input.replace(/\\/g, "/");
  const normalizedRoot = normalize(rootDir).replace(/\/+$/, "");
  const normalizedNode = normalize(filePath);
  if (!normalizedNode.startsWith(normalizedRoot)) return null;
  const relative = normalizedNode.slice(normalizedRoot.length).replace(/^\/+/, "");
  if (!relative || relative.includes("/")) return null;
  const folderName = fileName.slice(0, fileName.length - STRUCTURE_JSON_SUFFIX.length);
  if (!folderName) return null;
  return { folderName: normalizePackFolderName(folderName), structurePath: filePath };
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
  /** Top-level directory names under the workspace root (unfiltered); used to detect structure JSON. */
  workspaceTopLevelFolderNames: string[];
  /** Bumps when top-level dirs or root-level *_structure.json entries change; triggers existence re-scan. */
  fileTreeStructureScanKey: string;
  modFolderPath?: string;
  onFolderRepacked?: (folderName: string) => void;
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
  workspaceTopLevelFolderNames,
  fileTreeStructureScanKey,
  modFolderPath,
  onFolderRepacked,
}: FileTreePaneProps) {
  const empty = data.length === 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [treeHeight, setTreeHeight] = useState(480);
  const [repackDialogOpen, setRepackDialogOpen] = useState(false);
  const [repackRunning, setRepackRunning] = useState(false);
  const [repackRemoveVgsht2InMod, setRepackRemoveVgsht2InMod] = useState(true);
  const [repackTarget, setRepackTarget] = useState<{
    folderName: string;
    structurePath: string;
    inputFolderPath: string;
  } | null>(null);
  const [structureJsonExistsAtWorkspaceRoot, setStructureJsonExistsAtWorkspaceRoot] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    let cancelled = false;
    if (!currentDir || workspaceTopLevelFolderNames.length === 0) {
      setStructureJsonExistsAtWorkspaceRoot({});
      return;
    }
    setStructureJsonExistsAtWorkspaceRoot({});
    const names = workspaceTopLevelFolderNames;
    void (async () => {
      try {
        const entries = await Promise.all(
          names.map(async (name) => {
            const structurePath = await join(currentDir, `${name}${STRUCTURE_JSON_SUFFIX}`);
            const ok = await exists(structurePath);
            return [name, ok] as const;
          })
        );
        if (cancelled) return;
        setStructureJsonExistsAtWorkspaceRoot(Object.fromEntries(entries));
      } catch (error) {
        console.error("Failed to verify structure JSON paths", error);
        toast.error("Failed to verify structure JSON paths");
        if (!cancelled) setStructureJsonExistsAtWorkspaceRoot({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentDir, workspaceTopLevelFolderNames, fileTreeStructureScanKey]);

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

  const beginRepackFlow = useCallback(
    (target: { folderName: string; structurePath: string; inputFolderPath: string }) => {
      setRepackTarget(target);
      setRepackRemoveVgsht2InMod(true);
      setRepackDialogOpen(true);
    },
    []
  );

  const openRepackDialogForFileNode = useCallback(
    async (node: TestTreeNode) => {
      if (!currentDir) {
        toast.error("No workspace root selected");
        return;
      }
      const parsed = parseRootStructureJsonRepackTarget(node.name, node.path, currentDir);
      if (!parsed) return;
      const inputFolderPath = await join(currentDir, parsed.folderName);
      beginRepackFlow({
        folderName: parsed.folderName,
        structurePath: parsed.structurePath,
        inputFolderPath,
      });
    },
    [beginRepackFlow, currentDir]
  );

  const openRepackDialogForFolderNode = useCallback(
    async (node: TestTreeNode) => {
      if (!currentDir) {
        toast.error("No workspace root selected");
        return;
      }
      if (!node.isDir || !isWorkspaceDirectChildFolder(node, currentDir)) return;
      const structurePath = await join(currentDir, `${node.name}${STRUCTURE_JSON_SUFFIX}`);
      const structureOk = await exists(structurePath);
      if (!structureOk) {
        const label = `${node.name}${STRUCTURE_JSON_SUFFIX}`;
        toast.error(`Missing ${label} at workspace root`);
        return;
      }
      beginRepackFlow({
        folderName: normalizePackFolderName(node.name),
        structurePath,
        inputFolderPath: node.path,
      });
    },
    [beginRepackFlow, currentDir]
  );

  const handleRepackDialogOpenChange = useCallback(
    (open: boolean) => {
      if (repackRunning) return;
      setRepackDialogOpen(open);
      if (!open) setRepackTarget(null);
    },
    [repackRunning]
  );

  const handleConfirmRepack = useCallback(async () => {
    if (!repackTarget) return;
    setRepackRunning(true);
    try {
      const folderExists = await exists(repackTarget.inputFolderPath);
      if (!folderExists) {
        throw new Error(`Input folder does not exist: ${repackTarget.folderName}`);
      }
      const structureOk = await exists(repackTarget.structurePath);
      if (!structureOk) {
        throw new Error("Structure JSON file is missing");
      }
      await repackFolderUsingStructure({
        structurePath: repackTarget.structurePath,
        inputFolderPath: repackTarget.inputFolderPath,
      });
      const entryName = repackTarget.folderName;
      if (repackRemoveVgsht2InMod && modFolderPath) {
        try {
          const removed = await removeMatchingModVgsht2(modFolderPath, entryName);
          if (removed) {
            toast.success(`Repacked ${entryName}, removed mod/${entryName}.vgsht2`);
          } else {
            toast.success(`Repacked ${entryName}`);
          }
        } catch (removeErr) {
          console.error(`Failed to remove mod/${entryName}.vgsht2`, removeErr);
          toast.error(
            `Repacked ${entryName} but failed to remove .vgsht2: ${(removeErr as Error).message}`
          );
        }
      } else {
        toast.success(`Repacked ${entryName}`);
      }
      onFolderRepacked?.(entryName);
    } catch (error) {
      console.error(`Repack failed for ${repackTarget.folderName}`, error);
      toast.error(`Repack failed: ${(error as Error).message}`);
    } finally {
      setRepackRunning(false);
      setRepackDialogOpen(false);
      setRepackTarget(null);
    }
  }, [repackTarget, repackRemoveVgsht2InMod, modFolderPath, onFolderRepacked]);

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
    const structureRepackTarget = !isDir
      ? parseRootStructureJsonRepackTarget(node.data.name, node.data.path, currentDir)
      : null;

    const isDirectWorkspaceFolder = isDir && isWorkspaceDirectChildFolder(node.data, currentDir);
    const folderStructureExists = isDirectWorkspaceFolder
      ? structureJsonExistsAtWorkspaceRoot[node.data.name]
      : undefined;
    const folderRepackReady = folderStructureExists === true;
    const folderRepackDisabled = isDirectWorkspaceFolder && !folderRepackReady;

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
        <ContextMenuContent className="min-w-[11rem] max-w-[20rem]">
          {!isDir && (
            <ContextMenuItem onClick={() => handleOpenNodePath(node.data)} className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              <span>Open File</span>
            </ContextMenuItem>
          )}
          {structureRepackTarget && (
            <ContextMenuItem
              onClick={() => void openRepackDialogForFileNode(node.data)}
              className="flex items-center gap-2"
            >
              <Package className="h-4 w-4" />
              <span>Repack</span>
            </ContextMenuItem>
          )}
          {isDirectWorkspaceFolder && (
            <ContextMenuItem
              disabled={folderRepackDisabled}
              onClick={() => void openRepackDialogForFolderNode(node.data)}
              className={cn(
                "flex flex-col items-stretch gap-0.5 py-2",
                folderRepackDisabled && "cursor-not-allowed"
              )}
            >
              <span className="flex items-center gap-2">
                <Package className="h-4 w-4 shrink-0" />
                <span>Repack</span>
              </span>
              {folderRepackDisabled ? (
                <span className="pl-6 text-[10px] leading-snug text-muted-foreground">
                  {folderStructureExists === false
                    ? `No ${node.data.name}${STRUCTURE_JSON_SUFFIX} at workspace root`
                    : "Checking structure file…"}
                </span>
              ) : null}
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
    <>
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

    <AlertDialog open={repackDialogOpen} onOpenChange={handleRepackDialogOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Repack this pack?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Runs the same repack as <span className="font-medium text-foreground">Repack Changes</span> for folder{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-foreground">{repackTarget?.folderName ?? "—"}</code>{" "}
                using its <code className="rounded bg-muted px-1 py-0.5 text-foreground">_structure.json</code>. Output
                is produced next to the workspace (same <code className="rounded bg-muted px-1 py-0.5">com</code> path
                rules as the toolbar flow).
              </p>
              {hasUnsavedChanges && repackTarget && currentJsonPath === repackTarget.structurePath ? (
                <p className="text-amber-600 dark:text-amber-500">
                  This structure file is open with unsaved changes. Save in the editor first if you need those edits in
                  the repack.
                </p>
              ) : null}
              <label className="flex cursor-pointer items-start gap-2 text-foreground">
                <Checkbox
                  checked={repackRemoveVgsht2InMod}
                  disabled={repackRunning}
                  onCheckedChange={(checked) => setRepackRemoveVgsht2InMod(Boolean(checked))}
                  className="mt-0.5"
                />
                <span>
                  Remove matching <code className="rounded bg-muted px-1 py-0.5">.vgsht2</code> in OB Mod folder when
                  configured (same option as Repack Changes).
                </span>
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={repackRunning}>Cancel</AlertDialogCancel>
          <Button type="button" disabled={repackRunning || !repackTarget} onClick={() => void handleConfirmRepack()}>
            {repackRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Repacking...
              </>
            ) : (
              "Repack"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}