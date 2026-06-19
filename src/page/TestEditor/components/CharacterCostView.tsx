import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { dirname, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { Buffer } from "buffer";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  CharacterCost,
  CharacterCostData,
  buildCharacterCostBuffer,
} from "@/models/characterCost";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import {
  applyCharacterCostImport,
  exportCharacterCostToJsonFile,
  pickCharacterCostImportPreview,
  type CharacterCostImportPreview,
} from "./character-cost/CharacterCostJson";
import { resolveWorkspaceContent } from "@/services/testEditorWorkspace/contentCatalog";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { LegacyWorkspaceMoveNotice } from "./workspace-layout/LegacyWorkspaceMoveNotice";

const CHARACTER_COST_IMPORT_MODAL_DIMENSIONS = {
  width: 520,
  height: 420,
  minWidth: 440,
  minHeight: 320,
};

const COST_FILES = {
  playable: "foroutgamecharacterparam_playable.bin",
  boss: "foroutgamecharacterparam_boss.bin",
  zako: "foroutgamecharacterparam_zako.bin",
} as const;

export type CharacterCostSubTab = keyof typeof COST_FILES;

interface CharacterCostViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
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
      table: CharacterCost;
    };

function emptyPanels(): Record<CharacterCostSubTab, LoadState> {
  return {
    playable: { status: "idle" },
    boss: { status: "idle" },
    zako: { status: "idle" },
  };
}

function emptyDirty(): Record<CharacterCostSubTab, boolean> {
  return { playable: false, boss: false, zako: false };
}

function emptySelected(): Record<CharacterCostSubTab, number> {
  return { playable: -1, boss: -1, zako: -1 };
}

function emptyNewRowIndices(): Record<CharacterCostSubTab, Set<number>> {
  return {
    playable: new Set(),
    boss: new Set(),
    zako: new Set(),
  };
}

function shiftNewIndicesAfterDelete(indices: Set<number>, deletedIndex: number): Set<number> {
  const next = new Set<number>();
  for (const i of indices) {
    if (i === deletedIndex) continue;
    if (i > deletedIndex) next.add(i - 1);
    else next.add(i);
  }
  return next;
}

export default function CharacterCostView({
  folderPath,
  isActive,
  onUnsavedChanges,
  workspaceDocument,
}: CharacterCostViewProps) {
  const [subTab, setSubTab] = useState<CharacterCostSubTab>("playable");
  const [panelState, setPanelState] = useState<Record<CharacterCostSubTab, LoadState>>(emptyPanels);
  const [dirty, setDirty] = useState<Record<CharacterCostSubTab, boolean>>(emptyDirty);
  const [selectedIndexByTab, setSelectedIndexByTab] = useState<Record<CharacterCostSubTab, number>>(emptySelected);
  const [searchTerm, setSearchTerm] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<CharacterCostImportPreview | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCandidateIndex, setDeleteCandidateIndex] = useState<number | null>(null);
  const [newRowIndicesByTab, setNewRowIndicesByTab] =
    useState<Record<CharacterCostSubTab, Set<number>>>(emptyNewRowIndices);

  const lastLoadKeyRef = useRef<Record<CharacterCostSubTab, string>>({
    playable: "",
    boss: "",
    zako: "",
  });

  const listParentRef = useRef<HTMLDivElement | null>(null);
  const getListScrollElement = useCallback(() => listParentRef.current, []);

  const loadState = panelState[subTab];
  const selectedIndex = selectedIndexByTab[subTab];
  const hasChanges = dirty[subTab];
  const newRowIndices = newRowIndicesByTab[subTab];

  const resetEditorForTab = useCallback(
    (tab: CharacterCostSubTab) => {
      setSelectedIndexByTab((prev) => ({ ...prev, [tab]: -1 }));
      setSearchTerm("");
      setDirty((prev) => ({ ...prev, [tab]: false }));
    },
    []
  );

  const resolveFilePath = useCallback(
    async (tab: CharacterCostSubTab) => {
      const content = await resolveWorkspaceContent(folderPath, workspaceDocument, "character-cost");
      const pack = content.existing ?? content.configured;
      return {
        content,
        filePath: await join(pack.folderPath, COST_FILES[tab]),
        configuredFilePath: await join(content.configured.folderPath, COST_FILES[tab]),
      };
    },
    [folderPath, workspaceDocument]
  );

  const loadPanel = useCallback(
    async (tab: CharacterCostSubTab, options?: { preserveSelectionId?: number | null }) => {
      if (!folderPath) {
        setPanelState((prev) => ({
          ...prev,
          [tab]: { status: "error", filePath: "", message: "Folder path is empty" },
        }));
        resetEditorForTab(tab);
        return;
      }

      const { content, filePath, configuredFilePath } = await resolveFilePath(tab);
      setPanelState((prev) => ({ ...prev, [tab]: { status: "loading" } }));
      try {
        const fileData = await readFile(filePath);
        const table = new CharacterCost(Buffer.from(fileData));
        setPanelState((prev) => ({
          ...prev,
          [tab]: {
            status: "ready",
            filePath,
            configuredFilePath,
            sourceLayout: content.sourceLayout,
            writable: content.writable,
            table,
          },
        }));
        setNewRowIndicesByTab((prev) => ({ ...prev, [tab]: new Set() }));
        if (options?.preserveSelectionId !== undefined && options?.preserveSelectionId !== null) {
          const idx = table.CharacterData.findIndex((row) => row.CharacterId === options.preserveSelectionId);
          setSelectedIndexByTab((prev) => ({ ...prev, [tab]: idx }));
          setDirty((prev) => ({ ...prev, [tab]: false }));
        } else {
          resetEditorForTab(tab);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        setPanelState((prev) => ({ ...prev, [tab]: { status: "error", filePath, message } }));
        setNewRowIndicesByTab((prev) => ({ ...prev, [tab]: new Set() }));
        resetEditorForTab(tab);
      }
    },
    [folderPath, resetEditorForTab, resolveFilePath]
  );

  useEffect(() => {
    if (!folderPath) {
      setPanelState(emptyPanels());
      setDirty(emptyDirty());
      setSelectedIndexByTab(emptySelected());
      setNewRowIndicesByTab(emptyNewRowIndices());
      lastLoadKeyRef.current = { playable: "", boss: "", zako: "" };
    }
  }, [folderPath]);

  useEffect(() => {
    if (!isActive || !folderPath) return;
    const key = [
      folderPath,
      workspaceDocument.assetRoutes["param.for-outgame"]?.prefix ?? "",
      workspaceDocument.legacyReadFallback ? "legacy-on" : "legacy-off",
      subTab,
    ].join("::");
    if (lastLoadKeyRef.current[subTab] === key) return;
    lastLoadKeyRef.current[subTab] = key;
    void loadPanel(subTab);
  }, [folderPath, isActive, subTab, loadPanel, workspaceDocument]);

  useEffect(() => {
    const anyDirty = dirty.playable || dirty.boss || dirty.zako;
    onUnsavedChanges?.(anyDirty);
  }, [dirty, onUnsavedChanges]);

  const tableData = useMemo(() => {
    if (loadState.status !== "ready") return [];
    return loadState.table.CharacterData;
  }, [loadState]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return tableData.map((row, idx) => ({ row, idx }));
    return tableData
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row.CharacterId.toString().includes(term));
  }, [searchTerm, tableData]);

  const selectedRow = useMemo(() => {
    if (selectedIndex < 0) return null;
    return tableData[selectedIndex] ?? null;
  }, [selectedIndex, tableData]);

  const handleLegacyContentMoved = useCallback(async () => {
    const preserveSelectionId = selectedRow?.CharacterId ?? null;
    lastLoadKeyRef.current = { playable: "", boss: "", zako: "" };
    setPanelState(emptyPanels());
    setDirty(emptyDirty());
    setSelectedIndexByTab(emptySelected());
    setNewRowIndicesByTab(emptyNewRowIndices());
    await loadPanel(subTab, { preserveSelectionId });
  }, [loadPanel, selectedRow?.CharacterId, subTab]);

  const estimateRowSize = useCallback(() => 52, []);
  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: getListScrollElement,
    estimateSize: estimateRowSize,
    overscan: 10,
  });

  const updateTable = useCallback(
    (updater: (prev: CharacterCost) => CharacterCost) => {
      setPanelState((prev) => {
        const cur = prev[subTab];
        if (cur.status !== "ready" || !cur.writable) return prev;
        const nextTable = updater(cur.table);
        return { ...prev, [subTab]: { ...cur, table: nextTable } };
      });
      if (panelState[subTab].status === "ready" && panelState[subTab].writable) {
        setDirty((d) => ({ ...d, [subTab]: true }));
      }
    },
    [panelState, subTab]
  );

  const handleSelect = useCallback(
    (index: number) => {
      setSelectedIndexByTab((prev) => ({ ...prev, [subTab]: index }));
    },
    [subTab]
  );

  const updateSelectedRowField = useCallback(
    (key: keyof CharacterCostData, value: number) => {
      if (loadState.status !== "ready" || !loadState.writable) return;
      if (selectedIndex < 0) return;

      updateTable((prevTable) => {
        const nextRows = [...prevTable.CharacterData];
        const current = nextRows[selectedIndex];
        if (!current) return prevTable;

        nextRows[selectedIndex] = {
          ...current,
          [key]: value,
        } as CharacterCostData;

        const next = Object.assign(Object.create(Object.getPrototypeOf(prevTable)), prevTable, {
          CharacterData: nextRows,
          CharacterCount: nextRows.length,
        });
        return next;
      });
    },
    [loadState.status, selectedIndex, updateTable]
  );

  const handleDelete = useCallback(
    (index: number) => {
      if (loadState.status !== "ready" || !loadState.writable) return;
      updateTable((prevTable) => {
        const nextRows = prevTable.CharacterData.filter((_, i) => i !== index);
        const next = Object.assign(Object.create(Object.getPrototypeOf(prevTable)), prevTable, {
          CharacterData: nextRows,
          CharacterCount: nextRows.length,
        });
        return next;
      });

      setNewRowIndicesByTab((prev) => ({
        ...prev,
        [subTab]: shiftNewIndicesAfterDelete(prev[subTab], index),
      }));

      if (selectedIndex === index) {
        setSelectedIndexByTab((prev) => ({ ...prev, [subTab]: -1 }));
      } else if (selectedIndex > index) {
        setSelectedIndexByTab((prev) => ({ ...prev, [subTab]: selectedIndex - 1 }));
      }
    },
    [loadState, selectedIndex, subTab, updateTable]
  );

  const handleAdd = useCallback(() => {
    if (loadState.status !== "ready" || !loadState.writable) return;
    const newRowIndex = loadState.table.CharacterData.length;
    updateTable((prevTable) => {
      const maxId = Math.max(...prevTable.CharacterData.map((r) => r.CharacterId), 0);
      const newRow = {
        CharacterId: maxId + 1,
        Cost: 0,
        Hp: 0,
      } as CharacterCostData;
      const nextRows = [...prevTable.CharacterData, newRow];
      const next = Object.assign(Object.create(Object.getPrototypeOf(prevTable)), prevTable, {
        CharacterData: nextRows,
        CharacterCount: nextRows.length,
      });
      return next;
    });
    setSelectedIndexByTab((prev) => ({ ...prev, [subTab]: newRowIndex }));
    setNewRowIndicesByTab((prev) => {
      const s = new Set(prev[subTab]);
      s.add(newRowIndex);
      return { ...prev, [subTab]: s };
    });
  }, [loadState, subTab, updateTable]);

  const handleCopyRow = useCallback(
    (index: number) => {
      if (loadState.status !== "ready" || !loadState.writable) return;
      const newRowIndex = loadState.table.CharacterData.length;
      updateTable((prevTable) => {
        const sourceRow = prevTable.CharacterData[index];
        if (!sourceRow) return prevTable;
        const newRow = {
          ...sourceRow,
          CharacterId: sourceRow.CharacterId + 1,
        } as CharacterCostData;
        const nextRows = [...prevTable.CharacterData, newRow];
        const next = Object.assign(Object.create(Object.getPrototypeOf(prevTable)), prevTable, {
          CharacterData: nextRows,
          CharacterCount: nextRows.length,
        });
        return next;
      });
      setSelectedIndexByTab((prev) => ({ ...prev, [subTab]: newRowIndex }));
      setNewRowIndicesByTab((prev) => {
        const s = new Set(prev[subTab]);
        s.add(newRowIndex);
        return { ...prev, [subTab]: s };
      });
    },
    [loadState, subTab, updateTable]
  );

  const handleSaveFile = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error("Legacy flat workspace content is read-only");
      return;
    }
    const filePath = loadState.filePath;
    try {
      const backupPath = filePath.replace(/\.bin$/i, "_bak.bin");
      try {
        const existing = await readFile(filePath);
        await writeFile(backupPath, existing);
      } catch {
        // Ignore backup failures
      }

      const sortedRows = [...loadState.table.CharacterData].sort((a, b) => {
        const aIsPositive = a.CharacterId >= 0;
        const bIsPositive = b.CharacterId >= 0;
        if (aIsPositive !== bIsPositive) return aIsPositive ? -1 : 1;
        return a.CharacterId - b.CharacterId;
      });
      const sortedTable = Object.assign(Object.create(Object.getPrototypeOf(loadState.table)), loadState.table, {
        CharacterData: sortedRows,
        CharacterCount: sortedRows.length,
      });
      const buffer = buildCharacterCostBuffer(sortedTable);
      await writeFile(filePath, buffer);
      toast.success(`Saved ${COST_FILES[subTab]}`);
      setDirty((d) => ({ ...d, [subTab]: false }));
      await loadPanel(subTab, { preserveSelectionId: selectedRow?.CharacterId ?? null });
    } catch (error) {
      console.error(error);
      toast.error("Failed to save character cost file");
    }
  }, [loadPanel, loadState, selectedRow?.CharacterId, subTab]);

  const handleOpenFolder = useCallback(async () => {
    if (loadState.status !== "ready") return;
    const folderPathToOpen = await dirname(loadState.filePath);
    try {
      const pathExists = await exists(folderPathToOpen);
      if (!pathExists) {
        toast.error("Path does not exist");
        return;
      }
      await openPath(folderPathToOpen);
    } catch (error) {
      console.error(error);
      toast.error("Failed to open folder");
    }
  }, [loadState]);

  const handleExportJson = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (isExporting) return;
    setIsExporting(true);
    try {
      const result = await exportCharacterCostToJsonFile(loadState.table, {
        defaultFileName: COST_FILES[subTab].replace(/\.bin$/i, ".json"),
      });
      if (!result) return;
      toast.success(`Exported ${result.count} rows`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to export JSON: ${message}`);
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, loadState, subTab]);

  const handlePickImportJson = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error("Legacy flat workspace content is read-only");
      return;
    }
    if (isImporting) return;
    setIsImporting(true);
    try {
      const preview = await pickCharacterCostImportPreview();
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

  const handleConfirmImport = useCallback(() => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error("Legacy flat workspace content is read-only");
      return;
    }
    if (!importPreview) return;
    try {
      const nextTable = applyCharacterCostImport(loadState.table, importPreview.rows);
      setPanelState((prev) => {
        const cur = prev[subTab];
        if (cur.status !== "ready") return prev;
        return { ...prev, [subTab]: { ...cur, table: nextTable } };
      });
      setSelectedIndexByTab((prev) => ({ ...prev, [subTab]: -1 }));
      setSearchTerm("");
      setDirty((d) => ({ ...d, [subTab]: true }));
      setNewRowIndicesByTab((prev) => ({ ...prev, [subTab]: new Set() }));
      setIsImportDialogOpen(false);
      setImportPreview(null);
      toast.success(`Imported ${importPreview.validCount} rows`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to apply import");
    }
  }, [importPreview, loadState, subTab]);

  const openDeleteDialog = useCallback((index: number) => {
    if (loadState.status !== "ready" || !loadState.writable) return;
    setDeleteCandidateIndex(index);
    setDeleteDialogOpen(true);
  }, [loadState]);

  const confirmDelete = useCallback(() => {
    if (deleteCandidateIndex === null) return;
    handleDelete(deleteCandidateIndex);
    setDeleteDialogOpen(false);
    setDeleteCandidateIndex(null);
  }, [deleteCandidateIndex, handleDelete]);

  const handleSubTabChange = useCallback((v: string) => {
    setSubTab(v as CharacterCostSubTab);
    setSearchTerm("");
  }, []);

  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  if (!folderPath.trim()) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
        Select a workspace folder in the toolbar.
      </div>
    );
  }

  if (loadState.status === "loading" || loadState.status === "idle") {
    return (
      <div className="h-full w-full flex flex-col min-h-0">
        <Tabs value={subTab} onValueChange={handleSubTabChange} className="flex flex-col flex-1 min-h-0 gap-3">
          <TabsList className="w-fit shrink-0">
            <TabsTrigger value="playable">Playable</TabsTrigger>
            <TabsTrigger value="boss">Boss</TabsTrigger>
            <TabsTrigger value="zako">Zako</TabsTrigger>
          </TabsList>
          <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
            <CardHeader className="p-0 pb-4">
              <CardTitle>Character Cost</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-0">
              <div className="text-sm text-muted-foreground">Loading {COST_FILES[subTab]}...</div>
            </CardContent>
          </Card>
        </Tabs>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="h-full w-full flex flex-col min-h-0">
        <Tabs value={subTab} onValueChange={handleSubTabChange} className="flex h-full flex-col gap-3 flex-1 min-h-0">
          <TabsList className="w-fit">
            <TabsTrigger value="playable">Playable</TabsTrigger>
            <TabsTrigger value="boss">Boss</TabsTrigger>
            <TabsTrigger value="zako">Zako</TabsTrigger>
          </TabsList>
          <Card className="border-none shadow-none rounded-none bg-transparent">
            <CardHeader className="p-0 pb-4">
              <CardTitle>Character Cost</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-0">
              <div className="text-sm text-muted-foreground break-all">
                {loadState.filePath ? (
                  <>
                    <div className="font-medium text-foreground">File</div>
                    {loadState.filePath}
                  </>
                ) : (
                  "Folder path is empty"
                )}
              </div>
              <div className="text-sm text-destructive">{loadState.message}</div>
              <Button size="sm" onClick={() => void loadPanel(subTab)} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Reload
              </Button>
            </CardContent>
          </Card>
        </Tabs>
      </div>
    );
  }

  if (loadState.status !== "ready") {
    return null;
  }

  return (
    <div className="h-full w-full flex flex-col min-h-0">
      <Tabs value={subTab} onValueChange={handleSubTabChange} className="flex h-full min-h-0 flex-1 flex-col gap-3">
        <TabsList className="w-fit shrink-0">
          <TabsTrigger value="playable">Playable</TabsTrigger>
          <TabsTrigger value="boss">Boss</TabsTrigger>
          <TabsTrigger value="zako">Zako</TabsTrigger>
        </TabsList>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent min-h-0">
            <CardHeader className="p-0 pb-4 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <CardTitle>Character Cost</CardTitle>
                  <div className="text-xs text-muted-foreground break-all mt-1 flex items-center gap-1">
                    {loadState.filePath}
                    <button
                      type="button"
                      onClick={() => void handleOpenFolder()}
                      className="shrink-0 p-0.5 rounded hover:bg-accent hover:text-accent-foreground"
                      title="Open folder"
                      aria-label="Open folder"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {COST_FILES[subTab]} — {loadState.table.CharacterCount} rows · CommandsCount{" "}
                    {loadState.table.CommandsCount}
                  </div>
                  <LegacyWorkspaceMoveNotice
                    workspaceRoot={folderPath}
                    workspaceDocument={workspaceDocument}
                    contentId="character-cost"
                    sourceLayout={loadState.sourceLayout}
                    configuredPath={loadState.configuredFilePath}
                    onMoved={handleLegacyContentMoved}
                    className="mt-2"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0 justify-end">
                  <Button size="sm" variant="outline" onClick={() => void loadPanel(subTab)} className="inline-flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Reload
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handlePickImportJson()}
                    disabled={!loadState.writable || isImporting || isExporting}
                    className="inline-flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Import JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleExportJson()}
                    disabled={isExporting || isImporting || loadState.table.CharacterData.length === 0}
                    className="inline-flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export JSON
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleSaveFile()}
                    disabled={!loadState.writable || !hasChanges}
                    className="inline-flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save File
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 min-h-0 p-0 flex flex-col">
              <div className="flex h-full min-h-0 gap-4 flex-1">
                <div className="w-1/3 border rounded-lg p-3 overflow-hidden flex flex-col min-h-0">
                  <div className="flex items-center justify-between mb-3 shrink-0">
                    <div className="font-semibold text-sm">Rows ({tableData.length})</div>
                    <Button size="sm" onClick={handleAdd} disabled={!loadState.writable} className="inline-flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Add
                    </Button>
                  </div>

                  <div className="relative mb-3 shrink-0">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Search by Character ID..."
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
                                idx === selectedIndex && "ring-2 ring-inset ring-primary bg-accent"
                              )}
                              onClick={() => handleSelect(idx)}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="text-sm font-medium truncate">ID: {row.CharacterId}</span>
                                {newRowIndices.has(idx) && (
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[10px] px-1.5 py-0"
                                  >
                                    New
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-primary hover:text-primary hover:bg-primary/10"
                                  disabled={!loadState.writable}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!loadState.writable) return;
                                    handleCopyRow(idx);
                                  }}
                                  title="Copy as new"
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
                                    if (!loadState.writable) return;
                                    openDeleteDialog(idx);
                                  }}
                                  title="Delete"
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
                      <div className="text-center text-muted-foreground py-8 text-sm">No rows found</div>
                    )}
                  </div>
                </div>

                <div className="flex-1 border rounded-lg p-4 overflow-hidden flex flex-col min-h-0">
                  {selectedRow ? (
                    <>
                      <div className="flex items-center justify-between mb-4 shrink-0">
                        <div className="text-sm font-semibold">Edit row (index: {selectedIndex})</div>
                        <div className="text-xs text-muted-foreground">int32 (decimal or hex)</div>
                      </div>
                      <ScrollArea className="flex-1 min-h-0">
                        <div className="space-y-2 pr-2">
                          <DualValueProperty
                            label="Character ID"
                            value={selectedRow.CharacterId}
                            property="CharacterId"
                            editable={loadState.writable}
                            editingProperty={null}
                            editValue=""
                            validationError=""
                            onStartEdit={() => {}}
                            onSaveEdit={() => {}}
                            onCancelEdit={() => {}}
                            onValueChange={() => {}}
                            showHex={false}
                            variant="compact"
                            mode="live"
                            onCommit={(nextValue) => updateSelectedRowField("CharacterId", nextValue)}
                          />
                          <DualValueProperty
                            label="Cost"
                            value={selectedRow.Cost}
                            property="Cost"
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
                            onCommit={(nextValue) => updateSelectedRowField("Cost", nextValue)}
                          />
                          <DualValueProperty
                            label="HP"
                            value={selectedRow.Hp}
                            property="Hp"
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
                            onCommit={(nextValue) => updateSelectedRowField("Hp", nextValue)}
                          />
                        </div>
                      </ScrollArea>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">Select a row to edit Cost and HP (int32).</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Tabs>

      {isImportDialogOpen ? (
        <AppRndModalShell
          titleId="character-cost-import-title"
          title="Import character cost JSON?"
          subtitle={`Replace rows in ${COST_FILES[subTab]}.`}
          headerIcon={<Upload className="h-5 w-5 text-primary" />}
          dimensions={CHARACTER_COST_IMPORT_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.character-cost-import"
          onClose={() => setIsImportDialogOpen(false)}
          footer={
            <div className="flex justify-end gap-2 bg-background px-6 py-4">
              <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmImport} disabled={!loadState.writable}>
                Apply import
              </Button>
            </div>
          }
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6 text-sm">
            <p className="text-muted-foreground">
              This replaces all rows in the current file with valid entries from the JSON file.
            </p>
            {importPreview ? (
              <div className="space-y-1">
                <div>Valid rows: {importPreview.validCount}</div>
                <div>Invalid / skipped: {importPreview.invalidCount}</div>
                {importPreview.duplicateIds.length > 0 ? (
                  <div className="text-amber-600">Duplicate IDs in file: {importPreview.duplicateIds.join(", ")}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        </AppRndModalShell>
      ) : null}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete row?</AlertDialogTitle>
            <AlertDialogDescription>This removes the entry from the list. Save the file to write to disk.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={!loadState.writable}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
