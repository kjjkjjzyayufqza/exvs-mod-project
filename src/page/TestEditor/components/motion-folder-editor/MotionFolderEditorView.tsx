import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Loader2, Plus, RefreshCw, Replace, Save, Search, Trash2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import { useConfigStore } from "@/store/configStore";
import {
  resolveMotionPackFromFolderPathAsync,
  resolveMotionPackFromStructureJson,
  type MotionHexDisplayEndian,
} from "./motionFolderEditorUtils";
import {
  getMotionFolderWorkspaceState,
  rememberMotionFolderPath,
} from "./motionFolderEditorSettings";
import { MotionFolderTreePanel } from "./MotionFolderTreePanel";
import { MotionFolderDetailPanel } from "./MotionFolderDetailPanel";
import { MotionFolderAddDialog } from "./MotionFolderAddDialog";
import { MotionFolderRemoveDialog } from "./MotionFolderRemoveDialog";
import { useMotionFolderEditor } from "./useMotionFolderEditor";

type MotionFolderEditorViewProps = {
  workspaceRoot: string;
  structureJsonPath: string | null;
  workspaceDocument: TestEditorWorkspaceDocument;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
};

const toolbarButtonClass = "inline-flex items-center gap-2";

const EMPTY_PACK: WorkspacePackIdentity = {
  packKey: "",
  routeId: "unit.motion",
  prefix: "003motion",
  hashFolderName: "",
  folderPath: "",
  structureJsonPath: "",
  sourceLayout: "configured",
};

export default function MotionFolderEditorView({
  workspaceRoot,
  structureJsonPath,
  workspaceDocument,
  isActive,
  onUnsavedChanges,
  onPackMutated,
}: MotionFolderEditorViewProps) {
  const store = useConfigStore((state) => state.store);
  const suggestedPack = useMemo(
    () => resolveMotionPackFromStructureJson(workspaceRoot, structureJsonPath, workspaceDocument),
    [structureJsonPath, workspaceDocument, workspaceRoot],
  );
  const [folderInput, setFolderInput] = useState("");
  const [activePack, setActivePack] = useState<WorkspacePackIdentity | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  /** UI-only: structure stores LE hex; BE shows MSC integer spelling (byte-swapped). */
  const [hexDisplayEndian, setHexDisplayEndian] = useState<MotionHexDisplayEndian>("le");
  const hydratedRef = useRef(false);
  const lastSuggestedPathRef = useRef<string | null>(null);

  const activatePack = useCallback(
    (pack: WorkspacePackIdentity, options?: { remember?: boolean }) => {
      setFolderInput(pack.folderPath);
      setActivePack(pack);
      setLoadError(null);
      if (options?.remember !== false && workspaceRoot.trim()) {
        void rememberMotionFolderPath(workspaceRoot, pack.folderPath);
      }
    },
    [workspaceRoot],
  );

  const editor = useMotionFolderEditor({
    workspaceRoot,
    pack: activePack ?? EMPTY_PACK,
    isActive: isActive && activePack != null,
    onUnsavedChanges,
    onPackMutated,
  });

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
      const saved = await getMotionFolderWorkspaceState(workspaceRoot);
      if (cancelled) return;
      hydratedRef.current = true;

      if (saved?.folderPath) {
        const pack = await resolveMotionPackFromFolderPathAsync(
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
        const remappedSuggested = await resolveMotionPackFromFolderPathAsync(
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
      const pack = await resolveMotionPackFromFolderPathAsync(
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
      const pack = await resolveMotionPackFromFolderPathAsync(
        workspaceRoot,
        folderInput,
        workspaceDocument,
      );
      if (!pack) {
        setLoadError("Enter a valid motion folder path.");
        return;
      }
      activatePack(pack);
    })();
  }, [activatePack, folderInput, workspaceDocument, workspaceRoot]);

  const runReplace = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "Motion", extensions: ["nuanmb"] }],
    });
    if (typeof selected !== "string") return;
    await editor.runReplace(selected);
  }, [editor]);

  const headerPath = activePack?.folderPath ?? folderInput.trim();

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-none bg-transparent shadow-none">
        <CardHeader className="shrink-0 space-y-3 p-0 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>Motion Folder</CardTitle>
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
                  Load a folder such as <span className="font-mono">003motion\0xHASH</span>. Structure JSON is
                  inferred from the sibling file.
                </p>
              )}
              {inventory ? (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{inventory.summary.totalFiles} motions</span>
                  <span>{inventory.summary.folderCount} folders</span>
                  <span>{inventory.summary.linkedItemCount + inventory.summary.linkedFolderCount} parse links</span>
                  <span>{inventory.summary.nonZeroUnk1Count} unk1</span>
                  <span>{inventory.summary.nonZeroUnk2Count} unk2</span>
                  {editor.hasUnsavedChanges ? (
                    <span className="text-amber-600 dark:text-amber-400">unsaved</span>
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
                  variant={editor.hasUnsavedChanges ? "default" : "outline"}
                  disabled={busy || !editor.hasUnsavedChanges}
                  onClick={() => void editor.runSave()}
                  className={toolbarButtonClass}
                >
                  {editor.busyAction === "save" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || editor.folders.length === 0}
                  onClick={() => setAddOpen(true)}
                  className={toolbarButtonClass}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !editor.focusedItem}
                  onClick={() => void runReplace()}
                  className={toolbarButtonClass}
                >
                  <Replace className="h-4 w-4" />
                  Replace
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={busy || editor.selectedNodes.length === 0}
                  onClick={() => setRemoveOpen(true)}
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
              <Label className="text-[10px] text-muted-foreground">Motion folder</Label>
              <FilePathInput
                value={folderInput}
                onChange={(event) => setFolderInput(event.target.value)}
                placeholder="E:\\workspace\\003motion\\0xHASH"
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
              <p>Set a motion folder path, then Load.</p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
              {editor.loadState.status === "loading" ? (
                <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading motion inventory...
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
                      placeholder="Search by name, unk1, unk2, fileIndex, or path"
                      className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                    />
                    <div className="flex shrink-0 items-center gap-1 border-l border-border/60 pl-2">
                      <ToggleGroup
                        type="single"
                        value={hexDisplayEndian}
                        onValueChange={(next) => {
                          if (next === "le" || next === "be") setHexDisplayEndian(next);
                        }}
                        className="mr-1"
                      >
                        <ToggleGroupItem
                          value="le"
                          className="h-7 px-2 text-[10px]"
                          title="Show structure JSON LE bytes (e.g. a621fd5e)"
                          aria-label="Little-endian hex display"
                        >
                          LE
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="be"
                          className="h-7 px-2 text-[10px]"
                          title="Show MSC integer spelling / byte-swapped (e.g. 5efd21a6)"
                          aria-label="Big-endian MSC hex display"
                        >
                          BE
                        </ToggleGroupItem>
                      </ToggleGroup>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => editor.selectAllSearchMatches()}
                      >
                        Select visible
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => editor.clearSelection()}
                      >
                        Clear
                      </Button>
                      {editor.selectedNodes.length > 0 ? (
                        <span className="whitespace-nowrap px-1 text-xs tabular-nums text-muted-foreground">
                          {editor.selectedNodes.length} selected
                        </span>
                      ) : (
                        <span className="whitespace-nowrap px-1 text-xs tabular-nums text-muted-foreground">
                          {editor.flatNodes.length} entries
                        </span>
                      )}
                    </div>
                  </div>

                  <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
                    <ResizablePanel defaultSize={42} minSize={28} className="min-h-0">
                      <MotionFolderTreePanel
                        treeData={editor.treeData}
                        searchTerm={editor.searchQuery}
                        selectedKeys={editor.selectedKeys}
                        focusedKey={editor.focusedKey}
                        onSelectionChange={editor.handleTreeSelectionChange}
                      />
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={58} minSize={32} className="min-h-0">
                      <MotionFolderDetailPanel
                        node={editor.focusedNode}
                        inventory={inventory}
                        editDraft={editor.editDraft}
                        onEditDraftChange={editor.setEditDraft}
                        hexDisplayEndian={hexDisplayEndian}
                        onHexDisplayEndianChange={setHexDisplayEndian}
                        busy={busy}
                        busyAction={editor.busyAction}
                        onApplyEdit={(draft) => void editor.runEdit(draft)}
                        onReplace={() => void runReplace()}
                        onMoveFolderChild={editor.runMoveFolderChild}
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
          <MotionFolderAddDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            busy={busy}
            folders={editor.folders}
            defaultParentFolderId={editor.defaultParentFolderId}
            motionRoot={activePack.folderPath}
            rootName={inventory?.rootName ?? activePack.hashFolderName ?? ""}
            onAdd={editor.runAdd}
          />
          <MotionFolderRemoveDialog
            open={removeOpen}
            onOpenChange={setRemoveOpen}
            selectionCount={editor.selectedNodes.length}
            busy={busy}
            onConfirm={editor.runRemove}
          />
        </>
      ) : null}
    </div>
  );
}
