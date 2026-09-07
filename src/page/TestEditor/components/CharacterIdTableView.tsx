import { type ReactNode, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { dirname } from "@tauri-apps/api/path";
import { Channel, invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { Buffer } from "buffer";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { AlertTriangle, CheckCircle2, CircleSlash, Info, Save, RefreshCw, Plus, Trash2, Search, Copy, Clipboard, Download, Upload, FolderOpen, PackageOpen, Bug, XCircle } from "lucide-react";
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
import { CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY, trimmedConfigPath, useConfigStore } from "@/store/configStore";
import { useResourceRegistry } from "@/hooks/useResourceRegistry";
import { AssetRefInfo, getAssetRefInfo } from "./character-id-table/assetRef";
import { CharacterAssetField } from "./character-id-table/CharacterAssetField";
import { filterCharacterIdTableRows } from "./character-id-table/characterIdTableSearch";
import { mergeResolvedAssetRefs } from "./character-id-table/mergeAssetRefs";
import { extractAsset } from "./character-id-table/extractFhm2d";
import { buildBulkMscExtractPlan } from "./character-id-table/bulkMscExtract";
import { clearFhm2dPackResolutionCache, resolveFhm2dPackPaths } from "@/services/testEditorWorkspace/paths";
import { resolveWorkspaceContent } from "@/services/testEditorWorkspace/contentCatalog";
import { promptAndMigrateWorkspaceContentIfNeeded } from "@/services/testEditorWorkspace/contentMigration";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { LegacyWorkspaceMoveNotice } from "./workspace-layout/LegacyWorkspaceMoveNotice";
import { CatalogPackToolbarButtons } from "./workspace-layout/CatalogPackToolbarButtons";
import { sanitizeFhm2dStructureName } from "@/utils/fhm2dStructureMetadata";
import { MscSourceBatchDecompileView } from "./character-id-table/MscSourceBatchDecompileView";
import { useTranslation } from "react-i18next";

interface CharacterIdTableViewProps {
    folderPath: string;
    isActive: boolean;
    onUnsavedChanges?: (hasChanges: boolean) => void;
    onRevealTreeFolder?: (path: string) => void;
    pendingSelectCharacterId?: number | null;
    onConsumePendingSelect?: () => void;
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
        table: CharacterIdTable;
    };

const CLIPBOARD_PREFIX = "CHARACTER_ID_TABLE_FIELDS_V1";
const REQUIRED_FIELD_KEYS = ["Model", "Effect", "Sound", "Param", "Msc", "Motion"] as const;
const CHARACTER_ID_IMPORT_MODAL_DIMENSIONS = {
    width: 720,
    height: 560,
    minWidth: 560,
    minHeight: 420,
};

const CHARACTER_ID_DEBUG_MODAL_DIMENSIONS = {
    width: 900,
    height: 680,
    minWidth: 720,
    minHeight: 520,
};

type ClipboardPayload = {
    version: 1;
    sourceCharacterId: number;
    fields: Pick<CharacterIdTableData, (typeof REQUIRED_FIELD_KEYS)[number]>;
};

type BulkMscExtractProgress = {
    current: number;
    total: number;
    successCount: number;
    sourceMissingCount: number;
    extractionFailureCount: number;
    namingWarningCount: number;
    skippedZeroRows: number;
    duplicateRows: number;
    currentLabel: string | null;
    lastOutputPath: string | null;
    missingSources: string[];
    extractionErrors: string[];
    namingWarnings: string[];
    completed: boolean;
};

type BulkMscBackendTask = {
    hashHex: string;
    packName: string;
    characterIds: number[];
};

type BulkMscBackendItemStatus = "extracted" | "source_missing" | "extract_error";

type BulkMscBackendItemResult = {
    hashHex: string;
    packName: string;
    characterIds: number[];
    sourcePath: string;
    outDir: string;
    status: BulkMscBackendItemStatus;
    namingError?: string | null;
    error?: string | null;
    elapsedMs: number;
};

type BulkMscBackendProgress = {
    current: number;
    total: number;
    item: BulkMscBackendItemResult;
};

type BulkMscBackendSummary = {
    total: number;
    successCount: number;
    sourceMissingCount: number;
    extractionFailureCount: number;
    namingWarningCount: number;
    elapsedMs: number;
    items: BulkMscBackendItemResult[];
};

type DebugMetricTone = "neutral" | "success" | "warning" | "danger" | "info";

const debugMetricToneClass: Record<DebugMetricTone, string> = {
    neutral: "border-border bg-muted/20 text-foreground",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    danger: "border-destructive/40 bg-destructive/10 text-destructive",
    info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

function DebugMetric({
    label,
    value,
    detail,
    tone = "neutral",
    icon,
}: {
    label: string;
    value: ReactNode;
    detail?: ReactNode;
    tone?: DebugMetricTone;
    icon?: ReactNode;
}) {
    return (
        <div className={cn("min-w-0 rounded-md border p-3", debugMetricToneClass[tone])}>
            <div className="flex items-center justify-between gap-2 text-xs font-medium">
                <span className="truncate">{label}</span>
                {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
            </div>
            <div className="mt-2 font-mono text-2xl leading-none text-foreground">{value}</div>
            {detail ? (
                <div className="mt-2 text-xs leading-snug text-muted-foreground">{detail}</div>
            ) : null}
        </div>
    );
}

function DebugPathRow({ label, value }: { label: string; value: string }) {
    const { t } = useTranslation("test-character-id-view");
    return (
        <div className="grid gap-1 border-t py-2 first:border-t-0 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="min-w-0 break-all font-mono text-xs">
                {value || <span className="font-sans text-muted-foreground">{t("notConfigured")}</span>}
            </div>
        </div>
    );
}

function DebugLogBlock({
    title,
    count,
    items,
    tone,
    emptyText,
}: {
    title: string;
    count: number;
    items: string[];
    tone: DebugMetricTone;
    emptyText: string;
}) {
    const visibleItems = items.slice(0, 30);
    const hiddenCount = items.length - visibleItems.length;
    return (
        <div className={cn("space-y-2 rounded-md border p-3", debugMetricToneClass[tone])}>
            <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-foreground">{title}</div>
                <div className="font-mono text-xs text-muted-foreground">{count}</div>
            </div>
            {items.length > 0 ? (
                <div className="max-h-40 overflow-auto whitespace-pre-wrap rounded border bg-background/70 p-2 font-mono text-xs text-foreground">
                    {visibleItems.join("\n")}
                    {hiddenCount > 0 ? `\n... and ${hiddenCount} more` : ""}
                </div>
            ) : (
                <div className="rounded border bg-background/70 p-2 text-xs text-muted-foreground">
                    {emptyText}
                </div>
            )}
        </div>
    );
}

function formatCharacterIdList(ids: readonly number[], limit = 6): string {
    const visible = ids.slice(0, limit).join(", ");
    const hidden = ids.length - Math.min(ids.length, limit);
    return hidden > 0 ? `${visible}, and ${hidden} more` : visible || "none";
}

function formatBackendMissingSource(item: BulkMscBackendItemResult): string {
    return [
        `${item.packName} (${item.hashHex})`,
        `  Character ID(s): ${formatCharacterIdList(item.characterIds)}`,
        `  No source file: ${item.sourcePath || "source path not configured"}`,
    ].join("\n");
}

function formatBackendExtractionError(item: BulkMscBackendItemResult): string {
    return [
        `${item.packName} (${item.hashHex})`,
        `  Character ID(s): ${formatCharacterIdList(item.characterIds)}`,
        `  Extract error: ${item.error ?? "Extraction failed"}`,
    ].join("\n");
}

function formatBackendNamingWarning(item: BulkMscBackendItemResult): string {
    return [
        `${item.packName} (${item.hashHex})`,
        `  Character ID(s): ${formatCharacterIdList(item.characterIds)}`,
        `  Naming warning: ${item.namingError ?? "Unknown naming warning"}`,
    ].join("\n");
}

function buildProgressFromBackendSummary(
    summary: BulkMscBackendSummary,
    plan: ReturnType<typeof buildBulkMscExtractPlan>,
): BulkMscExtractProgress {
    const lastExtracted = [...summary.items].reverse().find((item) => item.status === "extracted");
    return {
        current: summary.total,
        total: summary.total,
        successCount: summary.successCount,
        sourceMissingCount: summary.sourceMissingCount,
        extractionFailureCount: summary.extractionFailureCount,
        namingWarningCount: summary.namingWarningCount,
        skippedZeroRows: plan.skippedZeroRows,
        duplicateRows: plan.duplicateRows,
        currentLabel: null,
        lastOutputPath: lastExtracted?.outDir ?? null,
        missingSources: summary.items
            .filter((item) => item.status === "source_missing")
            .map(formatBackendMissingSource),
        extractionErrors: summary.items
            .filter((item) => item.status === "extract_error")
            .map(formatBackendExtractionError),
        namingWarnings: summary.items
            .filter((item) => item.namingError)
            .map(formatBackendNamingWarning),
        completed: true,
    };
}

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

export default function CharacterIdTableView({
    folderPath,
    isActive,
    onUnsavedChanges,
    onRevealTreeFolder,
    pendingSelectCharacterId,
    onConsumePendingSelect,
    workspaceDocument,
}: CharacterIdTableViewProps) {
    const { t } = useTranslation("test-character-id-view");
    const pendingFromParentRef = useRef<number | null>(null);
    pendingFromParentRef.current = pendingSelectCharacterId ?? null;

    const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
    const [selectedIndex, setSelectedIndex] = useState<number>(-1);
    const [searchTerm, setSearchTerm] = useState("");
    const [hasChanges, setHasChanges] = useState(false);
    const deferredSearchTerm = useDeferredValue(searchTerm);

    const setSetting = useConfigStore((s) => s.setSetting);
    const obDplCachePath = useConfigStore((s) => trimmedConfigPath(s.obDplCachePath));
    const obModPath = useConfigStore((s) => trimmedConfigPath(s.obModPath));
    const extractOutputPath = useConfigStore((s) => trimmedConfigPath(s.extractOutputPath));
    const debugMscOutputPath = useConfigStore((s) => trimmedConfigPath(s.characterIdDebugMscOutputPath));
    const resourceRegistry = useResourceRegistry(folderPath || null);
    const [isExtractingAll, setIsExtractingAll] = useState(false);

    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importPreview, setImportPreview] = useState<CharacterIdTableImportPreview | null>(null);
    const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
    const [isDebugDialogOpen, setIsDebugDialogOpen] = useState(false);
    const [isBatchDecompilingMscSource, setIsBatchDecompilingMscSource] = useState(false);
    const [isExtractingAllMsc, setIsExtractingAllMsc] = useState(false);
    const [bulkMscProgress, setBulkMscProgress] = useState<BulkMscExtractProgress | null>(null);
    const [isExtractConfirmOpen, setIsExtractConfirmOpen] = useState(false);

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteCandidateIndex, setDeleteCandidateIndex] = useState<number | null>(null);
    const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
    const [pasteCandidate, setPasteCandidate] = useState<ClipboardPayload | null>(null);
    const [clipboardPayload, setClipboardPayload] = useState<ClipboardPayload | null>(null);

    const catalogPackLabels = useMemo(
        () => ({
            initPack: t("initPack"),
            initializing: t("initializing"),
            renameZeroBin: t("renameZeroBin"),
            renaming: t("renaming"),
            setObDplcacheInit: t("setObDplcacheInit"),
            unpacked: t("unpacked"),
            alreadyNamed: t("alreadyNamed"),
            formatRenamed: (names: string) => t("renamedFiles", { names }),
        }),
        [t],
    );

    const lastLoadedKeyRef = useRef<string>("");
    const pendingScrollCharacterIdRef = useRef<number | null>(null);
    const listParentRef = useRef<HTMLDivElement | null>(null);
    const getListScrollElement = useCallback(() => listParentRef.current, []);
    const estimateRowSize = useCallback(() => 52, []);

    const resetEditorState = useCallback(() => {
        setSelectedIndex(-1);
        setSearchTerm("");
        setHasChanges(false);
        onUnsavedChanges?.(false);
    }, [onUnsavedChanges]);

    const resolveTableContent = useCallback(async () => {
        return await promptAndMigrateWorkspaceContentIfNeeded(
            await resolveWorkspaceContent(
                folderPath,
                workspaceDocument,
                "character-id-table",
            ),
        );
    }, [folderPath, workspaceDocument]);

    const load = useCallback(async (options?: { preserveSelectionId?: number | null }) => {
        if (!folderPath) {
            setLoadState({ status: "error", filePath: "", message: "Folder path is empty" });
            resetEditorState();
            return;
        }

        const content = await resolveTableContent();
        const filePath = content.existing?.filePath ?? content.configured.filePath;
        if (!filePath || !content.configured.filePath) {
            setLoadState({
                status: "error",
                filePath: content.configured.folderPath,
                message: "Character ID table content path is not configured",
            });
            resetEditorState();
            return;
        }
        setLoadState({ status: "loading" });
        try {
            console.log("filePath", filePath);
            const fileData = await readFile(filePath);
            const table = new CharacterIdTable(Buffer.from(fileData));
            console.log("table", table);
            setLoadState({
                status: "ready",
                filePath,
                configuredFilePath: content.configured.filePath,
                sourceLayout: content.sourceLayout,
                writable: content.writable,
                table,
            });
            if (options?.preserveSelectionId !== undefined && options?.preserveSelectionId !== null) {
                const nextIndex = table.CharacterData.findIndex((row) => row.CharacterId === options.preserveSelectionId);
                setSelectedIndex(nextIndex);
                setHasChanges(false);
                onUnsavedChanges?.(false);
            } else {
                const pendingId = pendingFromParentRef.current;
                if (pendingId != null) {
                    setHasChanges(false);
                    onUnsavedChanges?.(false);
                } else {
                    resetEditorState();
                }
            }
        } catch (error) {
            console.error("error", error);
            setLoadState({ status: "error", filePath, message: error instanceof Error ? error.message : "Unknown error" });
            resetEditorState();
        }
    }, [folderPath, onUnsavedChanges, resetEditorState, resolveTableContent]);

    useEffect(() => {
        if (!isActive) return;
        const listRoute = workspaceDocument.assetRoutes["list.character"];
        const key = `${folderPath}::characteridtable::${workspaceDocument.legacyReadFallback}::${listRoute?.prefix ?? ""}`;
        if (key === lastLoadedKeyRef.current) return;
        lastLoadedKeyRef.current = key;
        void load();
    }, [folderPath, isActive, load, workspaceDocument]);

    const tableData = useMemo(() => {
        if (loadState.status !== "ready") return [];
        return loadState.table.CharacterData;
    }, [loadState]);

    const bulkMscPlan = useMemo(() => buildBulkMscExtractPlan(tableData), [tableData]);

    const filteredRows = useMemo(() => {
        return filterCharacterIdTableRows(tableData, deferredSearchTerm);
    }, [deferredSearchTerm, tableData]);

    const selectedRow = useMemo(() => {
        if (selectedIndex < 0) return null;
        return tableData[selectedIndex] ?? null;
    }, [selectedIndex, tableData]);

    const [resolvedAssetRefs, setResolvedAssetRefs] = useState<Record<string, AssetRefInfo>>({});

    // Build expected paths only when a row is selected. Do not probe OB/MOD/WS existence here —
    // CharacterAssetField probes lazily when the detail field is mounted (viewing that item).
    const selectedAssetFingerprint = useMemo(() => {
        if (!selectedRow) return null;
        return REQUIRED_FIELD_KEYS.map((key) => `${key}:${(selectedRow as any)[key] ?? 0}`).join("|");
    }, [selectedRow]);

    // Resolve path-only asset refs when asset *hashes* change (fingerprint), not on every
    // selectedRow identity change (live DualValueProperty commits rewrite the row object
    // each keystroke — including Character ID edits that do not touch Model/Effect/...).
    useEffect(() => {
        if (!selectedAssetFingerprint) {
            setResolvedAssetRefs({});
            return;
        }

        // Parse values from fingerprint so we do not depend on selectedRow identity.
        const values = new Map<string, number>();
        for (const part of selectedAssetFingerprint.split("|")) {
            const sep = part.indexOf(":");
            if (sep < 0) continue;
            values.set(part.slice(0, sep), Number(part.slice(sep + 1)) | 0);
        }

        let cancelled = false;

        const resolve = async () => {
            const entries = await Promise.all(
                REQUIRED_FIELD_KEYS.map(async (key) => {
                    const val = values.get(key) ?? 0;
                    const ref = await getAssetRefInfo({
                        fieldKey: key,
                        value: val,
                        obDplCachePath,
                        obModPath,
                        workspaceRoot: folderPath,
                        workspaceDocument,
                        probeExistence: false,
                    });
                    return [key, ref] as const;
                }),
            );
            if (cancelled) return;
            const next: Record<string, AssetRefInfo> = {};
            for (const [key, ref] of entries) {
                next[key] = ref;
            }
            // Preserve already-probed fields whose hash did not change so sibling
            // asset rows do not flash loading when one field is edited live.
            setResolvedAssetRefs((prev) => mergeResolvedAssetRefs(prev, next));
        };
        void resolve();
        return () => {
            cancelled = true;
        };
    }, [selectedAssetFingerprint, obDplCachePath, obModPath, folderPath, workspaceDocument]);

    const handleExtractAll = useCallback(async () => {
        if (!selectedRow || isExtractingAll) return;
        // Default: extract into EXVS2 Workspace (WS), not Extract Output Path.
        const workspaceRoot = folderPath.trim();
        if (!workspaceRoot) {
            toast.error("Workspace path not configured");
            return;
        }
        setIsExtractingAll(true);

        const results = [];
        try {
            for (const key of REQUIRED_FIELD_KEYS) {
                const pathOnly = resolvedAssetRefs[key];
                if (!pathOnly || pathOnly.rawValue === 0) continue;
                // Re-probe so source path case and workspace layout are accurate before extract.
                const asset = await getAssetRefInfo({
                    fieldKey: pathOnly.fieldKey,
                    value: pathOnly.rawValue,
                    obDplCachePath,
                    obModPath,
                    workspaceRoot,
                    workspaceDocument,
                    probeExistence: true,
                });
                const target = await resolveFhm2dPackPaths(
                    workspaceRoot,
                    workspaceDocument,
                    asset.routeId,
                    asset.hashHex,
                    sanitizeFhm2dStructureName(`${asset.fieldKey}_${asset.hashHex.replace(/^0x/i, "")}`),
                );
                results.push(await extractAsset(asset, target));
            }
        } finally {
            setIsExtractingAll(false);
        }

        const successCount = results.filter(r => r.success).length;
        const namingWarnings = results.filter((r) => r.success && r.namingWarning);
        if (successCount > 0) {
            if (namingWarnings.length > 0) {
                toast.error(`Extracted ${successCount} asset(s); ${namingWarnings.length} FHM naming step failed`, {
                    description: namingWarnings.map((r) => r.namingWarning).join("\n---\n"),
                    duration: 25_000,
                });
            } else {
                toast.success(`Successfully extracted ${successCount} assets to workspace`);
            }
        }
    }, [selectedRow, isExtractingAll, resolvedAssetRefs, folderPath, workspaceDocument, obDplCachePath, obModPath]);

    const handleExtractAllMsc = useCallback(async () => {
        if (isExtractingAllMsc) return;
        const outputRoot = debugMscOutputPath.trim();
        const sourceRoot = obDplCachePath.trim();
        if (!outputRoot) {
            toast.error("Debug MSC output path not configured");
            return;
        }
        if (!sourceRoot) {
            toast.error("OB dplcache path not configured");
            return;
        }
        if (bulkMscPlan.candidates.length === 0) {
            toast.error("No non-zero MSC entries found");
            return;
        }

        const routePrefix = workspaceDocument.assetRoutes["unit.msc"]?.prefix ?? "040msc";
        const tasks: BulkMscBackendTask[] = bulkMscPlan.candidates.map((candidate) => ({
            hashHex: candidate.hashHex,
            packName: candidate.packName,
            characterIds: candidate.characterIds,
        }));

        setIsExtractingAllMsc(true);
        let successCount = 0;
        let sourceMissingCount = 0;
        let extractionFailureCount = 0;
        let current = 0;
        let currentLabel: string | null = null;
        const missingSources: string[] = [];
        const extractionErrors: string[] = [];
        const namingWarnings: string[] = [];
        let lastOutputPath: string | null = null;
        let acceptingProgress = true;
        let lastProgressCommitMs = 0;

        const makeProgress = (next: Partial<BulkMscExtractProgress> = {}): BulkMscExtractProgress => ({
            current,
            total: tasks.length,
            successCount,
            sourceMissingCount,
            extractionFailureCount,
            namingWarningCount: namingWarnings.length,
            skippedZeroRows: bulkMscPlan.skippedZeroRows,
            duplicateRows: bulkMscPlan.duplicateRows,
            currentLabel,
            lastOutputPath,
            missingSources: [...missingSources],
            extractionErrors: [...extractionErrors],
            namingWarnings: [...namingWarnings],
            completed: false,
            ...next,
        });

        setBulkMscProgress(makeProgress({
            current: 0,
            total: tasks.length,
            successCount: 0,
            sourceMissingCount: 0,
            extractionFailureCount: 0,
            namingWarningCount: 0,
            currentLabel: null,
            missingSources: [],
            extractionErrors: [],
            namingWarnings: [],
            completed: false,
        }));

        const publishProgress = (force = false) => {
            const now = Date.now();
            if (!force && current < tasks.length && now - lastProgressCommitMs < 100) {
                return;
            }
            lastProgressCommitMs = now;
            setBulkMscProgress(makeProgress());
        };

        const progressChannel = new Channel<BulkMscBackendProgress>();
        progressChannel.onmessage = (progress) => {
            if (!acceptingProgress) return;
            const item = progress.item;
            current = progress.current;
            currentLabel = `${item.packName} (${item.hashHex})`;

            if (item.status === "extracted") {
                successCount += 1;
                lastOutputPath = item.outDir;
                if (item.namingError) {
                    namingWarnings.push(formatBackendNamingWarning(item));
                }
            } else if (item.status === "source_missing") {
                sourceMissingCount += 1;
                missingSources.push(formatBackendMissingSource(item));
            } else {
                extractionFailureCount += 1;
                extractionErrors.push(formatBackendExtractionError(item));
            }

            publishProgress(current >= tasks.length);
        };

        try {
            const summary = await invoke<BulkMscBackendSummary>("bulk_extract_msc_fhm2d_to_folder", {
                sourceRoot,
                outputRoot,
                routePrefix,
                tasks,
                concurrency: 4,
                onProgress: progressChannel,
            });
            acceptingProgress = false;
            const finalProgress = buildProgressFromBackendSummary(summary, bulkMscPlan);
            setBulkMscProgress(finalProgress);
            if (summary.successCount > 0) {
                clearFhm2dPackResolutionCache();
            }

            if (summary.extractionFailureCount > 0) {
                toast.error(`Extracted ${summary.successCount} MSC package(s); ${summary.sourceMissingCount} no source file; ${summary.extractionFailureCount} extract error(s)`, {
                    description: finalProgress.extractionErrors.slice(0, 3).join("\n"),
                    duration: 25_000,
                });
                return;
            }
            if (summary.sourceMissingCount > 0) {
                toast.warning(`Extracted ${summary.successCount} MSC package(s); ${summary.sourceMissingCount} source file(s) not found`, {
                    description: finalProgress.missingSources.slice(0, 3).join("\n"),
                    duration: 25_000,
                });
                return;
            }
            if (summary.namingWarningCount > 0) {
                toast.warning(`Extracted ${summary.successCount} MSC package(s); ${summary.namingWarningCount} naming warning(s)`, {
                    description: finalProgress.namingWarnings.slice(0, 5).join("\n"),
                    duration: 25_000,
                });
                return;
            }
            toast.success(`Extracted ${summary.successCount} MSC package(s)`);
        } catch (error) {
            acceptingProgress = false;
            extractionFailureCount += 1;
            extractionErrors.push(error instanceof Error ? error.message : String(error));
            setBulkMscProgress(makeProgress({
                currentLabel: null,
                extractionFailureCount,
                extractionErrors: [...extractionErrors],
                completed: true,
            }));
            toast.error("Bulk MSC extract failed", {
                description: extractionErrors[0],
                duration: 25_000,
            });
        } finally {
            setIsExtractingAllMsc(false);
        }
    }, [
        bulkMscPlan,
        debugMscOutputPath,
        isExtractingAllMsc,
        obDplCachePath,
        workspaceDocument,
    ]);

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

    useLayoutEffect(() => {
        if (!isActive) return;
        if (loadState.status !== "ready") return;
        if (pendingSelectCharacterId == null) return;
        const idx = loadState.table.CharacterData.findIndex((r) => r.CharacterId === pendingSelectCharacterId);
        if (idx < 0) {
            onConsumePendingSelect?.();
            return;
        }
        pendingScrollCharacterIdRef.current = pendingSelectCharacterId;
        setSearchTerm("");
        setSelectedIndex(idx);
        onConsumePendingSelect?.();
    }, [isActive, loadState, pendingSelectCharacterId, onConsumePendingSelect]);

    useLayoutEffect(() => {
        const charId = pendingScrollCharacterIdRef.current;
        if (charId == null) return;
        const idx = tableData.findIndex((r) => r.CharacterId === charId);
        if (idx < 0) {
            pendingScrollCharacterIdRef.current = null;
            return;
        }
        const virtIndex = filteredRows.findIndex((f) => f.idx === idx);
        if (virtIndex < 0) return;
        rowVirtualizer.scrollToIndex(virtIndex, { align: "center" });
        pendingScrollCharacterIdRef.current = null;
    }, [deferredSearchTerm, filteredRows, rowVirtualizer, selectedIndex, tableData]);

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
        if (loadState.status !== "ready" || !loadState.writable) return;
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
    }, [loadState, onUnsavedChanges, selectedIndex, updateTable]);

    const handleAssetFieldUpdate = useCallback((fieldKey: string, newValue: number) => {
        updateSelectedRowField(fieldKey as keyof CharacterIdTableData, newValue);
    }, [updateSelectedRowField]);

    const updateSelectedRowFields = useCallback((fields: ClipboardPayload["fields"]) => {
        if (loadState.status !== "ready" || !loadState.writable) return;
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
    }, [loadState, onUnsavedChanges, selectedIndex, updateTable]);

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

            setHasChanges(true);
            onUnsavedChanges?.(true);

            if (selectedIndex === index) {
                setSelectedIndex(-1);
            } else if (selectedIndex > index) {
                setSelectedIndex((v) => v - 1);
            }
        },
        [loadState, onUnsavedChanges, selectedIndex, updateTable]
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
        if (loadState.status !== "ready" || !loadState.writable) return;
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
    }, [loadState, onUnsavedChanges, tableData.length, updateTable]);

    const handleCopy = useCallback((index: number) => {
        if (loadState.status !== "ready" || !loadState.writable) return;
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
    }, [loadState, onUnsavedChanges, tableData.length, updateTable]);

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
        if (loadState.status !== "ready" || !loadState.writable) return;
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
        if (loadState.status !== "ready" || !loadState.writable) return;
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

    const bulkMscProgressPercent = bulkMscProgress && bulkMscProgress.total > 0
        ? Math.round((bulkMscProgress.current / bulkMscProgress.total) * 100)
        : 0;
    const bulkMscHandledCount = bulkMscProgress
        ? bulkMscProgress.successCount + bulkMscProgress.sourceMissingCount + bulkMscProgress.extractionFailureCount
        : 0;
    const bulkMscReadyToRun = Boolean(
        obDplCachePath.trim() &&
        debugMscOutputPath.trim() &&
        bulkMscPlan.candidates.length > 0,
    );
    const bulkMscOutputRoute = debugMscOutputPath.trim()
        ? `${debugMscOutputPath.trim().replace(/[\\/]+$/, "")}\\${workspaceDocument.assetRoutes["unit.msc"]?.prefix ?? "040msc"}`
        : "";
    const debugRunStatus = !bulkMscProgress
        ? t("debugNotRunYet")
        : bulkMscProgress.completed
            ? t("debugCompleted")
            : t("debugRunning");

    if (!isActive) {
        return <div className="h-full w-full" />;
    }

    if (loadState.status === "loading") {
        return (
            <div className="h-full w-full">
                <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
                    <CardHeader className="p-0 pb-4">
                        <CardTitle>{t("title")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 p-0">
                        <div className="text-sm text-muted-foreground">
                            {t("loadingTable")}
                        </div>
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
                        <CardTitle>{t("title")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 p-0">
                        <div className="text-sm text-muted-foreground">
                            {loadState.filePath ? (
                                <>
                                    <div className="font-medium text-foreground">{t("file")}</div>
                                    <div className="break-all">{loadState.filePath}</div>
                                </>
                            ) : (
                                <div className="break-all">{t("folderPathEmpty")}</div>
                            )}
                        </div>
                        <div className="text-sm text-destructive">{loadState.message}</div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Button size="sm" onClick={() => void load()} className="inline-flex items-center gap-2">
                                <RefreshCw className="w-4 h-4" />
                                Reload
                            </Button>
                            <CatalogPackToolbarButtons
                                contentId="character-id-table"
                                folderPath={folderPath}
                                workspaceDocument={workspaceDocument}
                                dplCachePath={obDplCachePath}
                                reload={load}
                                labels={catalogPackLabels}
                            />
                        </div>
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
            <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
                <CardHeader className="p-0 pb-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <CardTitle>{t("title")}</CardTitle>
                            <div className="text-xs text-muted-foreground break-all mt-1 flex items-center gap-1">
                                {loadState.filePath}
                                <button
                                    type="button"
                                    onClick={() => void handleOpenCharacterIdTableFolder()}
                                    className="shrink-0 p-0.5 rounded hover:bg-accent hover:text-accent-foreground"
                                    title={t("openFolder")}
                                    aria-label={t("openFolder")}
                                >
                                    <FolderOpen className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                                Loaded: {loadState.table.CharacterCount} rows
                            </div>
                            <LegacyWorkspaceMoveNotice
                                workspaceRoot={folderPath}
                                workspaceDocument={workspaceDocument}
                                contentId="character-id-table"
                                sourceLayout={loadState.sourceLayout}
                                configuredPath={loadState.configuredFilePath}
                                onMoved={() =>
                                    load({ preserveSelectionId: selectedRow?.CharacterId ?? null })
                                }
                                className="mt-2"
                            />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => void load()} className="inline-flex items-center gap-2">
                                <RefreshCw className="w-4 h-4" />
                                Reload
                            </Button>
                            <CatalogPackToolbarButtons
                                contentId="character-id-table"
                                folderPath={folderPath}
                                workspaceDocument={workspaceDocument}
                                dplCachePath={obDplCachePath}
                                reload={load}
                                labels={catalogPackLabels}
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handlePickImportJson()}
                                disabled={!loadState.writable || isImporting || isExporting}
                                className="inline-flex items-center gap-2"
                                title={t("importTableTooltip")}
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
                                title={t("exportTableTooltip")}
                            >
                                <Download className="w-4 h-4" />
                                Export JSON
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setIsDebugDialogOpen(true)}
                                disabled={loadState.table.CharacterData.length === 0}
                                className="inline-flex items-center gap-2"
                                title={t("openDebugTooltip")}
                            >
                                <Bug className="w-4 h-4" />
                                Debug
                            </Button>
                            <Button size="sm" onClick={() => void handleSaveFile()} disabled={!loadState.writable || !hasChanges} className="inline-flex items-center gap-2">
                                <Save className="w-4 h-4" />
                                Save File
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="flex-1 min-h-0 p-0">
                    <div className="flex h-full gap-4">
                        <div className="w-1/3 border rounded-lg p-3 overflow-hidden flex flex-col min-h-0">
                            <div className="flex items-center justify-between mb-3">
                                <div className="font-semibold text-sm">Rows ({tableData.length})</div>
                                <Button size="sm" onClick={handleAdd} disabled={!loadState.writable} className="inline-flex items-center gap-2">
                                    <Plus className="w-4 h-4" />
                                    Add
                                </Button>
                            </div>

                            <div className="relative mb-3">
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
                                                        idx === selectedIndex && "ring-2 ring-inset ring-primary bg-accent"
                                                    )}
                                                    onClick={() => handleSelect(idx)}
                                                >
                                                    <div className="text-sm font-medium truncate">ID: {row.CharacterId}</div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-primary hover:text-primary hover:bg-primary/10"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleCopy(idx);
                                                            }}
                                                            disabled={!loadState.writable}
                                                            title={t("copyAsNew")}
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
                                                            disabled={!loadState.writable}
                                                            title={t("delete")}
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
                                        {deferredSearchTerm.trim()
                                            ? `No rows found matching "${deferredSearchTerm.trim()}"`
                                            : t("noRowsFound")}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 border rounded-lg p-4 overflow-hidden flex flex-col min-h-0">
                            {selectedRow ? (
                                <>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="text-sm font-semibold">{t("editRow", { index: selectedIndex })}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {t("editableValues")}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 mb-4">
                                        <Button size="sm" variant="outline" onClick={() => void handleCopyFields()}>
                                            <Copy className="w-4 h-4 mr-2" />
                                            {t("copyFields")}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => void handlePasteRequest()}
                                            disabled={!loadState.writable || !clipboardPayload || clipboardPayload.sourceCharacterId === selectedRow.CharacterId}
                                        >
                                            <Clipboard className="w-4 h-4 mr-2" />
                                            {t("pasteFields")}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => setIsExtractConfirmOpen(true)}
                                            disabled={isExtractingAll || !obDplCachePath || !folderPath.trim()}
                                            title={t("extractAllAssetsTooltip")}
                                        >
                                            <PackageOpen className="w-4 h-4 mr-2" />
                                            {isExtractingAll ? t("extracting") : t("extractAllToWorkspace")}
                                        </Button>
                                    </div>

                                    <ScrollArea className="flex-1 min-h-0">
                                        <div className="space-y-2 pr-2">
                                            <DualValueProperty
                                                label={t("characterId")}
                                                value={selectedRow.CharacterId}
                                                property="CharacterId"
                                                editable={loadState.writable}
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
                                                    label={t("model")}
                                                    value={selectedRow.Model}
                                                    property="Model"
                                                    editable={loadState.writable}
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
                                                    labelExtra={resolvedAssetRefs["Model"] && (
                                                        <CharacterAssetField 
                                                            asset={resolvedAssetRefs["Model"]} 
                                                            projectRootDir={folderPath}
                                                            extractOutputPath={extractOutputPath}
                                                            obDplCachePath={obDplCachePath}
                                                            obModPath={obModPath}
                                                            workspaceDocument={workspaceDocument}
                                                            resourceRegistry={resourceRegistry}
                                                            onReveal={onRevealTreeFolder}
                                                            onFieldUpdate={handleAssetFieldUpdate}
                                                        />
                                                    )}
                                                />

                                                <DualValueProperty
                                                    label={t("effect")}
                                                    value={selectedRow.Effect}
                                                    property="Effect"
                                                    editable={loadState.writable}
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
                                                    labelExtra={resolvedAssetRefs["Effect"] && (
                                                        <CharacterAssetField 
                                                            asset={resolvedAssetRefs["Effect"]} 
                                                            projectRootDir={folderPath}
                                                            extractOutputPath={extractOutputPath}
                                                            obDplCachePath={obDplCachePath}
                                                            obModPath={obModPath}
                                                            workspaceDocument={workspaceDocument}
                                                            resourceRegistry={resourceRegistry}
                                                            onReveal={onRevealTreeFolder}
                                                            onFieldUpdate={handleAssetFieldUpdate}
                                                        />
                                                    )}
                                                />

                                                <DualValueProperty
                                                    label={t("sound")}
                                                    value={selectedRow.Sound}
                                                    property="Sound"
                                                    editable={loadState.writable}
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
                                                    labelExtra={resolvedAssetRefs["Sound"] && (
                                                        <CharacterAssetField 
                                                            asset={resolvedAssetRefs["Sound"]} 
                                                            projectRootDir={folderPath}
                                                            extractOutputPath={extractOutputPath}
                                                            obDplCachePath={obDplCachePath}
                                                            obModPath={obModPath}
                                                            workspaceDocument={workspaceDocument}
                                                            resourceRegistry={resourceRegistry}
                                                            onReveal={onRevealTreeFolder}
                                                            onFieldUpdate={handleAssetFieldUpdate}
                                                        />
                                                    )}
                                                />

                                                <DualValueProperty
                                                    label={t("param")}
                                                    value={selectedRow.Param}
                                                    property="Param"
                                                    editable={loadState.writable}
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
                                                    labelExtra={resolvedAssetRefs["Param"] && (
                                                        <CharacterAssetField 
                                                            asset={resolvedAssetRefs["Param"]} 
                                                            projectRootDir={folderPath}
                                                            extractOutputPath={extractOutputPath}
                                                            obDplCachePath={obDplCachePath}
                                                            obModPath={obModPath}
                                                            workspaceDocument={workspaceDocument}
                                                            resourceRegistry={resourceRegistry}
                                                            onReveal={onRevealTreeFolder}
                                                            onFieldUpdate={handleAssetFieldUpdate}
                                                        />
                                                    )}
                                                />

                                                <DualValueProperty
                                                    label={t("msc")}
                                                    value={selectedRow.Msc}
                                                    property="Msc"
                                                    editable={loadState.writable}
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
                                                    labelExtra={resolvedAssetRefs["Msc"] && (
                                                        <CharacterAssetField 
                                                            asset={resolvedAssetRefs["Msc"]} 
                                                            projectRootDir={folderPath}
                                                            extractOutputPath={extractOutputPath}
                                                            obDplCachePath={obDplCachePath}
                                                            obModPath={obModPath}
                                                            workspaceDocument={workspaceDocument}
                                                            resourceRegistry={resourceRegistry}
                                                            onReveal={onRevealTreeFolder}
                                                            onFieldUpdate={handleAssetFieldUpdate}
                                                        />
                                                    )}
                                                />

                                                <DualValueProperty
                                                    label={t("motion")}
                                                    value={selectedRow.Motion}
                                                    property="Motion"
                                                    editable={loadState.writable}
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
                                                    labelExtra={resolvedAssetRefs["Motion"] && (
                                                        <CharacterAssetField 
                                                            asset={resolvedAssetRefs["Motion"]} 
                                                            projectRootDir={folderPath}
                                                            extractOutputPath={extractOutputPath}
                                                            obDplCachePath={obDplCachePath}
                                                            obModPath={obModPath}
                                                            workspaceDocument={workspaceDocument}
                                                            resourceRegistry={resourceRegistry}
                                                            onReveal={onRevealTreeFolder}
                                                            onFieldUpdate={handleAssetFieldUpdate}
                                                        />
                                                    )}
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
                open={isExtractConfirmOpen}
                onOpenChange={setIsExtractConfirmOpen}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("extractAllToWorkspace")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Extract all non-zero assets for Character ID {selectedRow?.CharacterId} into the
                            EXVS2 Workspace
                            {folderPath.trim() ? (
                                <>
                                    {" "}
                                    (<span className="font-mono text-xs break-all">{folderPath}</span>)
                                </>
                            ) : null}
                            . Config Extract Output Path is not used.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={() => {
                                setIsExtractConfirmOpen(false);
                                void handleExtractAll();
                            }}
                            className="bg-black hover:bg-black/90 text-white"
                        >
                            Extract to Workspace
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
                        <AlertDialogTitle>{t("deleteRow")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {deleteCandidateRow ? (
                                <>
                                    Are you sure you want to delete Character ID {deleteCandidateRow.CharacterId} (index {deleteCandidateIndex})?
                                </>
                            ) : (
                                <>{t("deleteConfirm")}</>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={closeDeleteDialog}>{t("cancel")}</AlertDialogCancel>
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
                        <AlertDialogTitle>{t("overwriteFields")}</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2">
                                {pasteCandidate ? (
                                    <>
                                        <div className="text-sm text-muted-foreground">
                                            This will overwrite the selected row with values copied from Character ID {pasteCandidate.sourceCharacterId}.
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div className="text-muted-foreground">{t("model")}</div>
                                            <div>
                                                {selectedRow?.Model} → {pasteCandidate.fields.Model}
                                            </div>
                                            <div className="text-muted-foreground">{t("effect")}</div>
                                            <div>
                                                {selectedRow?.Effect} → {pasteCandidate.fields.Effect}
                                            </div>
                                            <div className="text-muted-foreground">{t("sound")}</div>
                                            <div>
                                                {selectedRow?.Sound} → {pasteCandidate.fields.Sound}
                                            </div>
                                            <div className="text-muted-foreground">{t("param")}</div>
                                            <div>
                                                {selectedRow?.Param} → {pasteCandidate.fields.Param}
                                            </div>
                                            <div className="text-muted-foreground">{t("msc")}</div>
                                            <div>
                                                {selectedRow?.Msc} → {pasteCandidate.fields.Msc}
                                            </div>
                                            <div className="text-muted-foreground">{t("motion")}</div>
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
                        <AlertDialogCancel onClick={closePasteDialog}>{t("cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmPaste} className="bg-blue-600 hover:bg-blue-700">
                            Overwrite
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {isImportDialogOpen ? (
                <AppRndModalShell
                    titleId="character-id-import-title"
                    title={t("importTableTitle")}
                    subtitle={importPreview ? t("validCounts", { valid: importPreview.validCount, total: importPreview.totalCount }) : t("noFileSelected")}
                    headerIcon={<Upload className="h-5 w-5 text-primary" />}
                    dimensions={CHARACTER_ID_IMPORT_MODAL_DIMENSIONS}
                    storageKey="app.rnd-size.character-id-import"
                    onClose={() => {
                        setIsImportDialogOpen(false);
                        setImportPreview(null);
                    }}
                    closeDisabled={isImporting}
                    footer={
                        <div className="flex justify-end gap-2 bg-background px-6 py-4">
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
                        </div>
                    }
                >
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
                        {importPreview ? (
                            <>
                                <div className="space-y-1 text-sm text-muted-foreground">
                                    <div className="break-all">File: {importPreview.filePath}</div>
                                    <div>
                                        Total: {importPreview.totalCount} | Valid: {importPreview.validCount} | Invalid: {importPreview.invalidCount}
                                        {importPreview.duplicateIds.length > 0 ? ` | Duplicates: ${importPreview.duplicateIds.length}` : ""}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="text-sm font-medium">IDs to import ({importPreview.ids.length})</div>
                                    <div className="max-h-56 overflow-auto rounded-md border p-2 font-mono text-xs whitespace-pre-wrap">
                                        {importPreview.ids.slice(0, 500).join(", ")}
                                        {importPreview.ids.length > 500 ? `\n... and ${importPreview.ids.length - 500} more` : ""}
                                    </div>
                                    {importPreview.duplicateIds.length > 0 ? (
                                        <div className="text-xs text-muted-foreground">
                                            Duplicate IDs detected (will be imported as-is): {importPreview.duplicateIds.slice(0, 100).join(", ")}
                                            {importPreview.duplicateIds.length > 100 ? ` ... and ${importPreview.duplicateIds.length - 100} more` : ""}
                                        </div>
                                    ) : null}
                                </div>
                            </>
                        ) : (
                            <div className="text-sm text-muted-foreground">{t("noFileSelected")}</div>
                        )}
                    </div>
                </AppRndModalShell>
            ) : null}

            {isDebugDialogOpen ? (
                <AppRndModalShell
                    titleId="character-id-debug-title"
                    title={t("mscSourceDebug")}
                    subtitle={t("scanSubtitle", { count: bulkMscPlan.candidates.length })}
                    headerIcon={<Bug className="h-5 w-5 text-primary" />}
                    dimensions={CHARACTER_ID_DEBUG_MODAL_DIMENSIONS}
                    storageKey="app.rnd-size.character-id-debug"
                    onClose={() => setIsDebugDialogOpen(false)}
                    closeDisabled={isExtractingAllMsc || isBatchDecompilingMscSource}
                    footer={
                        <div className="flex justify-between gap-2 bg-background px-6 py-4">
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => void handleOpenPath(obDplCachePath)}
                                    disabled={!obDplCachePath.trim()}
                                >
                                    <FolderOpen className="mr-2 h-4 w-4" />
                                    Open Source Root
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => void handleOpenPath(debugMscOutputPath)}
                                    disabled={!debugMscOutputPath.trim()}
                                >
                                    <FolderOpen className="mr-2 h-4 w-4" />
                                    Open Output Root
                                </Button>
                            </div>
                            <Button
                                variant="outline"
                                onClick={() => setIsDebugDialogOpen(false)}
                                disabled={isExtractingAllMsc || isBatchDecompilingMscSource}
                            >
                                Close
                            </Button>
                        </div>
                    }
                >
                    <div className="min-h-0 flex-1 overflow-y-auto p-6">
                        <Tabs defaultValue="extract" className="space-y-4">
                            <TabsList className="h-auto justify-start rounded-md">
                                <TabsTrigger value="extract">{t("extractMsc")}</TabsTrigger>
                                <TabsTrigger value="decompile">{t("decompileC")}</TabsTrigger>
                            </TabsList>
                            <TabsContent value="extract" className="mt-0">
                                <div className="space-y-5">
                            <section className="rounded-md border bg-muted/10 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="space-y-1">
                                        <div className="text-base font-semibold">{t("bulkMscSourceCheck")}</div>
                                        <div className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                                            {t("scanDescription")}
                                        </div>
                                    </div>
                                    <div className="inline-flex w-fit items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs font-medium">
                                        <Info className="h-4 w-4 text-primary" />
                                        {debugRunStatus}
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-3">
                                <div className="text-sm font-semibold">{t("scanPlan")}</div>
                                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                                    <DebugMetric
                                        label={t("tableRows")}
                                        value={bulkMscPlan.totalRows}
                                        detail={t("tableRowsDetail")}
                                    />
                                    <DebugMetric
                                        label={t("mscRows")}
                                        value={bulkMscPlan.nonZeroRows}
                                        detail={t("mscRowsDetail")}
                                    />
                                    <DebugMetric
                                        label={t("uniquePackages")}
                                        value={bulkMscPlan.candidates.length}
                                        detail={t("uniquePackagesDetail")}
                                        tone="info"
                                    />
                                    <DebugMetric
                                        label={t("repeatedRefs")}
                                        value={bulkMscPlan.duplicateRows}
                                        detail={t("repeatedRefsDetail")}
                                    />
                                    <DebugMetric
                                        label={t("zeroMscRows")}
                                        value={bulkMscPlan.skippedZeroRows}
                                        detail={t("zeroMscRowsDetail")}
                                    />
                                </div>
                            </section>

                            <section className="space-y-3 rounded-md border p-4">
                                <div className="flex flex-col gap-1">
                                    <div className="text-sm font-semibold">{t("paths")}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {t("pathsDescription")}
                                    </div>
                                </div>
                                <FilePathInput
                                    value={debugMscOutputPath}
                                    onChange={(event) => {
                                        void setSetting(
                                            CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY,
                                            event.target.value,
                                        );
                                    }}
                                    storeKey={CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY}
                                    placeholder={t("selectDebugOutputRootPlaceholder")}
                                    disabled={isExtractingAllMsc}
                                    picker={{
                                        kind: "folder",
                                        multiple: false,
                                        title: t("selectDebugOutputRoot"),
                                    }}
                                />
                                <div className="rounded-md border bg-background/60 px-3">
                                    <DebugPathRow label={t("sourceRoot")} value={obDplCachePath} />
                                    <DebugPathRow label={t("outputRoot")} value={debugMscOutputPath} />
                                    <DebugPathRow label={t("actualMscOutput")} value={bulkMscOutputRoute} />
                                </div>
                            </section>

                            <section className="space-y-3 rounded-md border p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="space-y-1">
                                        <div className="text-sm font-semibold">{t("runExtraction")}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {t("runExtractionDescription")}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            onClick={() => void handleExtractAllMsc()}
                                            disabled={isExtractingAllMsc || !bulkMscReadyToRun}
                                        >
                                            <PackageOpen className="mr-2 h-4 w-4" />
                                            {isExtractingAllMsc ? t("extractingMsc") : t("extractAllMsc")}
                                        </Button>
                                        {bulkMscProgress?.lastOutputPath ? (
                                            <Button
                                                variant="outline"
                                                onClick={() => void handleOpenPath(bulkMscProgress.lastOutputPath!)}
                                            >
                                                <FolderOpen className="mr-2 h-4 w-4" />
                                                Open Last Extracted
                                            </Button>
                                        ) : null}
                                    </div>
                                </div>
                                {!bulkMscReadyToRun ? (
                                    <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                        <div className="space-y-1">
                                            {!obDplCachePath.trim() ? <div>{t("obDplcacheNotConfigured")}</div> : null}
                                            {!debugMscOutputPath.trim() ? <div>{t("mscOutputNotConfigured")}</div> : null}
                                            {bulkMscPlan.candidates.length === 0 ? <div>{t("noNonZeroMsc")}</div> : null}
                                        </div>
                                    </div>
                                ) : null}
                            </section>

                            {bulkMscProgress ? (
                                <section className="space-y-4 rounded-md border p-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-3 text-sm">
                                            <span className="font-semibold">{debugRunStatus}</span>
                                            <span className="font-mono text-xs text-muted-foreground">
                                                {bulkMscProgress.current}/{bulkMscProgress.total} scanned, {bulkMscHandledCount} classified
                                            </span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                                            <div
                                                className="h-full bg-primary transition-[width] duration-200"
                                                style={{ width: `${bulkMscProgressPercent}%` }}
                                            />
                                        </div>
                                        {bulkMscProgress.currentLabel ? (
                                            <div className="break-all rounded border bg-muted/20 p-2 font-mono text-xs text-muted-foreground">
                                                {bulkMscProgress.currentLabel}
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                        <DebugMetric
                                            label={t("extracted")}
                                            value={bulkMscProgress.successCount}
                                            detail={t("extractedDetail")}
                                            tone="success"
                                            icon={<CheckCircle2 className="h-4 w-4" />}
                                        />
                                        <DebugMetric
                                            label={t("noSourceFile")}
                                            value={bulkMscProgress.sourceMissingCount}
                                            detail={t("noSourceFileDetail")}
                                            tone={bulkMscProgress.sourceMissingCount > 0 ? "warning" : "neutral"}
                                            icon={<CircleSlash className="h-4 w-4" />}
                                        />
                                        <DebugMetric
                                            label={t("extractErrors")}
                                            value={bulkMscProgress.extractionFailureCount}
                                            detail={t("extractErrorsDetail")}
                                            tone={bulkMscProgress.extractionFailureCount > 0 ? "danger" : "neutral"}
                                            icon={<XCircle className="h-4 w-4" />}
                                        />
                                        <DebugMetric
                                            label={t("namingWarnings")}
                                            value={bulkMscProgress.namingWarningCount}
                                            detail={t("namingWarningsDetail")}
                                            tone={bulkMscProgress.namingWarningCount > 0 ? "warning" : "neutral"}
                                            icon={<AlertTriangle className="h-4 w-4" />}
                                        />
                                    </div>

                                    {bulkMscProgress.completed ? (
                                        <div className={cn(
                                            "rounded-md border p-3 text-sm",
                                            bulkMscProgress.extractionFailureCount > 0
                                                ? "border-destructive/40 bg-destructive/10 text-destructive"
                                                : bulkMscProgress.sourceMissingCount > 0
                                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                                        )}>
                                            {bulkMscProgress.extractionFailureCount > 0
                                                ? "Some source files existed but failed during extraction. Check Extract errors below."
                                                : bulkMscProgress.sourceMissingCount > 0
                                                    ? "Some MSC references have no source file in the configured OB dplcache root. This means there is nothing to extract for those hashes from that source root."
                                                    : "All scanned MSC source files existed and were extracted."}
                                        </div>
                                    ) : null}

                                    <div className="grid gap-3 lg:grid-cols-2">
                                        <DebugLogBlock
                                            title={t("noSourceFile")}
                                            count={bulkMscProgress.sourceMissingCount}
                                            items={bulkMscProgress.missingSources}
                                            tone="warning"
                                            emptyText={t("noMissingSources")}
                                        />
                                        <DebugLogBlock
                                            title={t("extractErrors")}
                                            count={bulkMscProgress.extractionFailureCount}
                                            items={bulkMscProgress.extractionErrors}
                                            tone="danger"
                                            emptyText={t("noExtractErrors")}
                                        />
                                    </div>

                                    <DebugLogBlock
                                        title={t("namingWarnings")}
                                        count={bulkMscProgress.namingWarningCount}
                                        items={bulkMscProgress.namingWarnings}
                                        tone="info"
                                        emptyText={t("noNamingWarnings")}
                                    />
                                </section>
                            ) : (
                                <section className="rounded-md border bg-muted/10 p-4 text-sm text-muted-foreground">
                                    {t("noScanResult")}
                                </section>
                            )}
                                </div>
                            </TabsContent>
                            <TabsContent value="decompile" className="mt-0">
                                <MscSourceBatchDecompileView
                                    defaultRootPath={bulkMscOutputRoute}
                                    onBusyChange={setIsBatchDecompilingMscSource}
                                />
                            </TabsContent>
                        </Tabs>
                    </div>
                </AppRndModalShell>
            ) : null}
        </div>
    );
}


