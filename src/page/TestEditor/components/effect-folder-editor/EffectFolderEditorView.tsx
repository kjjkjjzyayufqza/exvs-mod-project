import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Package,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import {
  resolveEffectPackFromFolderPathAsync,
  resolveEffectPackFromStructureJson,
  type EffectInventoryCategory,
} from "./effectFolderEditorUtils";
import { EffectFolderListPanel } from "./EffectFolderListPanel";
import { EffectFolderDetailPanel } from "./EffectFolderDetailPanel";
import { EffectFolderImportDialog } from "./EffectFolderImportDialog";
import { EffectFolderCopyDialog } from "./EffectFolderCopyDialog";
import { EffectFolderDeleteDialog } from "./EffectFolderDeleteDialog";
import { useEffectFolderEditor } from "./useEffectFolderEditor";
import { useConfigStore } from "@/store/configStore";
import {
  getEffectFolderWorkspaceState,
  rememberEffectFolderPath,
} from "./effectFolderEditorSettings";

type EffectFolderEditorViewProps = {
  workspaceRoot: string;
  structureJsonPath: string | null;
  workspaceDocument: TestEditorWorkspaceDocument;
  modFolderPath: string;
  isActive: boolean;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  onPackRepacked?: (packKey: string) => void;
  onOpenAsEffectProject?: (filePath: string) => void;
};

const toolbarButtonClass = "inline-flex items-center gap-2";

const EMPTY_PACK: WorkspacePackIdentity = {
  packKey: "",
  routeId: "unit.effect",
  prefix: "006effect",
  hashFolderName: "",
  folderPath: "",
  structureJsonPath: "",
  sourceLayout: "configured",
};

export default function EffectFolderEditorView({
  workspaceRoot,
  structureJsonPath,
  workspaceDocument,
  modFolderPath,
  isActive,
  onPackMutated,
  onPackRepacked,
  onOpenAsEffectProject,
}: EffectFolderEditorViewProps) {
  const store = useConfigStore((state) => state.store);
  const suggestedPack = useMemo(
    () => resolveEffectPackFromStructureJson(workspaceRoot, structureJsonPath, workspaceDocument),
    [structureJsonPath, workspaceDocument, workspaceRoot],
  );
  const [folderInput, setFolderInput] = useState("");
  const [activePack, setActivePack] = useState<WorkspacePackIdentity | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const hydratedRef = useRef(false);
  const lastSuggestedPathRef = useRef<string | null>(null);

  const activatePack = useCallback(
    (pack: WorkspacePackIdentity, options?: { remember?: boolean }) => {
      setFolderInput(pack.folderPath);
      setActivePack(pack);
      setLoadError(null);
      if (options?.remember !== false && workspaceRoot.trim()) {
        void rememberEffectFolderPath(workspaceRoot, pack.folderPath);
      }
    },
    [workspaceRoot],
  );

  const editor = useEffectFolderEditor({
    workspaceRoot,
    pack: activePack ?? EMPTY_PACK,
    isActive: isActive && activePack != null,
    modFolderPath,
    onPackMutated,
    onPackRepacked,
    onActivePackChange: activatePack,
  });

  const categoryCounts = useMemo(() => {
    const counts: Record<EffectInventoryCategory | "all", number> = {
      all: editor.allItems.length,
      efxbn: 0,
      models: 0,
      textures: 0,
      other: 0,
    };
    for (const item of editor.allItems) {
      counts[item.category] += 1;
    }
    return counts;
  }, [editor.allItems]);

  const inventory = editor.loadState.status === "ready" ? editor.loadState.inventory : null;
  const busy = editor.busyAction != null;

  useEffect(() => {
    hydratedRef.current = false;
    lastSuggestedPathRef.current = null;
    setActivePack(null);
    setFolderInput("");
    setLoadError(null);
  }, [workspaceRoot]);

  useEffect(() => {
    if (!store || !workspaceRoot.trim()) return;
    if (hydratedRef.current) return;

    let cancelled = false;
    void (async () => {
      const saved = await getEffectFolderWorkspaceState(workspaceRoot);
      if (cancelled) return;
      hydratedRef.current = true;

      if (saved?.folderPath) {
        const pack = await resolveEffectPackFromFolderPathAsync(
          workspaceRoot,
          saved.folderPath,
          workspaceDocument,
        );
        if (pack) {
          activatePack(pack);
          return;
        }
        setFolderInput(saved.folderPath);
      }

      if (suggestedPack) {
        const remappedSuggested = await resolveEffectPackFromFolderPathAsync(
          workspaceRoot,
          suggestedPack.folderPath,
          workspaceDocument,
        );
        if (remappedSuggested) {
          activatePack(remappedSuggested);
          return;
        }
        setFolderInput(suggestedPack.folderPath);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activatePack, store, suggestedPack, workspaceDocument, workspaceRoot]);

  useEffect(() => {
    if (!isActive || !suggestedPack) return;
    const suggestedPath = suggestedPack.folderPath;
    if (lastSuggestedPathRef.current === suggestedPath) return;
    lastSuggestedPathRef.current = suggestedPath;

    let cancelled = false;
    void (async () => {
      const pack = await resolveEffectPackFromFolderPathAsync(
        workspaceRoot,
        suggestedPath,
        workspaceDocument,
      );
      if (cancelled || !pack) return;
      activatePack(pack);
    })();

    return () => {
      cancelled = true;
    };
  }, [activatePack, isActive, suggestedPack, workspaceDocument, workspaceRoot]);

  const pickFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setFolderInput(selected);
      setLoadError(null);
    }
  }, []);

  const loadFolder = useCallback(() => {
    void (async () => {
      const pack = await resolveEffectPackFromFolderPathAsync(
        workspaceRoot,
        folderInput,
        workspaceDocument,
      );
      if (!pack) {
        setLoadError("Enter a valid effect folder path.");
        return;
      }
      activatePack(pack);
    })();
  }, [activatePack, folderInput, workspaceDocument, workspaceRoot]);

  const headerPath = activePack?.folderPath ?? folderInput.trim();

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-none bg-transparent shadow-none">
        <CardHeader className="shrink-0 space-y-3 p-0 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>Effect Folder</CardTitle>
              {headerPath ? (
                <div className="mt-1 flex items-center gap-1 break-all text-xs text-muted-foreground">
                  <span>{headerPath}</span>
                  {activePack ? (
                    <button
                      type="button"
                      onClick={() => void openPath(activePack.folderPath)}
                      className="shrink-0 rounded p-0.5 hover:bg-accent hover:text-accent-foreground"
                      title="Open folder"
                      aria-label="Open folder"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Load a folder such as <span className="font-mono">006effect\0xHASH</span>. Structure JSON is
                  inferred from the sibling file.
                </p>
              )}
              {inventory ? (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{inventory.summary.totalFiles} files</span>
                  <span>{inventory.summary.efxbnCount} efxbn</span>
                  <span>{inventory.summary.modelCount} models</span>
                  <span>{inventory.summary.textureCount} textures</span>
                  {inventory.summary.unresolvedModelIds.length > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      {inventory.summary.unresolvedModelIds.length} unresolved model refs
                    </span>
                  ) : null}
                </div>
              ) : null}
              {suggestedPack && !activePack ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Tree selection: <span className="break-all font-mono">{suggestedPack.folderPath}</span>
                </p>
              ) : null}
            </div>

            {activePack ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void editor.reload()}
                  className={toolbarButtonClass}
                >
                  {editor.loadState.status === "loading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void editor.runValidate()}
                  className={toolbarButtonClass}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Validate
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void editor.runRepack()}
                  className={toolbarButtonClass}
                >
                  <Package className="h-4 w-4" />
                  Repack
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setImportOpen(true)}
                  className={toolbarButtonClass}
                >
                  <Plus className="h-4 w-4" />
                  Import
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || editor.selectedItems.length === 0}
                  onClick={() => setCopyOpen(true)}
                  className={toolbarButtonClass}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy || editor.selectedItems.length === 0}
                  onClick={() => setDeleteOpen(true)}
                  className={toolbarButtonClass}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 max-w-2xl flex-1">
              <Label className="text-[10px] text-muted-foreground">Effect folder</Label>
              <FilePathInput
                value={folderInput}
                onChange={(event) => setFolderInput(event.target.value)}
                placeholder="E:\\workspace\\006effect\\0xHASH"
                className="mt-0.5 font-mono text-xs"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void pickFolder()}
                className={toolbarButtonClass}
              >
                <FolderOpen className="h-4 w-4" />
                Browse
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={loadFolder} className={toolbarButtonClass}>
                Load
              </Button>
            </div>
          </div>

          {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          {!activePack ? (
            <div className="flex h-48 shrink-0 flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-muted/5 text-sm text-muted-foreground">
              <FolderOpen className="h-8 w-8 opacity-50" />
              <p>Set an effect folder path, then Load.</p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
              {editor.loadState.status === "loading" ? (
                <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading effect inventory...
                </div>
              ) : null}

              {editor.loadState.status === "error" ? (
                <div className="flex flex-1 items-center justify-center p-4 text-sm text-destructive">
                  {editor.loadState.message}
                </div>
              ) : null}

              {editor.loadState.status === "ready" ? (
                <>
                  <div className="flex shrink-0 items-center gap-2 border-b bg-muted/20 px-2 py-1.5">
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <Input
                      value={editor.searchQuery}
                      onChange={(event) => editor.setSearchQuery(event.target.value)}
                      placeholder="Search by name, hash, or path"
                      className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                    />
                    <div className="flex shrink-0 items-center gap-1 border-l border-border/60 pl-2">
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={editor.selectAllVisible}>
                        Select visible
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={editor.clearSelection}>
                        Clear
                      </Button>
                      {editor.selectedItems.length > 0 ? (
                        <span className="whitespace-nowrap px-1 text-xs tabular-nums text-muted-foreground">
                          {editor.selectedItems.length} selected
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
                    <ResizablePanel defaultSize={42} minSize={28} className="min-h-0">
                      <EffectFolderListPanel
                        items={editor.filteredItems}
                        category={editor.category}
                        onCategoryChange={editor.setCategory}
                        categoryCounts={categoryCounts}
                        selectedKeys={editor.selectedKeys}
                        focusedKey={editor.focusedKey}
                        onToggleSelection={editor.toggleSelection}
                        onFocus={editor.setFocusedKey}
                      />
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={58} minSize={32} className="min-h-0">
                      <EffectFolderDetailPanel
                        item={editor.focusedItem}
                        inventory={inventory}
                        inventoryWarnings={inventory?.warnings ?? []}
                        validation={editor.validation}
                        previewSuspended={!isActive}
                        onOpenAsEffectProject={onOpenAsEffectProject}
                      />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {activePack ? (
        <>
          <EffectFolderImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            busy={busy}
            onImportFile={editor.runImportFile}
            onImportModel={editor.runImportModel}
          />
          <EffectFolderCopyDialog
            open={copyOpen}
            onOpenChange={setCopyOpen}
            sourceEffectRoot={activePack.folderPath}
            sourceStructureJsonPath={activePack.structureJsonPath}
            selectedItems={editor.selectedItems}
            allItems={editor.allItems}
            busy={busy}
            onCopy={editor.runCopy}
          />
          <EffectFolderDeleteDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            selectionCount={editor.selectedItems.length}
            busy={busy}
            onConfirm={editor.runDelete}
          />
        </>
      ) : null}
    </div>
  );
}
