import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { dirname } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { Buffer } from "buffer";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Save, RefreshCw, Plus, Trash2, Search, Copy, Download, Upload, FolderOpen } from "lucide-react";
import {
  StrikerTable,
  StrikerTableRow,
  buildStrikerTableBuffer,
  cloneStrikerTable,
  findDuplicateStrikerHostIds,
  sortStrikerTableRows,
  unsignedId,
} from "@/models/strikerTable";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import {
  applyStrikerTableImport,
  exportStrikerTableToJsonFile,
  pickStrikerTableImportPreview,
  type StrikerTableImportPreview,
} from "./striker-table/StrikerTableJson";
import { filterStrikerTableRows } from "./striker-table/strikerTableSearch";
import { findStrikerTableFile, STRIKER_TABLE_FILE_NAME } from "./striker-table/strikerTableDocument";
import {
  resolveWorkspaceContent,
  workspacePackIdentityFromResolved,
} from "@/services/testEditorWorkspace/contentCatalog";
import { promptAndMigrateWorkspaceContentIfNeeded } from "@/services/testEditorWorkspace/contentMigration";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import { LegacyWorkspaceMoveNotice } from "./workspace-layout/LegacyWorkspaceMoveNotice";
import { CatalogPackToolbarButtons } from "./workspace-layout/CatalogPackToolbarButtons";
import { useConfigStore } from "@/store/configStore";

const STRIKER_TABLE_IMPORT_MODAL_DIMENSIONS = {
  width: 520,
  height: 420,
  minWidth: 440,
  minHeight: 320,
};

interface StrikerTableViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; filePath: string; message: string }
  | {
      status: "ready";
      filePath: string;
      configuredFilePath: string;
      sourceLayout: "configured" | "legacy" | "missing";
      writable: boolean;
      table: StrikerTable;
    };

function emptySlotLabel(slot: number): string {
  return unsignedId(slot) === 0 ? "empty" : String(unsignedId(slot));
}

export default function StrikerTableView({
  folderPath,
  isActive,
  onUnsavedChanges,
  onPackMutated,
  workspaceDocument,
}: StrikerTableViewProps) {
  const { t } = useTranslation("test-striker-table");
  const obDplCachePath = useConfigStore((state) => state.obDplCachePath);
  const catalogPackLabels = useMemo(
    () => ({
      initPack: t("actions.initPack"),
      initializing: t("actions.initializing"),
      renameZeroBin: t("actions.renameZeroBin"),
      renaming: t("actions.renaming"),
      setObDplcacheInit: t("errors.setObDplcacheInit"),
      unpacked: t("success.unpacked"),
      alreadyNamed: t("success.alreadyNamed"),
      formatRenamed: (names: string) => t("success.renamedFiles", { names }),
    }),
    [t],
  );
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchTerm, setSearchTerm] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<StrikerTableImportPreview | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCandidateIndex, setDeleteCandidateIndex] = useState<number | null>(null);
  const [newRowIndices, setNewRowIndices] = useState<Set<number>>(() => new Set());

  const lastLoadKeyRef = useRef("");
  const listParentRef = useRef<HTMLDivElement | null>(null);
  const getListScrollElement = useCallback(() => listParentRef.current, []);

  const resetEditorState = useCallback(() => {
    setSelectedIndex(-1);
    setSearchTerm("");
    setHasChanges(false);
    onUnsavedChanges?.(false);
  }, [onUnsavedChanges]);

  const resolveTableContent = useCallback(async () => {
    return await promptAndMigrateWorkspaceContentIfNeeded(
      await resolveWorkspaceContent(folderPath, workspaceDocument, "striker-table"),
    );
  }, [folderPath, workspaceDocument]);

  const load = useCallback(
    async (options?: { preserveSelectionId?: number | null }) => {
      if (!folderPath) {
        setLoadState({ status: "error", filePath: "", message: t("errors.folderPathEmpty") });
        resetEditorState();
        return;
      }

      const content = await resolveTableContent();
      const pack = content.existing ?? content.configured;
      const configuredFilePath = content.configured.filePath ?? "";
      const discovered = pack.folderPath ? await findStrikerTableFile(pack.folderPath) : null;
      const filePath = discovered ?? pack.filePath ?? configuredFilePath;
      if (!filePath) {
        setLoadState({
          status: "error",
          filePath: pack.folderPath,
          message: t("errors.notConfigured"),
        });
        resetEditorState();
        return;
      }

      setLoadState({ status: "loading" });
      try {
        const fileData = await readFile(filePath);
        const table = new StrikerTable(Buffer.from(fileData));
        setLoadState({
          status: "ready",
          filePath,
          configuredFilePath,
          sourceLayout: content.sourceLayout,
          writable: content.writable,
          table,
        });
        setNewRowIndices(new Set());
        if (options?.preserveSelectionId !== undefined && options?.preserveSelectionId !== null) {
          const idx = table.rows.findIndex(
            (row) => unsignedId(row.HostUnitId) === unsignedId(options.preserveSelectionId!),
          );
          setSelectedIndex(idx);
        } else {
          setSelectedIndex(-1);
          setSearchTerm("");
        }
        setHasChanges(false);
        onUnsavedChanges?.(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setLoadState({ status: "error", filePath, message });
        setNewRowIndices(new Set());
        resetEditorState();
      }
    },
    [folderPath, onUnsavedChanges, resetEditorState, resolveTableContent],
  );

  useEffect(() => {
    if (!folderPath) {
      setLoadState({ status: "idle" });
      resetEditorState();
      lastLoadKeyRef.current = "";
    }
  }, [folderPath, resetEditorState]);

  useEffect(() => {
    if (!isActive || !folderPath) return;
    const key = [
      folderPath,
      workspaceDocument.assetRoutes["unit.param"]?.prefix ?? "",
      workspaceDocument.legacyReadFallback ? "legacy-on" : "legacy-off",
    ].join("::");
    if (lastLoadKeyRef.current === key) return;
    lastLoadKeyRef.current = key;
    void load();
  }, [folderPath, isActive, load, workspaceDocument]);

  useEffect(() => {
    onUnsavedChanges?.(hasChanges);
  }, [hasChanges, onUnsavedChanges]);

  const tableData = useMemo(() => {
    if (loadState.status !== "ready") return [];
    return loadState.table.rows;
  }, [loadState]);

  const filteredRows = useMemo(
    () => filterStrikerTableRows(tableData, searchTerm),
    [searchTerm, tableData],
  );

  const selectedRow = selectedIndex >= 0 ? (tableData[selectedIndex] ?? null) : null;

  const handleLegacyContentMoved = useCallback(async () => {
    const preserveSelectionId = selectedRow?.HostUnitId ?? null;
    lastLoadKeyRef.current = "";
    setLoadState({ status: "idle" });
    await load({ preserveSelectionId });
  }, [load, selectedRow?.HostUnitId]);

  const estimateRowSize = useCallback(() => 52, []);
  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: getListScrollElement,
    estimateSize: estimateRowSize,
    overscan: 10,
  });

  const updateTable = useCallback(
    (updater: (prev: StrikerTable) => StrikerTable) => {
      setLoadState((prev) => {
        if (prev.status !== "ready" || !prev.writable) return prev;
        return { ...prev, table: updater(prev.table) };
      });
      if (loadState.status === "ready" && loadState.writable) {
        setHasChanges(true);
      }
    },
    [loadState],
  );

  const updateSelectedRowField = useCallback(
    (key: keyof StrikerTableRow, value: number) => {
      if (loadState.status !== "ready" || !loadState.writable || selectedIndex < 0) return;
      updateTable((prevTable) => {
        const nextRows = [...prevTable.rows];
        const current = nextRows[selectedIndex];
        if (!current) return prevTable;
        nextRows[selectedIndex] = { ...current, [key]: unsignedId(value) } as StrikerTableRow;
        return cloneStrikerTable(prevTable, nextRows);
      });
    },
    [loadState.status, selectedIndex, updateTable],
  );

  const handleDelete = useCallback(
    (index: number) => {
      if (loadState.status !== "ready" || !loadState.writable) return;
      updateTable((prevTable) =>
        cloneStrikerTable(
          prevTable,
          prevTable.rows.filter((_, i) => i !== index),
        ),
      );
      setNewRowIndices((prev) => {
        const next = new Set<number>();
        for (const i of prev) {
          if (i === index) continue;
          next.add(i > index ? i - 1 : i);
        }
        return next;
      });
      if (selectedIndex === index) setSelectedIndex(-1);
      else if (selectedIndex > index) setSelectedIndex(selectedIndex - 1);
    },
    [loadState, selectedIndex, updateTable],
  );

  const handleAdd = useCallback(() => {
    if (loadState.status !== "ready" || !loadState.writable) return;
    const newRowIndex = loadState.table.rows.length;
    const source = selectedRow;
    updateTable((prevTable) => {
      const maxId = prevTable.rows.reduce((max, row) => Math.max(max, unsignedId(row.HostUnitId)), 0);
      const newRow = {
        HostUnitId: maxId + 1,
        Slot1: source ? unsignedId(source.Slot1) : 0,
        Slot2: source ? unsignedId(source.Slot2) : 0,
      } as StrikerTableRow;
      return cloneStrikerTable(prevTable, [...prevTable.rows, newRow]);
    });
    setSelectedIndex(newRowIndex);
    setNewRowIndices((prev) => {
      const next = new Set(prev);
      next.add(newRowIndex);
      return next;
    });
  }, [loadState, selectedRow, updateTable]);

  const handleCopyRow = useCallback(
    (index: number) => {
      if (loadState.status !== "ready" || !loadState.writable) return;
      const newRowIndex = loadState.table.rows.length;
      updateTable((prevTable) => {
        const sourceRow = prevTable.rows[index];
        if (!sourceRow) return prevTable;
        const newRow = {
          ...sourceRow,
          HostUnitId: unsignedId(sourceRow.HostUnitId) + 1,
        } as StrikerTableRow;
        return cloneStrikerTable(prevTable, [...prevTable.rows, newRow]);
      });
      setSelectedIndex(newRowIndex);
      setNewRowIndices((prev) => {
        const next = new Set(prev);
        next.add(newRowIndex);
        return next;
      });
    },
    [loadState, updateTable],
  );

  const handleSaveFile = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error(t("errors.legacyReadOnly"));
      return;
    }
    const duplicates = findDuplicateStrikerHostIds(loadState.table.rows);
    if (duplicates.length > 0) {
      toast.error(t("errors.duplicateHostIds", { ids: duplicates.join(", ") }));
      return;
    }
    const sortedRows = sortStrikerTableRows(loadState.table.rows);
    const filePath = loadState.filePath;
    try {
      const backupPath = filePath.replace(/(\.[^.]+)?$/i, "_bak$1");
      try {
        const existing = await readFile(filePath);
        await writeFile(backupPath, existing);
      } catch {
        // Ignore backup failures
      }

      const sortedTable = cloneStrikerTable(loadState.table, sortedRows);
      await writeFile(filePath, buildStrikerTableBuffer(sortedTable));
      toast.success(t("success.saved", { fileName: STRIKER_TABLE_FILE_NAME }));
      setHasChanges(false);
      onUnsavedChanges?.(false);

      const content = await resolveTableContent();
      if (content.sourceLayout === "configured" || content.sourceLayout === "legacy") {
        const pack = content.existing ?? content.configured;
        onPackMutated?.(
          workspacePackIdentityFromResolved(
            pack,
            content.sourceLayout === "legacy" ? "legacy" : "configured",
          ),
        );
      }
      await load({ preserveSelectionId: selectedRow?.HostUnitId ?? null });
    } catch (error) {
      console.error(error);
      toast.error(t("errors.saveFailed"));
    }
  }, [load, loadState, onPackMutated, onUnsavedChanges, resolveTableContent, selectedRow?.HostUnitId]);

  const handleOpenFolder = useCallback(async () => {
    if (loadState.status !== "ready") return;
    const folderPathToOpen = await dirname(loadState.filePath);
    try {
      if (!(await exists(folderPathToOpen))) {
        toast.error(t("errors.pathNotExist"));
        return;
      }
      await openPath(folderPathToOpen);
    } catch (error) {
      console.error(error);
      toast.error(t("errors.openFolderFailed"));
    }
  }, [loadState]);

  const handleExportJson = useCallback(async () => {
    if (loadState.status !== "ready" || isExporting) return;
    setIsExporting(true);
    try {
      const result = await exportStrikerTableToJsonFile(loadState.table, {
        defaultFileName: "strikertable.json",
      });
      if (!result) return;
      toast.success(t("success.exported", { count: result.count }));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("errors.unknown");
      toast.error(t("errors.exportFailed", { message }));
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, loadState, t]);

  const handlePickImportJson = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error(t("errors.legacyReadOnly"));
      return;
    }
    if (isImporting) return;
    setIsImporting(true);
    try {
      const preview = await pickStrikerTableImportPreview();
      if (!preview) return;
      if (preview.validCount === 0) {
        toast.error(t("errors.invalidJson"));
        return;
      }
      setImportPreview(preview);
      setIsImportDialogOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("errors.unknown");
      toast.error(t("errors.importFailed", { message }));
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, loadState, t]);

  const handleConfirmImport = useCallback(() => {
    if (loadState.status !== "ready" || !loadState.writable || !importPreview) return;
    try {
      setLoadState((prev) => {
        if (prev.status !== "ready") return prev;
        return { ...prev, table: applyStrikerTableImport(prev.table, importPreview.rows) };
      });
      setSelectedIndex(-1);
      setSearchTerm("");
      setHasChanges(true);
      setNewRowIndices(new Set());
      setIsImportDialogOpen(false);
      setImportPreview(null);
      toast.success(t("success.imported", { count: importPreview.validCount }));
    } catch (error) {
      console.error(error);
      toast.error(t("errors.applyImportFailed"));
    }
  }, [importPreview, loadState]);

  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  if (!folderPath.trim()) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
        {t("empty.selectFolder")}
      </div>
    );
  }

  if (loadState.status === "loading" || loadState.status === "idle") {
    return (
      <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
        <CardHeader className="p-0 pb-4">
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          <div className="text-sm text-muted-foreground">{t("loading", { fileName: STRIKER_TABLE_FILE_NAME })}</div>
        </CardContent>
      </Card>
    );
  }

  if (loadState.status === "error") {
    return (
      <Card className="border-none shadow-none rounded-none bg-transparent">
        <CardHeader className="p-0 pb-4">
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          <div className="text-sm text-muted-foreground break-all">
            {loadState.filePath ? (
              <>
                <div className="font-medium text-foreground">{t("file")}</div>
                {loadState.filePath}
              </>
            ) : (
              t("errors.folderPathEmpty")
            )}
          </div>
          <div className="text-sm text-destructive">{loadState.message}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={() => void load()} className="inline-flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              {t("actions.reload")}
            </Button>
            <CatalogPackToolbarButtons
              contentId="striker-table"
              folderPath={folderPath}
              workspaceDocument={workspaceDocument}
              dplCachePath={obDplCachePath ?? ""}
              reload={load}
              labels={catalogPackLabels}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full w-full flex flex-col min-h-0">
      <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent min-h-0">
        <CardHeader className="p-0 pb-4 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>{t("title")}</CardTitle>
              <div className="text-xs text-muted-foreground break-all mt-1 flex items-center gap-1">
                {loadState.filePath}
                <button
                  type="button"
                  onClick={() => void handleOpenFolder()}
                  className="shrink-0 p-0.5 rounded hover:bg-accent hover:text-accent-foreground"
                  title={t("actions.openFolder")}
                  aria-label={t("actions.openFolder")}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t("summary", { fileName: STRIKER_TABLE_FILE_NAME, count: tableData.length })}
              </div>
              <LegacyWorkspaceMoveNotice
                workspaceRoot={folderPath}
                workspaceDocument={workspaceDocument}
                contentId="striker-table"
                sourceLayout={loadState.sourceLayout}
                configuredPath={loadState.configuredFilePath}
                onMoved={handleLegacyContentMoved}
                className="mt-2"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
              <Button size="sm" variant="outline" onClick={() => void load()} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                {t("actions.reload")}
              </Button>
              <CatalogPackToolbarButtons
                contentId="striker-table"
                folderPath={folderPath}
                workspaceDocument={workspaceDocument}
                dplCachePath={obDplCachePath ?? ""}
                reload={load}
                labels={catalogPackLabels}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handlePickImportJson()}
                disabled={!loadState.writable || isImporting || isExporting}
                className="inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {t("actions.importJson")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleExportJson()}
                disabled={isExporting || isImporting || loadState.table.rows.length === 0}
                className="inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {t("actions.exportJson")}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSaveFile()}
                disabled={!loadState.writable || !hasChanges}
                className="inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {t("actions.saveFile")}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 p-0 flex flex-col">
          <div className="flex h-full min-h-0 gap-4 flex-1">
            <div className="w-1/3 border rounded-lg p-3 overflow-hidden flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="font-semibold text-sm">{t("hosts", { count: tableData.length })}</div>
                <Button size="sm" onClick={handleAdd} disabled={!loadState.writable} className="inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {t("actions.add")}
                </Button>
              </div>

              <div className="relative mb-3 shrink-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder={t("searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div ref={listParentRef} className="flex-1 min-h-0 overflow-auto">
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                    const item = filteredRows[virtualItem.index];
                    if (!item) return null;
                    const { row, idx } = item;
                    return (
                      <div
                        key={virtualItem.key}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <div
                          className={cn(
                            "border rounded-md px-2 py-2 cursor-pointer hover:bg-accent/50 transition-colors h-full flex items-center justify-between gap-2",
                            idx === selectedIndex && "ring-2 ring-inset ring-primary bg-accent",
                          )}
                          onClick={() => setSelectedIndex(idx)}
                        >
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                {unsignedId(row.HostUnitId)}
                              </span>
                              {newRowIndices.has(idx) && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[10px] px-1.5 py-0"
                                >
                                  {t("new")}
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {emptySlotLabel(row.Slot1)} / {emptySlotLabel(row.Slot2)}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-primary hover:text-primary hover:bg-primary/10"
                              disabled={!loadState.writable}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyRow(idx);
                              }}
                              title={t("actions.copyAsNew")}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={!loadState.writable}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteCandidateIndex(idx);
                                setDeleteDialogOpen(true);
                              }}
                              title={t("actions.delete")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {filteredRows.length === 0 && (
                  <div className="text-center text-muted-foreground py-8 text-sm">{t("empty.noRows")}</div>
                )}
              </div>
            </div>

            <div className="flex-1 border rounded-lg p-4 overflow-hidden flex flex-col min-h-0">
              {selectedRow ? (
                <>
                  <div className="flex items-center justify-between mb-4 shrink-0">
                    <div className="text-sm font-semibold">{t("editRow", { index: selectedIndex })}</div>
                    <div className="text-xs text-muted-foreground">{t("idHint")}</div>
                  </div>
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="space-y-2 pr-2">
                      <DualValueProperty
                        label={t("fields.hostUnitId")}
                        value={unsignedId(selectedRow.HostUnitId)}
                        property="HostUnitId"
                        editable={loadState.writable}
                        editingProperty={null}
                        editValue=""
                        validationError=""
                        onStartEdit={() => {}}
                        onSaveEdit={() => {}}
                        onCancelEdit={() => {}}
                        onValueChange={() => {}}
                        variant="compact"
                        mode="live"
                        onCommit={(nextValue) => updateSelectedRowField("HostUnitId", nextValue)}
                      />
                      <DualValueProperty
                        label={t("fields.strikerSlot1")}
                        value={unsignedId(selectedRow.Slot1)}
                        property="Slot1"
                        editable={loadState.writable}
                        variant="compact"
                        editingProperty={null}
                        editValue=""
                        validationError=""
                        onStartEdit={() => {}}
                        onSaveEdit={() => {}}
                        onCancelEdit={() => {}}
                        onValueChange={() => {}}
                        mode="live"
                        onCommit={(nextValue) => updateSelectedRowField("Slot1", nextValue)}
                      />
                      <DualValueProperty
                        label={t("fields.strikerSlot2")}
                        value={unsignedId(selectedRow.Slot2)}
                        property="Slot2"
                        editable={loadState.writable}
                        variant="compact"
                        editingProperty={null}
                        editValue=""
                        validationError=""
                        onStartEdit={() => {}}
                        onSaveEdit={() => {}}
                        onCancelEdit={() => {}}
                        onValueChange={() => {}}
                        mode="live"
                        onCommit={(nextValue) => updateSelectedRowField("Slot2", nextValue)}
                      />
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {t("empty.selectHost")}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isImportDialogOpen ? (
        <AppRndModalShell
          titleId="striker-table-import-title"
          title={t("import.title")}
          subtitle={t("import.subtitle", { fileName: STRIKER_TABLE_FILE_NAME })}
          headerIcon={<Upload className="h-5 w-5 text-primary" />}
          dimensions={STRIKER_TABLE_IMPORT_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.striker-table-import"
          onClose={() => setIsImportDialogOpen(false)}
          footer={
            <div className="flex justify-end gap-2 bg-background px-6 py-4">
              <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                {t("actions.cancel")}
              </Button>
              <Button onClick={handleConfirmImport} disabled={!loadState.writable}>
                {t("actions.applyImport")}
              </Button>
            </div>
          }
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6 text-sm">
            <p className="text-muted-foreground">
              {t("import.description")}
            </p>
            {importPreview ? (
              <div className="space-y-1">
                <div>{t("import.validRows", { count: importPreview.validCount })}</div>
                <div>{t("import.invalidRows", { count: importPreview.invalidCount })}</div>
                {importPreview.duplicateIds.length > 0 ? (
                  <div className="text-amber-600">
                    {t("import.duplicates", { ids: importPreview.duplicateIds.join(", ") })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </AppRndModalShell>
      ) : null}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("delete.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteCandidateIndex === null) return;
                handleDelete(deleteCandidateIndex);
                setDeleteDialogOpen(false);
                setDeleteCandidateIndex(null);
              }}
              disabled={!loadState.writable}
            >
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
