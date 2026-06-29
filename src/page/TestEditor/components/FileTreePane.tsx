import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tree, type NodeApi } from "react-arborist";
import { ArrowUpDown, Search, FolderOpen, Loader2 } from "lucide-react";
import { exists } from "@tauri-apps/plugin-fs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { repackFolderUsingStructureToModFolder } from "@/utils/repackRunner";
import { promptAndMigrateFhm2dStructureIfNeeded } from "@/utils/fhm2dStructureMetadata";
import { removeMatchingModVgsht2 } from "../utils/modVgsht2";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TestTreeNode } from "../types";
import type { FileTreeViewOptions } from "../utils/fileTreeViewSort";
import { FileTreeViewOptionsForm } from "./FileTreeViewOptionsForm";
import { pathAncestorSetFromRoot } from "../utils/fileTreePathHighlight";
import { FileTreeNodeRow, type FileTreeNodeRowContext } from "./FileTreeNodeRow";
import {
  collectStructureJsonPathKeys,
  normalizeStructureJsonPathKey,
  parseWorkspacePackNodeTarget,
} from "./fileTreeNodeRowUtils";

type FileTreePaneProps = {
  data: TestTreeNode[];
  workspaceTreeData: TestTreeNode[];
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
  workspaceDocument: TestEditorWorkspaceDocument;
  dirtyPacks?: WorkspacePackIdentity[];
  modFolderPath?: string;
  onPackRepacked?: (packKey: string) => void;
  starredPathSet: Set<string>;
  onToggleStar: (path: string) => void;
  viewOptions: FileTreeViewOptions;
  onViewOptionsChange: (patch: Partial<FileTreeViewOptions>) => void;
  onOpenAsEffectProject?: (filePath: string) => void;
};

function FileTreePaneImpl({
  data,
  workspaceTreeData,
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
  workspaceDocument,
  dirtyPacks = [],
  modFolderPath,
  onPackRepacked,
  starredPathSet,
  onToggleStar,
  viewOptions,
  onViewOptionsChange,
  onOpenAsEffectProject,
}: FileTreePaneProps) {
  const empty = data.length === 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [treeHeight, setTreeHeight] = useState(480);
  const [repackDialogOpen, setRepackDialogOpen] = useState(false);
  const [repackRunning, setRepackRunning] = useState(false);
  const [repackRemoveVgsht2InMod, setRepackRemoveVgsht2InMod] = useState(true);
  const [repackTarget, setRepackTarget] = useState<WorkspacePackIdentity | null>(null);
  const structureJsonPathKeys = useMemo(
    () => collectStructureJsonPathKeys(workspaceTreeData),
    [workspaceTreeData],
  );

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
    if (isUserClickRef.current) {
      isUserClickRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const tree = treeRef.current;
      if (!tree) return;
      tree.openParents(selectedId);
      void tree.scrollTo(selectedId, "center");
    }, 100);
    return () => window.clearTimeout(timer);
  }, [selectedId, data]);

  const dirtyPackKeys = useMemo(() => new Set(dirtyPacks.map((pack) => pack.packKey)), [dirtyPacks]);

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
    (target: WorkspacePackIdentity) => {
      setRepackTarget(target);
      setRepackRemoveVgsht2InMod(true);
      setRepackDialogOpen(true);
    },
    []
  );

  const openRepackDialogForNode = useCallback(
    async (node: TestTreeNode) => {
      if (!currentDir) {
        toast.error("No workspace root selected");
        return;
      }
      const target = parseWorkspacePackNodeTarget(node, currentDir, workspaceDocument);
      if (!target) {
        toast.error("Cannot resolve workspace pack target");
        return;
      }
      const structurePathKey = normalizeStructureJsonPathKey(target.structureJsonPath);
      if (node.isDir && !structureJsonPathKeys.has(structurePathKey)) {
        toast.error(`Missing structure JSON: ${target.structureJsonPath}`);
        return;
      }
      const structureOk = await exists(target.structureJsonPath);
      if (!structureOk) {
        toast.error(`Missing structure JSON: ${target.structureJsonPath}`);
        return;
      }
      const metadataMigration = await promptAndMigrateFhm2dStructureIfNeeded({
        structureJsonPath: target.structureJsonPath,
      });
      beginRepackFlow(
        metadataMigration
          ? {
              ...target,
              folderPath: metadataMigration.rootPath ?? target.folderPath,
              structureJsonPath: metadataMigration.structureJsonPath,
            }
          : target,
      );
    },
    [beginRepackFlow, currentDir, structureJsonPathKeys, workspaceDocument]
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
    const modDir = modFolderPath?.trim();
    if (!modDir) {
      toast.error("Configure OB Mod path in Config before repacking");
      return;
    }
    setRepackRunning(true);
    try {
      const folderExists = await exists(repackTarget.folderPath);
      if (!folderExists) {
        throw new Error(`Input folder does not exist: ${repackTarget.folderPath}`);
      }
      const structureOk = await exists(repackTarget.structureJsonPath);
      if (!structureOk) {
        throw new Error("Structure JSON file is missing");
      }
      const repackResult = await repackFolderUsingStructureToModFolder({
        structurePath: repackTarget.structureJsonPath,
        inputFolderPath: repackTarget.folderPath,
        modFolderPath: modDir,
      });
      const entryName = repackTarget.hashFolderName;
      if (repackRemoveVgsht2InMod) {
        try {
          const removed = await removeMatchingModVgsht2(modDir, entryName);
          if (removed) {
            toast.success(`Repacked to mod: ${repackResult.outputPath}`, {
              description: `Removed ${entryName}.vgsht2`,
            });
          } else {
            toast.success(`Repacked to mod: ${repackResult.outputPath}`);
          }
        } catch (removeErr) {
          console.error(`Failed to remove mod/${entryName}.vgsht2`, removeErr);
          toast.error(
            `Repacked to mod but failed to remove .vgsht2: ${(removeErr as Error).message}`,
          );
        }
      } else {
        toast.success(`Repacked to mod: ${repackResult.outputPath}`);
      }
      onPackRepacked?.(repackTarget.packKey);
    } catch (error) {
      console.error(`Repack failed for ${repackTarget.packKey}`, error);
      toast.error(`Repack failed: ${(error as Error).message}`);
    } finally {
      setRepackRunning(false);
      setRepackDialogOpen(false);
      setRepackTarget(null);
    }
  }, [repackTarget, repackRemoveVgsht2InMod, modFolderPath, onPackRepacked]);

  const fileTreeNodeRowCtx = useMemo<FileTreeNodeRowContext>(
    () => ({
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
    }),
    [
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
    ],
  );

  return (
    <>
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex h-full min-h-0 flex-col outline-none">
          <Card className="flex h-full min-h-0 flex-col rounded-none border-0 bg-transparent shadow-none">
            <CardHeader className="shrink-0 space-y-2 p-0 pb-2">
              <div className="flex gap-1.5 items-start">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search files..."
                    className="h-8 bg-background/50 pl-8 pr-8 text-xs transition-colors focus-visible:bg-background"
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title="Sort and group (list layout)"
                    >
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-3">
                    <div className="text-xs font-medium text-foreground mb-2">List layout</div>
                    <FileTreeViewOptionsForm value={viewOptions} onChange={onViewOptionsChange} />
                  </PopoverContent>
                </Popover>
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
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-auto min-w-[260px] p-0">
        <div className="p-2 space-y-1">
          <ContextMenuLabel className="px-2 text-xs text-muted-foreground">List layout</ContextMenuLabel>
          <FileTreeViewOptionsForm
            value={viewOptions}
            onChange={onViewOptionsChange}
            isolatePointerEvents
            className="px-2 pb-2"
          />
        </div>
      </ContextMenuContent>
    </ContextMenu>

    <AlertDialog open={repackDialogOpen} onOpenChange={handleRepackDialogOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Repack this pack?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Runs the same repack as <span className="font-medium text-foreground">Repack Changes</span> for folder{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                  {repackTarget?.packKey ?? "-"}
                </code>{" "}
                using its <code className="rounded bg-muted px-1 py-0.5 text-foreground">_structure.json</code>. Output
                is written to the OB Mod folder as <code className="rounded bg-muted px-1 py-0.5">0xHASH.fhm2d</code>.
              </p>
              {!modFolderPath?.trim() ? (
                <p className="text-amber-600 dark:text-amber-500">
                  OB Mod path is not configured. Set it in Config before repacking.
                </p>
              ) : null}
              {hasUnsavedChanges && repackTarget && currentJsonPath === repackTarget.structureJsonPath ? (
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
                  After repack, remove matching <code className="rounded bg-muted px-1 py-0.5">.vgsht2</code> in the same
                  OB Mod folder.
                </span>
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={repackRunning}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            disabled={repackRunning || !repackTarget || !modFolderPath?.trim()}
            onClick={() => void handleConfirmRepack()}
          >
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
