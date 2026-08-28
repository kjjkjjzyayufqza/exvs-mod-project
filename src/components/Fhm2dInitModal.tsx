import { useRef, useState, useMemo, useEffect } from "react";
import {
    Loader2,
    FolderOpen,
    FolderOutput,
    FileCode2,
    ArrowRight,
    Search,
    RefreshCw,
    Copy,
    Check,
    Clock,
    AlertCircle,
    Play,
    CheckCircle2,
    Filter,
    ArrowUpDown,
    Settings2,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { exists, stat } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";

import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import {
    Fhm2dMetadataSummary,
    Fhm2dNameField,
} from "@/components/fhm2d-metadata";
import { TEST_EDITOR_FOLDER_STORE_KEY, useConfigStore } from "@/store/configStore";
import { IOReadFile } from "@/IO/fileSystem";
import { ExtractFHMData, ExtractType, Fhm2d_type_format } from "@/models/fhm2d";
import { initPilotVoiceResourcePack } from "@/page/TestEditor/components/pilot-voice-resource/initPilotVoiceResourcePack";
import { PILOT_VOICE_RESOURCE_PACK_NAME } from "@/page/TestEditor/components/pilot-voice-resource/pilotVoiceResourceDocument";
import { initRawPathIdPack } from "@/page/TestEditor/components/raw-path-id/initRawPathIdPack";
import { RAW_PATH_ID_PACK_NAME } from "@/page/TestEditor/components/raw-path-id/rawPathIdDocument";
import { initBgmTablePack } from "@/page/TestEditor/components/bgm-table/initBgmTablePack";
import { initBgmBankUpdate02Pack } from "@/page/TestEditor/components/bgm-table/initBgmBankUpdate02Pack";
import {
  BGM_BANK_UPDATE_02_PACK_NAME,
  BGM_TABLE_PACK_NAME,
} from "@/page/TestEditor/components/bgm-table/bgmTableDocument";
import { cn } from "@/lib/utils";
import {
    normalizeFhm2dHashName,
    sanitizeFhm2dStructureName,
} from "@/utils/fhm2dStructureMetadata";
import {
    buildFhm2dInitExtractOutput,
    defaultInitPackName,
    resolveInitRouteTarget,
    type Fhm2dInitExtractOutput,
} from "@/utils/fhm2dInitExtractPaths";

interface Fhm2dInitModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type InitListItem = {
    id: string;
    name: string;
    hash: string;
    /** Workspace route id (TestEditor assetRoutes). */
    routeId: string;
    format?: Fhm2d_type_format;
    formatLabel: string;
    /**
     * When set, overrides name-map default for the extract folder stem.
     * e.g. common effect uses 000common_001 instead of the long meta path name.
     */
    fixedPackName?: string;
    /** English note shown in expanded row (optional). */
    description?: string;
};

type FileStatus = {
    exists: boolean;
    path: string;
    size?: number;
    lastModified?: number;
};

type ExtractionHistory = {
    id: string;
    timestamp: number;
    success: boolean;
    outputPath?: string;
};

type SortOption = "name" | "type" | "status" | "lastUsed";
type FilterOption = "all" | "available" | "list" | "nutexb";

/**
 * Global bootstrap packs for FHM2D Init.
 * Output layout matches TestEditor workspace + exemplar E:\XB\mod:
 *   012list/*  |  041cpm/for_outgame  |  009gui/*  |  006effect/000common_001
 */
const FHM2D_ITEMS: InitListItem[] = [
    {
        id: "character_id_table",
        name: "Character ID Table",
        hash: "0x036B9E67",
        routeId: "list.character",
        formatLabel: "list",
        description: "character_id_table.bin under 012list",
    },
    {
        id: "character_list",
        name: "Character List",
        hash: "0xDFD38C70",
        routeId: "list.character",
        formatLabel: "list",
        description: "character_list.bin under 012list",
    },
    {
        id: "series_list",
        name: "Series List",
        hash: "0xb7367090",
        routeId: "list.series",
        formatLabel: "list",
    },
    {
        id: "navi_list",
        name: "Navi List",
        hash: "0x6FCC0FBA",
        routeId: "list.navi",
        formatLabel: "list",
        fixedPackName: "navi_list",
        description: "support navi table → 012list/navi_list",
    },
    {
        id: "stage_list",
        name: "Stage List",
        hash: "0xCE74091E",
        routeId: "list.stage",
        format: Fhm2d_type_format.fhm2d_stage_list,
        formatLabel: "list",
    },
    {
        id: "stage_image_list",
        name: "Stage Image List",
        hash: "0x3CC8B10B",
        routeId: "gui.stage-icons",
        format: Fhm2d_type_format.fhm2d_all_nutexb,
        formatLabel: "all_nutexb",
    },
    {
        id: "stage_image_list_2",
        name: "Stage Image List 2",
        hash: "0x0CEE3991",
        routeId: "gui.stage-icons",
        format: Fhm2d_type_format.fhm2d_all_nutexb,
        formatLabel: "all_nutexb",
    },
    {
        id: "series_image_list",
        name: "Series Image List",
        hash: "0xA0253AA0",
        routeId: "gui.series-icons",
        format: Fhm2d_type_format.fhm2d_all_nutexb,
        formatLabel: "all_nutexb",
    },
    {
        id: "card_icon_list",
        name: "Card Icon List",
        hash: "0x49235031",
        routeId: "gui.card-icons",
        format: Fhm2d_type_format.fhm2d_all_nutexb,
        formatLabel: "all_nutexb",
    },
    {
        id: "character_cost",
        name: "Character Cost",
        hash: "0xFF832E7F",
        routeId: "param.for-outgame",
        format: Fhm2d_type_format.fhm2d_character_cost,
        formatLabel: "character_cost",
        description: "unit cost, HP → 041cpm/for_outgame",
    },
    {
        id: "common_effect",
        name: "Common Effect",
        hash: "0x1587139A",
        routeId: "unit.effect",
        format: Fhm2d_type_format.fhm2d_effect,
        formatLabel: "effect",
        fixedPackName: "000common_001",
        description: "shared unit FX → 006effect/000common_001",
    },
    {
        id: "raw_path_id",
        name: "Raw Path ID",
        hash: "0x264D1CA7",
        routeId: "unit.sound",
        format: Fhm2d_type_format.fhm2d_sound,
        formatLabel: "sound",
        fixedPackName: "raw_path_id",
        description: "unpack 0x264D1CA7 and name inner files from vs2 meta → 090sound/raw_path_id",
    },
    {
        id: "pilot_voice_resource",
        name: "Pilot Voice Table",
        hash: "0x8C428AF2",
        routeId: "unit.sound",
        format: Fhm2d_type_format.fhm2d_sound,
        formatLabel: "sound",
        fixedPackName: "090sound",
        description: "unpack 0x8C428AF2 and name 7 root tables → 090sound/090sound",
    },
    {
        id: "bgm_table",
        name: "BGM Table",
        hash: "0x5E92AAEC",
        routeId: "unit.sound",
        format: Fhm2d_type_format.fhm2d_sound,
        formatLabel: "sound",
        fixedPackName: BGM_TABLE_PACK_NAME,
        description: "unpack 0x5E92AAEC bgm_table.vgsht2 → 090sound/bgm_table",
    },
    {
        id: "bgm_bank_update_02",
        name: "BGM AC27 Update 02 Bank",
        hash: "0x0C568109",
        routeId: "unit.sound",
        format: Fhm2d_type_format.fhm2d_sound,
        formatLabel: "sound",
        fixedPackName: BGM_BANK_UPDATE_02_PACK_NAME,
        description: "unpack 0x0C568109 group 6 nus3bank → 090sound/bgm_ac27_update_02",
    },
];

const HISTORY_KEY = "fhm2d_extraction_history_v1";
const FHM2D_INIT_MODAL_DIMENSIONS = {
    width: 720,
    height: 680,
    minWidth: 600,
    minHeight: 540,
};

const FHM2D_EXTRACT_NAME_DIMENSIONS = {
    width: 620,
    height: 560,
    minWidth: 480,
    minHeight: 420,
};

function buildHashFileName(hash: string): string {
    const trimmed = hash.trim();
    if (!trimmed) return "";
    return trimmed.toLowerCase().startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function getItemRoute(item: InitListItem) {
    return resolveInitRouteTarget(item.routeId);
}

function defaultExtractName(item: InitListItem): string {
    if (item.fixedPackName?.trim()) {
        return sanitizeFhm2dStructureName(item.fixedPackName);
    }
    return defaultInitPackName(item.hash, {
        routeId: item.routeId,
        fallbackName: item.name || item.id || buildHashFileName(item.hash),
    });
}

function previewExtractOutput(
    item: InitListItem,
    exportRoot: string,
    packName: string,
): Fhm2dInitExtractOutput | null {
    const root = exportRoot.trim();
    if (!root) return null;
    try {
        const route = getItemRoute(item);
        return buildFhm2dInitExtractOutput({
            exportRoot: root,
            routeId: route.routeId,
            routePrefix: route.routePrefix,
            packName,
            hashHex: item.hash,
        });
    } catch {
        return null;
    }
}

function getFhm2dFullPath(sourceFolder: string, hash: string): string {
    const base = (sourceFolder || "").trim().replace(/[\\/]+$/g, "");
    if (!base) return "";
    const fileName = `${buildHashFileName(hash)}.fhm2d`;
    return `${base}\\${fileName}`;
}

async function assertFhm2dMagic(filePath: string): Promise<void> {
    const buf = new Uint8Array(await IOReadFile(filePath));
    if (buf.byteLength < 4) {
        throw new Error("Invalid fhm2d file: too small");
    }
    const magic = Array.from(buf.subarray(0, 4))
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    if (magic === "B9B7B2CD" || magic === "9992CD90") return;
    throw new Error("File magic not match with FHM2D or PS4FHM");
}

function formatFileSize(bytes?: number): string {
    if (!bytes) return "-";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIdx = 0;
    while (size >= 1024 && unitIdx < units.length - 1) {
        size /= 1024;
        unitIdx++;
    }
    return `${size.toFixed(1)} ${units[unitIdx]}`;
}

function formatTimeAgo(timestamp?: number): string {
    if (!timestamp) return "";
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
}

function getFormatBadgeColor(formatLabel: string): string {
    switch (formatLabel) {
        case "list":
            return "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20";
        case "all_nutexb":
            return "bg-purple-500/10 text-purple-600 border-purple-500/20 hover:bg-purple-500/20";
        case "character_cost":
            return "bg-amber-500/10 text-amber-800 border-amber-500/25 hover:bg-amber-500/20";
        case "effect":
            return "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 hover:bg-emerald-500/20";
        case "sound":
            return "bg-cyan-500/10 text-cyan-700 border-cyan-500/25 hover:bg-cyan-500/20";
        default:
            return "bg-muted text-muted-foreground";
    }
}

export default function Fhm2dInitModal({ isOpen, onClose }: Fhm2dInitModalProps) {
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Core states
    const [extractingId, setExtractingId] = useState<string | null>(null);
    const [lastExtractedId, setLastExtractedId] = useState<string | null>(null);
    const [extractionProgress, setExtractionProgress] = useState(0);

    // File status cache
    const [fileStatusMap, setFileStatusMap] = useState<Map<string, FileStatus>>(new Map());
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Search and filter
    const [searchQuery, setSearchQuery] = useState("");
    const [filterOption, setFilterOption] = useState<FilterOption>("all");
    const [sortOption, setSortOption] = useState<SortOption>("name");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

    // Batch selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBatchMode, setIsBatchMode] = useState(false);
    const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

    // History
    const [history, setHistory] = useState<ExtractionHistory[]>([]);

    // UI states
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [pendingNameItem, setPendingNameItem] = useState<InitListItem | null>(null);
    const [pendingExtractName, setPendingExtractName] = useState("");

    const obDplCachePath = useConfigStore((s) => s.obDplCachePath);
    /**
     * EXVS2 Workspace root (`testEditorFolder`, e.g. E:\XB\mod).
     * Not obModPath (game inject) and not extractOutputPath (secondary dump).
     */
    const testEditorFolder = useConfigStore((s) => s.testEditorFolder);

    const isExtracting = extractingId !== null || batchProgress.total > 0;

    // Filtered and sorted items
    const filteredItems = useMemo(() => {
        let items = [...FHM2D_ITEMS];

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            items = items.filter(
                (item) =>
                    item.name.toLowerCase().includes(query) ||
                    item.hash.toLowerCase().includes(query) ||
                    item.id.toLowerCase().includes(query) ||
                    (item.description?.toLowerCase().includes(query) ?? false)
            );
        }

        switch (filterOption) {
            case "list":
                items = items.filter((i) => i.formatLabel === "list");
                break;
            case "nutexb":
                items = items.filter((i) => i.formatLabel === "all_nutexb");
                break;
            case "available":
                items = items.filter((i) => fileStatusMap.get(i.id)?.exists);
                break;
        }

        items.sort((a, b) => {
            let comparison = 0;
            switch (sortOption) {
                case "name":
                    comparison = a.name.localeCompare(b.name);
                    break;
                case "type":
                    comparison = a.formatLabel.localeCompare(b.formatLabel);
                    break;
                case "status": {
                    const aExists = fileStatusMap.get(a.id)?.exists ? 1 : 0;
                    const bExists = fileStatusMap.get(b.id)?.exists ? 1 : 0;
                    comparison = bExists - aExists;
                    break;
                }
                case "lastUsed": {
                    const aHistory = history.find((h) => h.id === a.id);
                    const bHistory = history.find((h) => h.id === b.id);
                    comparison = (bHistory?.timestamp || 0) - (aHistory?.timestamp || 0);
                    break;
                }
            }
            return sortDirection === "asc" ? comparison : -comparison;
        });

        return items;
    }, [searchQuery, filterOption, sortOption, sortDirection, fileStatusMap, history]);

    // Stats
    const stats = useMemo(() => {
        const total = FHM2D_ITEMS.length;
        const available = FHM2D_ITEMS.filter((i) => fileStatusMap.get(i.id)?.exists).length;
        const selected = selectedIds.size;
        return { total, available, selected };
    }, [fileStatusMap, selectedIds]);

    // Load history and refresh status on mount
    useEffect(() => {
        if (isOpen) {
            loadHistory();
            refreshFileStatus();
        }
    }, [isOpen, obDplCachePath]);

    function loadHistory() {
        try {
            const stored = localStorage.getItem(HISTORY_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as ExtractionHistory[];
                setHistory(parsed.slice(-50));
            }
        } catch {
            // Invalid stored data
        }
    }

    function saveHistory(newHistory: ExtractionHistory[]) {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory.slice(-50)));
        } catch (error) {
            console.error("Failed to save history:", error);
        }
    }

    async function refreshFileStatus() {
        if (!obDplCachePath || isRefreshing) return;
        setIsRefreshing(true);

        const newMap = new Map<string, FileStatus>();

        await Promise.all(
            FHM2D_ITEMS.map(async (item) => {
                const path = getFhm2dFullPath(obDplCachePath, item.hash);
                if (!path) {
                    newMap.set(item.id, { exists: false, path: "" });
                    return;
                }

                try {
                    const fileExists = await exists(path);
                    if (fileExists) {
                        const fileStat = await stat(path);
                        newMap.set(item.id, {
                            exists: true,
                            path,
                            size: Number(fileStat.size),
                            lastModified: Number(fileStat.mtime),
                        });
                    } else {
                        newMap.set(item.id, { exists: false, path });
                    }
                } catch {
                    newMap.set(item.id, { exists: false, path });
                }
            })
        );

        setFileStatusMap(newMap);
        setIsRefreshing(false);
    }

    function toggleSelection(id: string) {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    }

    function toggleSelectAll() {
        if (selectedIds.size === filteredItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredItems.map((i) => i.id)));
        }
    }

    function openExtractNameDialog(item: InitListItem) {
        setPendingNameItem(item);
        setPendingExtractName(defaultExtractName(item));
    }

    async function handleExtract(item: InitListItem, nameOverride?: string) {
        if (isExtracting) return;

        if (item.id === "raw_path_id" && nameOverride === undefined) {
            await handleExtract(item, item.fixedPackName ?? RAW_PATH_ID_PACK_NAME);
            return;
        }
        if (item.id === "pilot_voice_resource" && nameOverride === undefined) {
            await handleExtract(item, item.fixedPackName ?? PILOT_VOICE_RESOURCE_PACK_NAME);
            return;
        }
        if (item.id === "bgm_table" && nameOverride === undefined) {
            await handleExtract(item, item.fixedPackName ?? BGM_TABLE_PACK_NAME);
            return;
        }
        if (item.id === "bgm_bank_update_02" && nameOverride === undefined) {
            await handleExtract(item, item.fixedPackName ?? BGM_BANK_UPDATE_02_PACK_NAME);
            return;
        }

        if (nameOverride === undefined) {
            openExtractNameDialog(item);
            return;
        }

        const outBase = (testEditorFolder ?? "").trim();
        if (!outBase) {
            toast.error("Please set EXVS2 Workspace folder first (workspace root, e.g. E:\\XB\\mod)");
            return;
        }

        const sourceBase = (obDplCachePath ?? "").trim();
        if (!sourceBase) {
            toast.error("Please set source folder first");
            return;
        }

        const inputPath = getFhm2dFullPath(sourceBase, item.hash);
        if (!inputPath) {
            toast.error("Invalid source folder");
            return;
        }

        const fileExists = await exists(inputPath);
        if (!fileExists) {
            toast.error(`Source file not found: ${inputPath}`);
            return;
        }

        const route = getItemRoute(item);
        const extractOutput = buildFhm2dInitExtractOutput({
            exportRoot: outBase,
            routeId: route.routeId,
            routePrefix: route.routePrefix,
            packName: nameOverride,
            hashHex: item.hash,
        });
        const outDir = extractOutput.folderPath;

        setExtractingId(item.id);
        setLastExtractedId(null);
        setExtractionProgress(0);

        const progressInterval = setInterval(() => {
            setExtractionProgress((p) => Math.min(p + 10, 90));
        }, 200);

        try {
            await assertFhm2dMagic(inputPath);
            const listOutputFileName =
                item.format === Fhm2d_type_format.fhm2d_stage_list ? `${item.id}.bin` : undefined;

            const extractResult = item.id === "raw_path_id"
                ? await initRawPathIdPack({
                    sourceFhm2dPath: inputPath,
                    workspaceRoot: outBase,
                })
                : item.id === "pilot_voice_resource"
                    ? await initPilotVoiceResourcePack({
                        sourceFhm2dPath: inputPath,
                        workspaceRoot: outBase,
                    })
                : item.id === "bgm_table"
                    ? await initBgmTablePack({
                        sourceFhm2dPath: inputPath,
                        workspaceRoot: outBase,
                    })
                : item.id === "bgm_bank_update_02"
                    ? await initBgmBankUpdate02Pack({
                        sourceFhm2dPath: inputPath,
                        workspaceRoot: outBase,
                    })
                : await ExtractFHMData(inputPath, outDir, ExtractType.SingleFolder, item.format, listOutputFileName);

            clearInterval(progressInterval);
            setExtractionProgress(100);

            const newEntry: ExtractionHistory = {
                id: item.id,
                timestamp: Date.now(),
                success: true,
                outputPath: outDir,
            };
            const newHistory = [...history, newEntry];
            setHistory(newHistory);
            saveHistory(newHistory);

            setLastExtractedId(item.id);
            const namingError = "namingError" in extractResult ? extractResult.namingError : undefined;
            if (namingError) {
                toast.error(`Extract finished but FHM naming failed: ${item.name}`, {
                    description: namingError,
                    duration: 20_000,
                    action: {
                        label: "Open Folder",
                        onClick: () => openFolder(outDir),
                    },
                });
            } else {
                toast.success(`Extract completed: ${item.name}`, {
                    description: `Output: ${extractOutput.relativeFolderPath}\n${outDir}`,
                    action: {
                        label: "Open Folder",
                        onClick: () => openFolder(outDir),
                    },
                });
            }
        } catch (error) {
            clearInterval(progressInterval);
            const message = error instanceof Error ? error.message : String(error);
            toast.error(`Extract failed: ${message}`);

            const newEntry: ExtractionHistory = {
                id: item.id,
                timestamp: Date.now(),
                success: false,
            };
            const newHistory = [...history, newEntry];
            setHistory(newHistory);
            saveHistory(newHistory);
        } finally {
            setTimeout(() => {
                setExtractingId(null);
                setExtractionProgress(0);
            }, 500);
        }
    }

    async function handleBatchExtract() {
        if (selectedIds.size === 0) {
            toast.error("No items selected");
            return;
        }

        const items = FHM2D_ITEMS.filter((i) => selectedIds.has(i.id));
        setBatchProgress({ current: 0, total: items.length });

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            setBatchProgress({ current: i + 1, total: items.length });

            try {
                await handleExtract(item, defaultExtractName(item));
                successCount++;
            } catch {
                failCount++;
            }

            if (i < items.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 300));
            }
        }

        setBatchProgress({ current: 0, total: 0 });
        setSelectedIds(new Set());

        toast.success(`Batch extraction complete: ${successCount} success, ${failCount} failed`);
    }

    async function copyPath(path: string, id: string) {
        try {
            await navigator.clipboard.writeText(path);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
            toast.success("Path copied to clipboard");
        } catch {
            toast.error("Failed to copy path");
        }
    }

    async function openFolder(path: string) {
        try {
            await invoke("exec_shell_command", { command: `explorer "${path}"` });
        } catch {
            toast.error("Failed to open folder");
        }
    }

    function getLastExtractionTime(id: string): string {
        const entry = history.find((h) => h.id === id);
        return formatTimeAgo(entry?.timestamp);
    }

    if (!isOpen) return null;

    return (
        <TooltipProvider delayDuration={100}>
            <AppRndModalShell
                titleId="fhm2d-init-modal-title"
                title="FHM2D Init"
                subtitle="Extract into workspace prefixes (012list / 041cpm / 009gui / 006effect)"
                headerIcon={<FileCode2 className="h-5 w-5 text-primary" />}
                dimensions={FHM2D_INIT_MODAL_DIMENSIONS}
                storageKey="app.rnd-size.fhm2d-init"
                onClose={onClose}
                closeDisabled={isExtracting}
            >
                <CardContent className="flex min-h-0 flex-1 flex-col p-0">
                            {/* Folder Configuration Section */}
                            <div className="px-5 py-4 space-y-4 bg-muted/20">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label
                                            htmlFor="fhm2d-init-source"
                                            className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                                        >
                                            <FolderOpen className="h-3.5 w-3.5" />
                                            Source Folder
                                        </Label>
                                        <FilePathInput
                                            id="fhm2d-init-source"
                                            placeholder="Select source folder..."
                                            value={obDplCachePath ?? ""}
                                            readOnly
                                            storeKey="obDplCachePath"
                                            picker={{ kind: "folder", multiple: false }}
                                            className="h-9 cursor-pointer bg-background"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label
                                            htmlFor="fhm2d-init-export"
                                            className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                                        >
                                            <FolderOutput className="h-3.5 w-3.5" />
                                            EXVS2 Workspace Folder (workspace root)
                                        </Label>
                                        <FilePathInput
                                            id="fhm2d-init-export"
                                            placeholder="e.g. E:\XB\mod"
                                            value={testEditorFolder ?? ""}
                                            readOnly
                                            storeKey={TEST_EDITOR_FOLDER_STORE_KEY}
                                            picker={{ kind: "folder", multiple: false }}
                                            className="h-9 cursor-pointer bg-background"
                                        />
                                    </div>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Uses Tauri config{" "}
                                    <span className="font-mono">{TEST_EDITOR_FOLDER_STORE_KEY}</span>{" "}
                                    (same as EXVS2 Workspace open folder), not{" "}
                                    <span className="font-mono">obModPath</span> (game inject) or{" "}
                                    <span className="font-mono">extractOutputPath</span>. Packs write
                                    under <span className="font-mono">012list/</span>,{" "}
                                    <span className="font-mono">041cpm/</span>,{" "}
                                    <span className="font-mono">009gui/</span>,{" "}
                                    <span className="font-mono">006effect/</span>.
                                </p>

                                {/* Quick Stats */}
                                <div className="flex items-center gap-4 text-xs">
                                    <Badge variant="secondary" className="font-normal">
                                        {stats.available} / {stats.total} files available
                                    </Badge>
                                    {isBatchMode && (
                                        <Badge variant="outline" className="font-normal">
                                            {stats.selected} selected
                                        </Badge>
                                    )}
                                    {obDplCachePath && !isRefreshing ? (
                                        <span className="text-muted-foreground">
                                            <CheckCircle2 className="inline h-3 w-3 mr-1 text-green-500" />
                                            Ready
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground">
                                            <AlertCircle className="inline h-3 w-3 mr-1 text-amber-500" />
                                            {isRefreshing ? "Scanning..." : "Configure folders"}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Search & Filter Toolbar */}
                            <div className="px-5 py-3 border-b bg-background">
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            ref={searchInputRef}
                                            placeholder="Search files..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-9 h-9"
                                        />
                                    </div>

                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-9 px-3 gap-1">
                                                <Filter className="h-3.5 w-3.5" />
                                                <span className="text-xs">Filter</span>
                                                {filterOption !== "all" && (
                                                    <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary" />
                                                )}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-40 p-1" align="end">
                                            <div className="space-y-1">
                                                {[
                                                    { value: "all", label: "All Files" },
                                                    { value: "available", label: "Available Only" },
                                                    { value: "list", label: "List Type" },
                                                    { value: "nutexb", label: "NUTEXB Type" },
                                                ].map((opt) => (
                                                    <Button
                                                        key={opt.value}
                                                        variant={filterOption === opt.value ? "secondary" : "ghost"}
                                                        size="sm"
                                                        className="w-full justify-start h-8 text-xs"
                                                        onClick={() => setFilterOption(opt.value as FilterOption)}
                                                    >
                                                        {opt.label}
                                                    </Button>
                                                ))}
                                            </div>
                                        </PopoverContent>
                                    </Popover>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-9 px-3 gap-1"
                                        onClick={() => {
                                            setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
                                        }}
                                    >
                                        <ArrowUpDown className="h-3.5 w-3.5" />
                                        <select
                                            className="bg-transparent text-xs outline-hidden cursor-pointer"
                                            value={sortOption}
                                            onChange={(e) => setSortOption(e.target.value as SortOption)}
                                        >
                                            <option value="name">Name</option>
                                            <option value="type">Type</option>
                                            <option value="status">Status</option>
                                            <option value="lastUsed">Last Used</option>
                                        </select>
                                    </Button>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-9 w-9"
                                                onClick={refreshFileStatus}
                                                disabled={isRefreshing}
                                            >
                                                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Refresh</TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant={isBatchMode ? "secondary" : "outline"}
                                                size="sm"
                                                className="h-9 px-3"
                                                onClick={() => {
                                                    setIsBatchMode(!isBatchMode);
                                                    if (isBatchMode) setSelectedIds(new Set());
                                                }}
                                            >
                                                <Settings2 className="h-4 w-4 mr-1.5" />
                                                Batch
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Batch Mode</TooltipContent>
                                    </Tooltip>
                                </div>

                                {/* Batch Action Bar */}
                                {isBatchMode && (
                                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
                                                onCheckedChange={toggleSelectAll}
                                                id="select-all"
                                            />
                                            <Label htmlFor="select-all" className="text-xs cursor-pointer">
                                                Select All ({filteredItems.length})
                                            </Label>
                                        </div>
                                        <Button
                                            size="sm"
                                            onClick={handleBatchExtract}
                                            disabled={selectedIds.size === 0 || isExtracting}
                                            className="gap-1.5"
                                        >
                                            {batchProgress.total > 0 ? (
                                                <>
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    {batchProgress.current} / {batchProgress.total}
                                                </>
                                            ) : (
                                                <>
                                                    <Play className="h-3.5 w-3.5" />
                                                    Extract {selectedIds.size} items
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* FHM2D List Section */}
                            <div className="min-h-0 flex-1 px-5 py-4">
                                <ScrollArea className="h-full rounded-lg border bg-muted/5">
                                    <div className="p-3 space-y-2">
                                        {filteredItems.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                                                <Search className="h-8 w-8 mb-2 opacity-50" />
                                                <p className="text-sm">No matching files found</p>
                                            </div>
                                        ) : (
                                            filteredItems.map((item) => {
                                                const status = fileStatusMap.get(item.id);
                                                const isItemExtracting = extractingId === item.id;
                                                const isLastExtracted = lastExtractedId === item.id;
                                                const isSelected = selectedIds.has(item.id);
                                                const isExpanded = expandedId === item.id;
                                                const lastUsed = getLastExtractionTime(item.id);
                                                const route = getItemRoute(item);
                                                const defaultName = defaultExtractName(item);
                                                const outputPreview = previewExtractOutput(
                                                    item,
                                                    testEditorFolder ?? "",
                                                    defaultName,
                                                );

                                                return (
                                                    <Collapsible
                                                        key={item.id}
                                                        open={isExpanded}
                                                        onOpenChange={(open) => setExpandedId(open ? item.id : null)}
                                                    >
                                                        <div
                                                            className={cn(
                                                                "group relative rounded-lg border transition-all duration-200",
                                                                isItemExtracting &&
                                                                "border-primary/50 bg-primary/5 ring-1 ring-primary/20",
                                                                isLastExtracted &&
                                                                !isItemExtracting &&
                                                                "border-green-500/30 bg-green-500/5",
                                                                isSelected &&
                                                                !isItemExtracting &&
                                                                !isLastExtracted &&
                                                                "border-blue-500/30 bg-blue-500/5",
                                                                !isItemExtracting &&
                                                                !isLastExtracted &&
                                                                !isSelected &&
                                                                "bg-card hover:border-muted-foreground/30 hover:shadow-sm",
                                                                !status?.exists && "opacity-60"
                                                            )}
                                                        >
                                                            <div className="p-3">
                                                                <div className="flex items-start gap-3">
                                                                    {/* Checkbox for batch mode */}
                                                                    {isBatchMode && (
                                                                        <div className="pt-1">
                                                                            <Checkbox
                                                                                checked={isSelected}
                                                                                onCheckedChange={() => toggleSelection(item.id)}
                                                                                disabled={!status?.exists || isExtracting}
                                                                            />
                                                                        </div>
                                                                    )}

                                                                    {/* Icon */}
                                                                    <div
                                                                        className={cn(
                                                                            "flex items-center justify-center w-10 h-10 rounded-lg shrink-0 transition-colors",
                                                                            item.formatLabel === "list"
                                                                                ? "bg-blue-500/10 text-blue-600"
                                                                                : item.formatLabel === "character_cost"
                                                                                    ? "bg-amber-500/10 text-amber-700"
                                                                                    : item.formatLabel === "effect"
                                                                                        ? "bg-emerald-500/10 text-emerald-700"
                                                                                        : "bg-purple-500/10 text-purple-600",
                                                                            isItemExtracting && "bg-primary/20 text-primary",
                                                                            !status?.exists && "grayscale"
                                                                        )}
                                                                    >
                                                                        <FileCode2 className="h-5 w-5" />
                                                                    </div>

                                                                    {/* Content */}
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2 mb-0.5">
                                                                            <span className="font-medium text-sm truncate">
                                                                                {item.name}
                                                                            </span>
                                                                            <Badge
                                                                                variant="outline"
                                                                                className={cn(
                                                                                    "h-5 px-1.5 text-[10px] font-medium border",
                                                                                    getFormatBadgeColor(item.formatLabel)
                                                                                )}
                                                                            >
                                                                                {item.formatLabel}
                                                                            </Badge>
                                                                            {isLastExtracted && (
                                                                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                                                            )}
                                                                            {status?.exists === false && (
                                                                                <Badge
                                                                                    variant="outline"
                                                                                    className="h-5 px-1.5 text-[10px] border-red-200 bg-red-50 text-red-600"
                                                                                >
                                                                                    Missing
                                                                                </Badge>
                                                                            )}
                                                                        </div>

                                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <span className="font-mono text-muted-foreground cursor-help">
                                                                                        {item.hash}
                                                                                    </span>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent side="bottom" className="max-w-md">
                                                                                    <p className="text-xs font-mono break-all">
                                                                                        {status?.path || "-"}
                                                                                    </p>
                                                                                </TooltipContent>
                                                                            </Tooltip>

                                                                            <Badge
                                                                                variant="secondary"
                                                                                className="h-5 max-w-full truncate px-1.5 font-mono text-[10px]"
                                                                                title={
                                                                                    outputPreview?.folderPath ??
                                                                                    `${route.routePrefix}/${defaultName}`
                                                                                }
                                                                            >
                                                                                → {outputPreview?.relativeFolderPath ?? `${route.routePrefix}/${defaultName}`}
                                                                            </Badge>

                                                                            {lastUsed && (
                                                                                <span className="text-muted-foreground flex items-center gap-1">
                                                                                    <Clock className="h-3 w-3" />
                                                                                    {lastUsed}
                                                                                </span>
                                                                            )}

                                                                            {status?.size && (
                                                                                <span className="text-muted-foreground">
                                                                                    {formatFileSize(status.size)}
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        {/* Progress bar for extracting item */}
                                                                        {isItemExtracting && (
                                                                            <div className="mt-2">
                                                                                <Progress value={extractionProgress} className="h-1" />
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Actions */}
                                                                    <div className="shrink-0 flex items-center gap-1">
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon"
                                                                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        copyPath(status?.path || item.hash, item.id);
                                                                                    }}
                                                                                    disabled={!status?.path}
                                                                                >
                                                                                    {copiedId === item.id ? (
                                                                                        <Check className="h-3.5 w-3.5 text-green-500" />
                                                                                    ) : (
                                                                                        <Copy className="h-3.5 w-3.5" />
                                                                                    )}
                                                                                </Button>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent>Copy Path</TooltipContent>
                                                                        </Tooltip>

                                                                        <CollapsibleTrigger asChild>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="h-7 w-7"
                                                                                onClick={(e) => e.stopPropagation()}
                                                                            >
                                                                                {isExpanded ? (
                                                                                    <ChevronUp className="h-4 w-4" />
                                                                                ) : (
                                                                                    <ChevronDown className="h-4 w-4" />
                                                                                )}
                                                                            </Button>
                                                                        </CollapsibleTrigger>

                                                                        {!isBatchMode && (
                                                                            <Button
                                                                                size="sm"
                                                                                onClick={() => handleExtract(item)}
                                                                                disabled={isExtracting || !status?.exists}
                                                                                className={cn(
                                                                                    "h-8 px-3 transition-all",
                                                                                    isItemExtracting && "w-28"
                                                                                )}
                                                                            >
                                                                                {isItemExtracting ? (
                                                                                    <>
                                                                                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                                                                        <span className="text-xs">
                                                                                            {extractionProgress}%
                                                                                        </span>
                                                                                    </>
                                                                                ) : isLastExtracted ? (
                                                                                    <>
                                                                                        <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                                                                                        <span className="text-xs">Again</span>
                                                                                    </>
                                                                                ) : (
                                                                                    <span className="text-xs">Extract</span>
                                                                                )}
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Expanded Details */}
                                                            <CollapsibleContent>
                                                                <div className="px-3 pb-3 pt-0">
                                                                    <div className="rounded-md bg-muted/50 p-3 space-y-2 text-xs">
                                                                        <div className="grid grid-cols-2 gap-2">
                                                                            <div>
                                                                                <span className="text-muted-foreground">ID:</span>
                                                                                <span className="ml-2 font-mono">{item.id}</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="text-muted-foreground">Format:</span>
                                                                                <span className="ml-2">{item.format || "auto-detect"}</span>
                                                                            </div>
                                                                        </div>
                                                                        {item.description && (
                                                                            <div className="text-muted-foreground leading-relaxed">
                                                                                {item.description}
                                                                            </div>
                                                                        )}
                                                                        <div>
                                                                            <span className="text-muted-foreground">Path:</span>
                                                                            <span className="ml-2 font-mono break-all">
                                                                                {status?.path || "-"}
                                                                            </span>
                                                                        </div>
                                                                        {status?.lastModified && (
                                                                            <div>
                                                                                <span className="text-muted-foreground">Modified:</span>
                                                                                <span className="ml-2">
                                                                                    {new Date(status.lastModified).toLocaleString()}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                        {status?.size && (
                                                                            <div>
                                                                                <span className="text-muted-foreground">Size:</span>
                                                                                <span className="ml-2">{formatFileSize(status.size)}</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </CollapsibleContent>
                                                        </div>
                                                    </Collapsible>
                                                );
                                            })
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>

                            {/* Footer */}
                            <div className="px-5 py-4 border-t bg-muted/20 flex items-center justify-end">
                                <Button variant="outline" size="sm" onClick={onClose} disabled={isExtracting}>
                                    Close
                                </Button>
                            </div>
                        </CardContent>
            </AppRndModalShell>
            <ExtractNameDialog
                item={pendingNameItem}
                value={pendingExtractName}
                outputRoot={testEditorFolder ?? ""}
                onChange={setPendingExtractName}
                onCancel={() => {
                    setPendingNameItem(null);
                    setPendingExtractName("");
                }}
                onConfirm={() => {
                    const item = pendingNameItem;
                    const name = pendingExtractName;
                    setPendingNameItem(null);
                    setPendingExtractName("");
                    if (item) void handleExtract(item, name);
                }}
            />
        </TooltipProvider>
    );
}

function ExtractNameDialog({
    item,
    value,
    outputRoot,
    onChange,
    onCancel,
    onConfirm,
}: {
    item: InitListItem | null;
    value: string;
    outputRoot: string;
    onChange: (value: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    if (!item) return null;

    const route = getItemRoute(item);
    const sanitizedName = sanitizeFhm2dStructureName(value || defaultExtractName(item));
    const extractOutput = previewExtractOutput(item, outputRoot, sanitizedName);
    const folderPath = extractOutput?.folderPath ?? null;
    const structureJsonPath = extractOutput?.structureJsonPath ?? null;
    const hashName = extractOutput?.hashName ?? normalizeFhm2dHashName(item.hash);
    const repackOutputPath = extractOutput?.repackOutputPath ?? null;

    return (
        <AppRndModalShell
            titleId="fhm2d-init-extract-name-title"
            title="Name extracted FHM2D pack"
            subtitle="Writes under the workspace route prefix (same layout as TestEditor / mod folders)."
            headerIcon={<FolderOutput className="h-5 w-5 text-primary" />}
            dimensions={FHM2D_EXTRACT_NAME_DIMENSIONS}
            storageKey="app.rnd-size.fhm2d-init-extract-name"
            onClose={onCancel}
            footer={
                <div className="flex justify-end gap-2 p-3">
                    <Button variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button disabled={!outputRoot.trim() || !extractOutput} onClick={onConfirm}>
                        <FolderOutput className="mr-2 h-4 w-4" />
                        Extract
                    </Button>
                </div>
            }
        >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <div className="font-medium">{item.name}</div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">{item.hash}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>
                            Route: <span className="font-mono text-foreground">{route.routeId}</span>
                        </span>
                        <span>
                            Prefix: <span className="font-mono text-foreground">{route.routePrefix}</span>
                        </span>
                    </div>
                </div>

                <section
                    className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"
                    aria-label="Output path review"
                >
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                        <FolderOutput className="h-3.5 w-3.5" />
                        Output path (review before extract)
                    </div>
                    {extractOutput ? (
                        <div className="space-y-2">
                            <div>
                                <div className="text-[11px] font-medium text-muted-foreground">Relative</div>
                                <div className="break-all rounded-md border bg-background px-2 py-1.5 font-mono text-xs">
                                    {extractOutput.relativeFolderPath}
                                </div>
                            </div>
                            <div>
                                <div className="text-[11px] font-medium text-muted-foreground">Full folder</div>
                                <div className="break-all rounded-md border bg-background px-2 py-1.5 font-mono text-xs">
                                    {extractOutput.folderPath}
                                </div>
                            </div>
                            <div>
                                <div className="text-[11px] font-medium text-muted-foreground">Structure JSON</div>
                                <div className="break-all rounded-md border bg-background px-2 py-1.5 font-mono text-xs text-muted-foreground">
                                    {extractOutput.structureJsonPath}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground">
                            Set Export Folder first. Expected layout: {"{export}"}/{route.routePrefix}/
                            {sanitizedName}
                        </p>
                    )}
                </section>

                <Fhm2dNameField
                    id="fhm2d-init-extract-name"
                    value={value}
                    onChange={onChange}
                    sourceNameOrPath={item.hash}
                    folderPath={folderPath}
                    structureJsonPath={structureJsonPath}
                />
                <Fhm2dMetadataSummary
                    compact
                    name={sanitizedName}
                    hashName={hashName}
                    folderPath={folderPath}
                    structureJsonPath={structureJsonPath}
                    repackOutputPath={repackOutputPath}
                />
            </div>
        </AppRndModalShell>
    );
}
