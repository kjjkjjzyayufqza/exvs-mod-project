import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { dirname, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { Buffer } from "buffer";
import { toast } from "sonner";
import { RefreshCw, Save, FolderOpen, Info, Upload, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StageList, buildStageListBuffer } from "@/models/stageList";
import { useConfigStore } from "@/store/configStore";
import { StageEditor } from "./stage-list/StageEditor";
import {
  exportStageJsonToFile,
  pickStageJsonImportPreview,
  applyStageJsonImportToList,
  type StageJsonImportPreview,
} from "./stage-list/StageListJson";

const STAGE_LIST_HASH = "0xCE74091E";

interface StageListViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onRevealTreeFolder?: (path: string) => void;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; filePath: string; message: string }
  | { status: "ready"; filePath: string; list: StageList };

type StageListSortKey =
  | "none"
  | "index"
  | "id"
  | "unk1"
  | "unk2"
  | "unk3"
  | "unk4"
  | "unk5"
  | "unk6"
  | "vs_s_d"
  | "fileName"
  | "unk9"
  | "vs_s_l"
  | "unk11"
  | "unk13"
  | "unk14"
  | "unk15"
  | "uniqueIndex"
  | "vs_sn"
  | "unk18";

export default function StageListView({ folderPath, isActive, onUnsavedChanges, onRevealTreeFolder }: StageListViewProps) {
  const getSetting = useConfigStore((s) => s.getSetting);
  const [obDplCachePath, setObDplCachePath] = useState("");
  const [obModPath, setObModPath] = useState("");
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [hasChanges, setHasChanges] = useState(false);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<StageJsonImportPreview | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [sortKey, setSortKey] = useState<StageListSortKey>("unk1");
  const [searchInputValue, setSearchInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const lastLoadedKeyRef = useRef<string>("");

  const resolveFilePath = useCallback(async () => {
    return await join(folderPath, STAGE_LIST_HASH, "stage_list.bin");
  }, [folderPath]);

  const resetEditorState = useCallback(() => {
    setHasChanges(false);
    onUnsavedChanges?.(false);
  }, [onUnsavedChanges]);

  const load = useCallback(async () => {
    if (!folderPath) {
      setLoadState({ status: "error", filePath: "", message: "Folder path is empty" });
      resetEditorState();
      return;
    }

    const filePath = await resolveFilePath();
    setLoadState({ status: "loading" });
    try {
      const fileData = await readFile(filePath);
      const list = new StageList(Buffer.from(fileData));
      setLoadState({ status: "ready", filePath, list });
      resetEditorState();
      setSelectedIndex((prev) => {
        const len = list.StageData.length;
        if (len === 0) return -1;
        return prev < 0 ? prev : Math.min(prev, len - 1);
      });
    } catch (error) {
      console.error(error);
      setLoadState({
        status: "error",
        filePath,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      resetEditorState();
    }
  }, [folderPath, resetEditorState, resolveFilePath]);

  useEffect(() => {
    const loadConfig = async () => {
      setObDplCachePath((await getSetting<string>("obDplCachePath")) || "");
      setObModPath((await getSetting<string>("obModPath")) || "");
    };
    void loadConfig();
  }, [getSetting]);

  useEffect(() => {
    if (!isActive) return;
    const key = `${folderPath}::stagelist`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load();
  }, [folderPath, isActive, load]);

  const handleEditorChange = useCallback(
    (next: StageList) => {
      setLoadState((prev) => {
        if (prev.status !== "ready") return prev;
        return { ...prev, list: next };
      });
      setHasChanges(true);
      onUnsavedChanges?.(true);
    },
    [onUnsavedChanges]
  );

  const fileMeta = useMemo(() => {
    if (loadState.status !== "ready") return null;
    return {
      count: loadState.list.StageCount,
      commands: loadState.list.CommandsCount,
    };
  }, [loadState]);

  const handleSaveFile = useCallback(async () => {
    if (loadState.status !== "ready") return;
    const filePath = loadState.filePath;
    try {
      const backupPath = filePath.replace(/\.bin$/i, "_bak.bin");
      try {
        const existing = await readFile(filePath);
        await writeFile(backupPath, existing);
      } catch {
        // Ignore backup failures
      }

      const buffer = buildStageListBuffer(loadState.list);
      await writeFile(filePath, buffer);
      toast.success("Saved stage_list.bin");
      setHasChanges(false);
      onUnsavedChanges?.(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save stage_list.bin");
    }
  }, [loadState, load, onUnsavedChanges]);

  const handleOpenPath = useCallback(async (rawPath: string) => {
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

  const handleOpenStageListFolder = useCallback(async () => {
    if (loadState.status !== "ready") return;
    const folderPathToOpen = await dirname(loadState.filePath);
    await handleOpenPath(folderPathToOpen);
  }, [loadState, handleOpenPath]);

  const handleExportStageJson = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (isExporting) return;

    setIsExporting(true);
    try {
      const result = await exportStageJsonToFile(loadState.list.StageData);
      if (!result) return;
      toast.success(`Exported ${result.count} stages`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to export JSON: ${message}`);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, loadState]);

  const handlePickImportStageJson = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (isImporting) return;

    setIsImporting(true);
    try {
      const preview = await pickStageJsonImportPreview();
      if (!preview) return;

      if (preview.validCount === 0) {
        toast.error("Invalid JSON: no valid entries found");
        return;
      }

      setImportPreview(preview);
      setIsImportDialogOpen(true);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to import JSON: ${message}`);
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, loadState]);

  const handleConfirmImport = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!importPreview) return;
    if (isImporting) return;

    setIsImporting(true);
    try {
      const nextList = applyStageJsonImportToList(loadState.list, importPreview.rows);
      setLoadState((prev) => {
        if (prev.status !== "ready") return prev;
        return { ...prev, list: nextList };
      });
      setHasChanges(true);
      onUnsavedChanges?.(true);

      setIsImportDialogOpen(false);
      setImportPreview(null);
      toast.success(`Imported ${importPreview.validCount} stages`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to apply import: ${message}`);
    } finally {
      setIsImporting(false);
    }
  }, [importPreview, isImporting, loadState, onUnsavedChanges]);

  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  if (loadState.status === "loading") {
    return (
      <div className="h-full w-full">
        <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
          <CardHeader className="p-0 pb-4">
            <CardTitle>Stage List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <div className="text-sm text-muted-foreground">Loading stage_list.bin...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="h-full w-full">
        <Card className="border-none shadow-none rounded-none bg-transparent">
          <CardHeader className="p-0 pb-4">
            <CardTitle>Stage List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <div className="text-sm text-muted-foreground">
              {loadState.filePath ? (
                <>
                  <div className="font-medium text-foreground">File</div>
                  <div className="break-all">{loadState.filePath}</div>
                </>
              ) : (
                <div className="break-all">Folder path is empty</div>
              )}
            </div>
            <div className="text-sm text-destructive">{loadState.message}</div>
            <Button size="sm" onClick={() => void load()} className="inline-flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Reload
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadState.status !== "ready") {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        Select this tab to load stage_list.bin
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
        <CardHeader className="p-0 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>Stage List</CardTitle>
              <div className="text-xs text-muted-foreground break-all mt-1 flex items-center gap-1">
                Stage List: {loadState.filePath}
                <button
                  type="button"
                  onClick={() => void handleOpenStageListFolder()}
                  className="shrink-0 p-0.5 rounded hover:bg-accent hover:text-accent-foreground"
                  title="Open folder"
                  aria-label="Open folder"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              </div>
              {fileMeta && (
                <div className="text-xs text-muted-foreground mt-1">
                  Loaded: {fileMeta.count} stages, {fileMeta.commands} commands
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => void load()} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Reload
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handlePickImportStageJson()}
                disabled={isImporting}
                className="inline-flex items-center gap-2"
                title="Import stages from JSON"
              >
                <Upload className="w-4 h-4" />
                Import JSON
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleExportStageJson()}
                disabled={isExporting || loadState.list.StageData.length === 0}
                className="inline-flex items-center gap-2"
                title="Export all stages to JSON"
              >
                <Download className="w-4 h-4" />
                Export JSON
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsInfoDialogOpen(true)}
                className="inline-flex items-center gap-2"
              >
                <Info className="w-4 h-4" />
                Info
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSaveFile()}
                disabled={!hasChanges}
                className="inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save File
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 p-0">
          <StageEditor
            stageListData={loadState.list}
            selectedIndex={selectedIndex}
            onSelectChange={setSelectedIndex}
            sortKey={sortKey}
            onSortKeyChange={setSortKey}
            searchInputValue={searchInputValue}
            searchTerm={searchTerm}
            onSearchInputChange={setSearchInputValue}
            onSearchTermChange={setSearchTerm}
            isComposing={isComposing}
            onComposingChange={setIsComposing}
            obDplCachePath={obDplCachePath}
            obModPath={obModPath}
            workspacePath={folderPath}
            onReveal={onRevealTreeFolder}
            onChange={handleEditorChange}
          />
        </CardContent>
      </Card>

      <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Info</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-2">
                <p>Auto-loads {STAGE_LIST_HASH}/stage_list.bin from the selected folder.</p>
                <p>Each stage entry has 18 unknown fields (unk1–unk18).</p>
                <p>Use FHM2D Init to extract stage_list.bin from the source fhm2d file.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isImportDialogOpen}
        onOpenChange={(open) => {
          if (open) {
            setIsImportDialogOpen(true);
            return;
          }
          setIsImportDialogOpen(false);
          setImportPreview(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Stage List JSON</DialogTitle>
            <DialogDescription>
              {importPreview ? (
                <>
                  <div className="mt-2 space-y-1">
                    <div className="break-all">File: {importPreview.filePath}</div>
                    <div>
                      Total: {importPreview.totalCount} · Valid: {importPreview.validCount} · Invalid: {importPreview.invalidCount}
                      {importPreview.duplicateIds.length > 0 ? ` · Duplicates: ${importPreview.duplicateIds.length}` : ""}
                    </div>
                  </div>
                </>
              ) : (
                <>No file selected</>
              )}
            </DialogDescription>
          </DialogHeader>

          {importPreview && (
            <div className="space-y-2">
              <div className="text-sm font-medium">IDs to import ({importPreview.ids.length})</div>
              <div className="max-h-56 overflow-auto border rounded-md p-2 text-xs font-mono whitespace-pre-wrap">
                {importPreview.ids.slice(0, 500).join(", ")}
                {importPreview.ids.length > 500 ? `\n... and ${importPreview.ids.length - 500} more` : ""}
              </div>
              {importPreview.duplicateIds.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Duplicate IDs detected (will be imported as-is): {importPreview.duplicateIds.slice(0, 100).join(", ")}
                  {importPreview.duplicateIds.length > 100 ? ` ... and ${importPreview.duplicateIds.length - 100} more` : ""}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsImportDialogOpen(false);
                setImportPreview(null);
              }}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleConfirmImport()}
              disabled={!importPreview || importPreview.validCount === 0 || isImporting}
              className="inline-flex items-center gap-2"
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
