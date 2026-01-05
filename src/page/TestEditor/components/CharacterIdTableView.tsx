import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { Buffer } from "buffer";
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
import { Save, RefreshCw, Plus, Trash2, Search } from "lucide-react";
import { CharacterIdTable, CharacterIdTableData, buildCharacterIdTableBuffer } from "@/models/characterIdTable";
import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DualValueProperty } from "@/components/ui/dual-value-property";

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

export default function CharacterIdTableView({ folderPath, isActive, onUnsavedChanges }: CharacterIdTableViewProps) {
    const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);
    const [searchTerm, setSearchTerm] = useState("");
    const [hasChanges, setHasChanges] = useState(false);
    const deferredSearchTerm = useDeferredValue(searchTerm);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteCandidateIndex, setDeleteCandidateIndex] = useState<number | null>(null);

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

    const load = useCallback(async () => {
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
            resetEditorState();
        } catch (error) {
            console.error("error", error);
            setLoadState({ status: "error", filePath, message: error instanceof Error ? error.message : "Unknown error" });
            resetEditorState();
        }
    }, [folderPath, resetEditorState, resolveFilePath]);

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

            const buffer = buildCharacterIdTableBuffer(loadState.table);
            await writeFile(filePath, buffer);
            toast.success("Saved characteridtable.bin");
            setHasChanges(false);
            onUnsavedChanges?.(false);
        } catch (error) {
            console.error(error);
            toast.error("Failed to save characteridtable.bin");
        }
    }, [loadState, onUnsavedChanges]);

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
                            <div className="text-xs text-muted-foreground break-all mt-1">
                                {loadState.filePath}
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
        </div>
    );
}


