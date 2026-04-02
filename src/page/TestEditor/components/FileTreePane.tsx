import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tree, type NodeApi } from "react-arborist";
import { Search, FolderOpen, Loader2 } from "lucide-react";
import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { pathAncestorSetFromRoot } from "../utils/fileTreePathHighlight";
import { FileTreeNodeRow, type FileTreeNodeRowContext } from "./FileTreeNodeRow";
import { isWorkspaceDirectChildFolder, parseRootStructureJsonRepackTarget, STRUCTURE_JSON_SUFFIX } from "./fileTreeNodeRowUtils";

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
  starredPathSet: Set<string>;
  onToggleStar: (path: string) => void;
};

function FileTreePaneImpl({
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
  starredPathSet,
  onToggleStar,
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

  const jsonPathHighlightSet = useMemo(
    () => pathAncestorSetFromRoot(currentDir, currentJsonPath ?? null),
    [currentDir, currentJsonPath],
  );

  const onUserSelectInTree = useCallback(() => {
    isUserClickRef.current = true;
  }, []);

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

  const fileTreeNodeRowCtx = useMemo<FileTreeNodeRowContext>(
    () => ({
      currentJsonPath,
      jsonPathHighlightSet,
      hasUnsavedChanges,
      currentDir,
      dirtyTopLevelSet,
      starredPathSet,
      structureJsonExistsAtWorkspaceRoot,
      onToggleStar,
      resolveTopLevelName,
      onUserSelectInTree,
      openRepackDialogForFileNode,
      openRepackDialogForFolderNode,
      handleOpenNodePath,
      handleOpenNodeFolder,
    }),
    [
      currentJsonPath,
      jsonPathHighlightSet,
      hasUnsavedChanges,
      currentDir,
      dirtyTopLevelSet,
      starredPathSet,
      structureJsonExistsAtWorkspaceRoot,
      onToggleStar,
      resolveTopLevelName,
      onUserSelectInTree,
      openRepackDialogForFileNode,
      openRepackDialogForFolderNode,
      handleOpenNodePath,
      handleOpenNodeFolder,
    ],
  );

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
              {(props) => <FileTreeNodeRow {...props} ctx={fileTreeNodeRowCtx} />}
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

export const FileTreePane = memo(FileTreePaneImpl);
FileTreePane.displayName = "FileTreePane";