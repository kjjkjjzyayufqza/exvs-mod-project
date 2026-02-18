import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { dirname, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { Buffer } from "buffer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Save, RefreshCw, Plus, Trash2, Search, Copy, Clipboard, Download, Upload, FolderOpen } from "lucide-react";
import { CharacterIdTable, CharacterIdTableData, buildCharacterIdTableBuffer } from "@/models/characterIdTable";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DualValueProperty } from "@/components/ui/dual-value-property";
import {
    applyCharacterIdTableImport,
    exportCharacterIdTableToJsonFile,
    pickCharacterIdTableImportPreview,
    type CharacterIdTableImportPreview,
} from "./character-id-table/CharacterIdTableJson";

interface CharacterIdTableViewProps {
    folderPath: string;
    isActive: boolean;
    onUnsavedChanges?: (hasChanges: boolean) => void;
}

type LoadState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; filePath: string; message: string }
    | { status: "ready"; filePath: string; table: CharacterIdTable };

const CLIPBOARD_PREFIX = "CHARACTER_ID_TABLE_FIELDS_V1";
const REQUIRED_FIELD_KEYS = ["Model", "Effect", "Sound", "Param", "Msc", "Motion"] as const;

type ClipboardPayload = {
    version: 1;
    sourceCharacterId: number;
    fields: Pick<CharacterIdTableData, (typeof REQUIRED_FIELD_KEYS)[number]>;
};

const isValidNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const parseClipboardPayload = (text: string): ClipboardPayload | null => {
    const prefix = `${CLIPBOARD_PREFIX}\n`;
    if (!text.startsWith(prefix)) return null;
    const jsonText = text.slice(prefix.length).trim();
    if (!jsonText) return null;

    try {
        const parsed = JSON.parse(jsonText) as Partial<ClipboardPayload> | null;
        if (!parsed || parsed.version !== 1) return null;
        if (!isValidNumber(parsed.sourceCharacterId)) return null;
        if (!parsed.fields || typeof parsed.fields !== "object") return null;

        for (const key of REQUIRED_FIELD_KEYS) {
            const value = (parsed.fields as Record<string, unknown>)[key];
            if (!isValidNumber(value)) return null;
        }

        return parsed as ClipboardPayload;
    } catch {
        return null;
    }
};

export default function CharacterIdTableView({ folderPath, isActive, onUnsavedChanges }: CharacterIdTableViewProps) {
    const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);
    const [searchTerm, setSearchTerm] = useState("");
    const [hasChanges, setHasChanges] = useState(false);
    const deferredSearchTerm = useDeferredValue(searchTerm);

    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importPreview, setImportPreview] = useState<CharacterIdTableImportPreview | null>(null);
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteCandidateIndex, setDeleteCandidateIndex] = useState<number | null>(null);
    const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
    const [pasteCandidate, setPasteCandidate] = useState<ClipboardPayload | null>(null);
    const [clipboardPayload, setClipboardPayload] = useState<ClipboardPayload | null>(null);

    const lastLoadedKeyRef = useRef<string>("");
    const listParentRef = useRef<HTMLDivElement | null>(null);
    const getListScrollElement = useCallback(() => listParentRef.current, []);
    const estimateRowSize = useCallback(() => 52, []);

    const resetEditorState = useCallback(() => {
        setSelectedIndex(-1);
        setSearchTerm("");
        setHasChanges(false);
        onUnsavedChanges?.(false);
    }, [onUnsavedChanges]);

    const resolveFilePath = useCallback(async () => {
        return await join(folderPath, "0x036B9E67", "character_id_table.bin");
    }, [folderPath]);

    const load = useCallback(async (options?: { preserveSelectionId?: number | null }) => {
        if (!folderPath) {
            setLoadState({ status: "error", filePath: "", message: "Folder path is empty" });
            resetEditorState();
            return;
        }

        const filePath = await resolveFilePath();
        setLoadState({ status: "loading" });
        try {
            console.log("filePath", filePath);
            const fileData = await readFile(filePath);
            const table = new CharacterIdTable(Buffer.from(fileData));
            console.log("table", table);
            setLoadState({ status: "ready", filePath, table });
            if (options?.preserveSelectionId !== undefined && options?.preserveSelectionId !== null) {
                const nextIndex = table.CharacterData.findIndex((row) => row.CharacterId === options.preserveSelectionId);
                setSelectedIndex(nextIndex);
                setHasChanges(false);
                onUnsavedChanges?.(false);
            } else {
                resetEditorState();
            }
        } catch (error) {
            console.error("error", error);
            setLoadState({ status: "error", filePath, message: error instanceof Error ? error.message : "Unknown error" });
            resetEditorState();
        }
    }, [folderPath, onUnsavedChanges, resetEditorState, resolveFilePath]);

    useEffect(() => {
        if (!isActive) return;
        const key = `${folderPath}::characteridtable`;
        if (key === lastLoadedKeyRef.current) return;
        lastLoadedKeyRef.current = key;
        void load();
    }, [folderPath, isActive, load]);

    const tableData = useMemo(() => {
        if (loadState.status !== "ready") return [];
        return loadState.table.CharacterData;
    }, [loadState]);

    const filteredRows = useMemo(() => {
        const term = deferredSearchTerm.trim();
        if (!term) return tableData.map((row, idx) => ({ row, idx }));
        return tableData
            .map((row, idx) => ({ row, idx }))
            .filter(({ row }) => row.CharacterId.toString().includes(term));
    }, [deferredSearchTerm, tableData]);

    const selectedRow = useMemo(() => {
        if (selectedIndex < 0) return null;
        return tableData[selectedIndex] ?? null;
    }, [selectedIndex, tableData]);

    const deleteCandidateRow = useMemo(() => {
        if (deleteCandidateIndex === null) return null;
        return tableData[deleteCandidateIndex] ?? null;
    }, [deleteCandidateIndex, tableData]);

    const rowVirtualizer = useVirtualizer({
        count: filteredRows.length,
        getScrollElement: getListScrollElement,
        estimateSize: estimateRowSize,
        overscan: 10,
    });

    const updateTable = useCallback(
        (updater: (prev: CharacterIdTable) => CharacterIdTable) => {
            setLoadState((prev) => {
                if (prev.status !== "ready") return prev;
                const nextTable = updater(prev.table);
                return { ...prev, table: nextTable };
            });
        },
        []
    );

    const handleSelect = useCallback((index: number) => {
        setSelectedIndex(index);
    }, []);

    const updateSelectedRowField = useCallback((key: keyof CharacterIdTableData, value: number) => {
        if (loadState.status !== "ready") return;
        if (selectedIndex < 0) return;

        updateTable((prevTable) => {
            const nextRows = [...prevTable.CharacterData];
            const current = nextRows[selectedIndex];
            if (!current) return prevTable;

            nextRows[selectedIndex] = {
                ...current,
                [key]: value,
            } as CharacterIdTableData;

            const next = Object.assign(Object.create(Object.getPrototypeOf(prevTable)), prevTable, {
                CharacterData: nextRows,
                CharacterCount: nextRows.length,
            });
            return next;
        });

        setHasChanges(true);
        onUnsavedChanges?.(true);
    }, [loadState.status, onUnsavedChanges, selectedIndex, updateTable]);

    const updateSelectedRowFields = useCallback((fields: ClipboardPayload["fields"]) => {
        if (loadState.status !== "ready") return;
        if (selectedIndex < 0) return;

        updateTable((prevTable) => {
            const nextRows = [...prevTable.CharacterData];
            const current = nextRows[selectedIndex];
            if (!current) return prevTable;

            nextRows[selectedIndex] = {
                ...current,
                ...fields,
            } as CharacterIdTableData;

            const next = Object.assign(Object.create(Object.getPrototypeOf(prevTable)), prevTable, {
                CharacterData: nextRows,
                CharacterCount: nextRows.length,
            });
            return next;
        });

        setHasChanges(true);
        onUnsavedChanges?.(true);
    }, [loadState.status, onUnsavedChanges, selectedIndex, updateTable]);

    const handleDelete = useCallback(
        (index: number) => {
            updateTable((prevTable) => {
                const nextRows = prevTable.CharacterData.filter((_, i) => i !== index);
                const next = Object.assign(Object.create(Object.getPrototypeOf(prevTable)), prevTable, {
                    CharacterData: nextRows,
                    CharacterCount: nextRows.length,
                });
                return next;
            });

            setHasChanges(true);
            onUnsavedChanges?.(true);

            if (selectedIndex === index) {
                setSelectedIndex(-1);
            } else if (selectedIndex > index) {
                setSelectedIndex((v) => v - 1);
            }
        },
        [onUnsavedChanges, selectedIndex, updateTable]
    );

    const openDeleteDialog = useCallback((index: number) => {
        setDeleteCandidateIndex(index);
        setDeleteDialogOpen(true);
    }, []);

    const closeDeleteDialog = useCallback(() => {
        setDeleteDialogOpen(false);
        setDeleteCandidateIndex(null);
    }, []);

    const confirmDelete = useCallback(() => {
        if (deleteCandidateIndex === null) return;
        handleDelete(deleteCandidateIndex);
        closeDeleteDialog();
    }, [closeDeleteDialog, deleteCandidateIndex, handleDelete]);

    const handleCopyFields = useCallback(async () => {
        if (!selectedRow) return;
        const payload: ClipboardPayload = {
            version: 1,
            sourceCharacterId: selectedRow.CharacterId,
            fields: {
                Model: selectedRow.Model,
                Effect: selectedRow.Effect,
                Sound: selectedRow.Sound,
                Param: selectedRow.Param,
                Msc: selectedRow.Msc,
                Motion: selectedRow.Motion,
            },
        };

        try {
            const text = `${CLIPBOARD_PREFIX}\n${JSON.stringify(payload)}`;
            await writeText(text);
            setClipboardPayload(payload);
            toast.success("Copied fields to clipboard");
        } catch (error) {
            console.error(error);
            toast.error("Failed to copy fields");
        }
    }, [selectedRow]);

    const refreshClipboardPayload = useCallback(async () => {
        try {
            const text = await readText();
            const parsed = parseClipboardPayload(text);
            setClipboardPayload(parsed);
        } catch {
            setClipboardPayload(null);
        }
    }, []);

    const readClipboardPayload = useCallback(async () => {
        try {
            const text = await readText();
            return parseClipboardPayload(text);
        } catch {
            return null;
        }
    }, []);

    const attemptPasteFromClipboard = useCallback(async (options?: { silent?: boolean }) => {
        if (!selectedRow) return;
        const parsed = await readClipboardPayload();
        if (!parsed) {
            if (!options?.silent) {
                toast.error("Clipboard does not contain character table fields");
            }
            return;
        }
        if (parsed.sourceCharacterId === selectedRow.CharacterId) {
            if (!options?.silent) {
                toast.error("Clipboard fields are from the same Character ID");
            }
            return;
        }
        setPasteCandidate(parsed);
        setPasteDialogOpen(true);
    }, [readClipboardPayload, selectedRow]);

    const handlePasteRequest = useCallback(async () => {
        await attemptPasteFromClipboard();
    }, [attemptPasteFromClipboard]);

    const closePasteDialog = useCallback(() => {
        setPasteDialogOpen(false);
        setPasteCandidate(null);
    }, []);

    const confirmPaste = useCallback(() => {
        if (!pasteCandidate) return;
        updateSelectedRowFields(pasteCandidate.fields);
        closePasteDialog();
    }, [closePasteDialog, pasteCandidate, updateSelectedRowFields]);

    const handleAdd = useCallback(() => {
        updateTable((prevTable) => {
            const maxId = Math.max(...prevTable.CharacterData.map((r) => r.CharacterId), 0);
            const newRow: CharacterIdTableData = {
                CharacterId: maxId + 1,
                Model: 0,
                Effect: 0,
                Sound: 0,
                Param: 0,
                Msc: 0,
                Motion: 0,
            };
            const nextRows = [...prevTable.CharacterData, newRow];
            const next = Object.assign(Object.create(Object.getPrototypeOf(prevTable)), prevTable, {
                CharacterData: nextRows,
                CharacterCount: nextRows.length,
            });
            return next;
        });

        setHasChanges(true);
        onUnsavedChanges?.(true);

        setSelectedIndex(tableData.length);
    }, [onUnsavedChanges, tableData.length, updateTable]);

    const handleCopy = useCallback((index: number) => {
        updateTable((prevTable) => {
            const sourceRow = prevTable.CharacterData[index];
            if (!sourceRow) return prevTable;
            const newRow: CharacterIdTableData = {
                ...sourceRow,
                CharacterId: sourceRow.CharacterId + 1,
            };
            const nextRows = [...prevTable.CharacterData, newRow];
            const next = Object.assign(Object.create(Object.getPrototypeOf(prevTable)), prevTable, {
                CharacterData: nextRows,
                CharacterCount: nextRows.length,
            });
            return next;
        });

        const newIndex = tableData.length;
        setSelectedIndex(newIndex);
        setHasChanges(true);
        onUnsavedChanges?.(true);
    }, [onUnsavedChanges, tableData.length, updateTable]);

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
            const buffer = buildCharacterIdTableBuffer(sortedTable);
            await writeFile(filePath, buffer);
            toast.success("Saved characteridtable.bin");
            setHasChanges(false);
            onUnsavedChanges?.(false);
            await load({ preserveSelectionId: selectedRow?.CharacterId ?? null });
        } catch (error) {
            console.error(error);
            toast.error("Failed to save characteridtable.bin");
        }
    }, [load, loadState, onUnsavedChanges, selectedRow?.CharacterId]);

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

    const handleOpenCharacterIdTableFolder = useCallback(async () => {
        if (loadState.status !== "ready") return;
        const folderPathToOpen = await dirname(loadState.filePath);
        await handleOpenPath(folderPathToOpen);
    }, [loadState, handleOpenPath]);

    const handleExportJson = useCallback(async () => {
        if (loadState.status !== "ready") return;
        if (isExporting) return;

        setIsExporting(true);
        try {
            const result = await exportCharacterIdTableToJsonFile(loadState.table);
            if (!result) return;
            toast.success(`Exported ${result.count} rows`);
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Unknown error";
            toast.error(`Failed to export JSON: ${message}`);
        } finally {
            setIsExporting(false);
        }
    }, [isExporting, loadState]);

    const handlePickImportJson = useCallback(async () => {
        if (loadState.status !== "ready") return;
        if (isImporting) return;

        setIsImporting(true);
        try {
            const preview = await pickCharacterIdTableImportPreview();
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
        if (!importPreview) return;
        if (isImporting) return;

        setIsImporting(true);
        try {
            const nextTable = applyCharacterIdTableImport(loadState.table, importPreview.rows);
            setLoadState((prev) => {
                if (prev.status !== "ready") return prev;
                return { ...prev, table: nextTable };
            });

            setSelectedIndex(-1);
            setSearchTerm("");
            setHasChanges(true);
            onUnsavedChanges?.(true);

            setIsImportDialogOpen(false);
            setImportPreview(null);
            toast.success(`Imported ${importPreview.validCount} rows`);
        } catch (error) {
            console.error(error);
            const message = error instanceof Error ? error.message : "Unknown error";
            toast.error(`Failed to apply import: ${message}`);
        } finally {
            setIsImporting(false);
        }
    }, [importPreview, isImporting, loadState, onUnsavedChanges]);

    useEffect(() => {
        if (!isActive || !selectedRow) {
            setClipboardPayload(null);
            return;
        }
        void refreshClipboardPayload();
    }, [isActive, refreshClipboardPayload, selectedRow?.CharacterId]);

    useEffect(() => {
        if (!isActive || !selectedRow) return;

        const handlePaste = (event: ClipboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
                    return;
                }
            }
            void attemptPasteFromClipboard({ silent: true });
        };

        document.addEventListener("paste", handlePaste);
        return () => {
            document.removeEventListener("paste", handlePaste);
        };
    }, [attemptPasteFromClipboard, isActive, selectedRow]);
    if (!isActive) {
        return <div className="h-full w-full" />;
    }

    if (loadState.status === "loading") {
        return (
            <div className="h-full w-full">
                <Card className="h-full flex flex-col">
                    <CardHeader>
                        <CardTitle>Character ID Table</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="text-sm text-muted-foreground">
                            Loading characteridtable.bin...
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (loadState.status === "error") {
        return (
            <div className="h-full w-full">
                <Card>
                    <CardHeader>
                        <CardTitle>Character ID Table</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
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
                Select this tab to load characteridtable.bin
            </div>
        );
    }

    return (
        <div className="h-full w-full">
            <Card className="h-full flex flex-col">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <CardTitle>Character ID Table</CardTitle>
                            <div className="text-xs text-muted-foreground break-all mt-1 flex items-center gap-1">
                                {loadState.filePath}
                                <button
                                    type="button"
                                    onClick={() => void handleOpenCharacterIdTableFolder()}
                                    className="shrink-0 p-0.5 rounded hover:bg-accent hover:text-accent-foreground"
                                    title="Open folder"
                                    aria-label="Open folder"
                                >
                                    <FolderOpen className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                                Loaded: {loadState.table.CharacterCount} rows
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => void load()} className="inline-flex items-center gap-2">
                                <RefreshCw className="w-4 h-4" />
                                Reload
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handlePickImportJson()}
                                disabled={isImporting || isExporting}
                                className="inline-flex items-center gap-2"
                                title="Import character id table from JSON"
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
                                title="Export character id table to JSON"
                            >
                                <Download className="w-4 h-4" />
                                Export JSON
                            </Button>
                            <Button size="sm" onClick={() => void handleSaveFile()} disabled={!hasChanges} className="inline-flex items-center gap-2">
                                <Save className="w-4 h-4" />
                                Save File
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="flex-1 min-h-0">
                    <div className="flex h-full gap-4">
                        <div className="w-1/3 border rounded-lg p-3 overflow-hidden flex flex-col min-h-0">
                            <div className="flex items-center justify-between mb-3">
                                <div className="font-semibold text-sm">Rows ({tableData.length})</div>
                                <Button size="sm" onClick={handleAdd} className="inline-flex items-center gap-2">
                                    <Plus className="w-4 h-4" />
                                    Add
                                </Button>
                            </div>

                            <div className="relative mb-3">
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
                                                    <div className="text-sm font-medium truncate">ID: {row.CharacterId}</div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-blue-600 hover:text-blue-600 hover:bg-blue-50"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleCopy(idx);
                                                            }}
                                                            title="Copy as new"
                                                        >
                                                            <Copy className="w-4 h-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
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
                                    <div className="text-center text-muted-foreground py-8 text-sm">
                                        No rows found
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 border rounded-lg p-4 overflow-hidden flex flex-col min-h-0">
                            {selectedRow ? (
                                <>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="text-sm font-semibold">Edit Row (index: {selectedIndex})</div>
                                        <div className="text-xs text-muted-foreground">
                                            Values can be edited as int32 or hex
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 mb-4">
                                        <Button size="sm" variant="outline" onClick={() => void handleCopyFields()}>
                                            <Copy className="w-4 h-4 mr-2" />
                                            Copy fields
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => void handlePasteRequest()}
                                            disabled={!clipboardPayload || clipboardPayload.sourceCharacterId === selectedRow.CharacterId}
                                        >
                                            <Clipboard className="w-4 h-4 mr-2" />
                                            Paste fields
                                        </Button>
                                    </div>

                                    <ScrollArea className="flex-1 min-h-0">
                                        <div className="space-y-2 pr-2">
                                            <DualValueProperty
                                                label="Character ID"
                                                value={selectedRow.CharacterId}
                                                property="CharacterId"
                                                editable
                                                editingProperty={null}
                                                editValue=""
                                                validationError=""
                                                onStartEdit={() => { }}
                                                onSaveEdit={() => { }}
                                                onCancelEdit={() => { }}
                                                onValueChange={() => { }}
                                                showHex={false}
                                                variant="compact"
                                                mode="live"
                                                onCommit={(nextValue) => updateSelectedRowField("CharacterId", nextValue)}
                                            />

                                            <div className="grid grid-cols-2 gap-2">
                                                <DualValueProperty
                                                    label="Model"
                                                    value={selectedRow.Model}
                                                    property="Model"
                                                    editable
                                                    variant="compact"
                                                    editingProperty={null}
                                                    editValue=""
                                                    validationError=""
                                                    onStartEdit={() => { }}
                                                    onSaveEdit={() => { }}
                                                    onCancelEdit={() => { }}
                                                    onValueChange={() => { }}
                                                    mode="live"
                                                    onCommit={(nextValue) => updateSelectedRowField("Model", nextValue)}
                                                />

                                                <DualValueProperty
                                                    label="Effect"
                                                    value={selectedRow.Effect}
                                                    property="Effect"
                                                    editable
                                                    variant="compact"
                                                    editingProperty={null}
                                                    editValue=""
                                                    validationError=""
                                                    onStartEdit={() => { }}
                                                    onSaveEdit={() => { }}
                                                    onCancelEdit={() => { }}
                                                    onValueChange={() => { }}
                                                    mode="live"
                                                    onCommit={(nextValue) => updateSelectedRowField("Effect", nextValue)}
                                                />

                                                <DualValueProperty
                                                    label="Sound"
                                                    value={selectedRow.Sound}
                                                    property="Sound"
                                                    editable
                                                    variant="compact"
                                                    editingProperty={null}
                                                    editValue=""
                                                    validationError=""
                                                    onStartEdit={() => { }}
                                                    onSaveEdit={() => { }}
                                                    onCancelEdit={() => { }}
                                                    onValueChange={() => { }}
                                                    mode="live"
                                                    onCommit={(nextValue) => updateSelectedRowField("Sound", nextValue)}
                                                />

                                                <DualValueProperty
                                                    label="Param"
                                                    value={selectedRow.Param}
                                                    property="Param"
                                                    editable
                                                    variant="compact"
                                                    editingProperty={null}
                                                    editValue=""
                                                    validationError=""
                                                    onStartEdit={() => { }}
                                                    onSaveEdit={() => { }}
                                                    onCancelEdit={() => { }}
                                                    onValueChange={() => { }}
                                                    mode="live"
                                                    onCommit={(nextValue) => updateSelectedRowField("Param", nextValue)}
                                                />

                                                <DualValueProperty
                                                    label="MSC"
                                                    value={selectedRow.Msc}
                                                    property="Msc"
                                                    editable
                                                    variant="compact"
                                                    editingProperty={null}
                                                    editValue=""
                                                    validationError=""
                                                    onStartEdit={() => { }}
                                                    onSaveEdit={() => { }}
                                                    onCancelEdit={() => { }}
                                                    onValueChange={() => { }}
                                                    mode="live"
                                                    onCommit={(nextValue) => updateSelectedRowField("Msc", nextValue)}
                                                />

                                                <DualValueProperty
                                                    label="Motion"
                                                    value={selectedRow.Motion}
                                                    property="Motion"
                                                    editable
                                                    variant="compact"
                                                    editingProperty={null}
                                                    editValue=""
                                                    validationError=""
                                                    onStartEdit={() => { }}
                                                    onSaveEdit={() => { }}
                                                    onCancelEdit={() => { }}
                                                    onValueChange={() => { }}
                                                    mode="live"
                                                    onCommit={(nextValue) => updateSelectedRowField("Motion", nextValue)}
                                                />
                                            </div>
                                        </div>
                                    </ScrollArea>
                                </>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                                    Select a row to edit
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog
                open={deleteDialogOpen}
                onOpenChange={(open) => {
                    if (open) {
                        setDeleteDialogOpen(true);
                        return;
                    }
                    closeDeleteDialog();
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Row</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteCandidateRow ? (
                                <>
                                    Are you sure you want to delete Character ID {deleteCandidateRow.CharacterId} (index {deleteCandidateIndex})?
                                </>
                            ) : (
                                <>Are you sure you want to delete this row? This action cannot be undone.</>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={closeDeleteDialog}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={pasteDialogOpen}
                onOpenChange={(open) => {
                    if (open) {
                        setPasteDialogOpen(true);
                        return;
                    }
                    closePasteDialog();
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Overwrite fields</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2">
                                {pasteCandidate ? (
                                    <>
                                        <div className="text-sm text-muted-foreground">
                                            This will overwrite the selected row with values copied from Character ID {pasteCandidate.sourceCharacterId}.
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div className="text-muted-foreground">Model</div>
                                            <div>
                                                {selectedRow?.Model} → {pasteCandidate.fields.Model}
                                            </div>
                                            <div className="text-muted-foreground">Effect</div>
                                            <div>
                                                {selectedRow?.Effect} → {pasteCandidate.fields.Effect}
                                            </div>
                                            <div className="text-muted-foreground">Sound</div>
                                            <div>
                                                {selectedRow?.Sound} → {pasteCandidate.fields.Sound}
                                            </div>
                                            <div className="text-muted-foreground">Param</div>
                                            <div>
                                                {selectedRow?.Param} → {pasteCandidate.fields.Param}
                                            </div>
                                            <div className="text-muted-foreground">MSC</div>
                                            <div>
                                                {selectedRow?.Msc} → {pasteCandidate.fields.Msc}
                                            </div>
                                            <div className="text-muted-foreground">Motion</div>
                                            <div>
                                                {selectedRow?.Motion} → {pasteCandidate.fields.Motion}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-sm text-muted-foreground">
                                        Clipboard data is unavailable.
                                    </div>
                                )}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={closePasteDialog}>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmPaste} className="bg-blue-600 hover:bg-blue-700">
                            Overwrite
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
                        <DialogTitle>Import Character ID Table JSON</DialogTitle>
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
                        >
                            Import
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}


