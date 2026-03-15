import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { exists, readFile, readTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { dirname, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Buffer } from "buffer";
import { toast } from "sonner";
import { RefreshCw, Save, FolderOpen, Info, Upload, Download, Image, Bug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { StageList, StageListGVS, buildStageListBuffer } from "@/models/stageList";
import type { StageDataEntry } from "@/models/stageList";
import { obfEncodeFromUtf8String } from "@/utils/obfString";
import { useConfigStore } from "@/store/configStore";
import { StageEditor } from "./stage-list/StageEditor";
import type { StageListSortKey } from "./stage-list/StageList";
import { StageGvsViewer, type StageListGvsSortKey } from "./stage-list/StageGvsViewer";
import {
  collectGvsImageAssetBinEntries,
  extractGvsImageAssetsToPng,
  type GvsIndexedBinEntry,
  type GvsImageConvertFailure,
  type GvsImageConvertProgress,
  type GvsImageConvertSuccess,
} from "./stage-list/gvsImageAssetExtract";
import {
  exportStageJsonToFile,
  pickStageJsonImportPreview,
  applyStageJsonImportToList,
  type StageJsonImportPreview,
} from "./stage-list/StageListJson";
import type { StageIconIndexPickerGroup } from "./stage-list/StageIconIndexPickerPopover";
import { extractCardIconItems } from "./card-icon-list/cardIconStructure";
import { buildCardIconPreviewPath } from "./card-icon-list/cardIconUtils";

const STAGE_LIST_HASH = "0xCE74091E";
const STAGE_ICON_HASH = "0x3CC8B10B";
const STAGE_ICON_SECONDARY_HASH = "0x0CEE3991";

const DEBUG_SOURCE_ID = 2111950077;

/** Debug batch: each entry is copied from source id 2111950077 with name and fileName (hex bytes as little-endian int32). */
const DEBUG_BATCH_ENTRIES: Array<{ name: string; fileNameHex: string }> = [
  { name: "GVSチュートリアル", fileNameHex: "97 3C F7 16" },
  { name: "GVSコロニー市街地", fileNameHex: "57 E3 B0 80" },
  { name: "GVSコロニーレーザー内部", fileNameHex: "28 8E 34 20" },
  { name: "GVS森林（昼間）", fileNameHex: "17 68 51 35" },
  { name: "GVS月面", fileNameHex: "57 BA 57 7A" },
  { name: "GVS小惑星", fileNameHex: "82 9E 2B 1A" },
  { name: "GVSビクエスト島", fileNameHex: "FD F3 AF BA" },
  { name: "GVSソロモン宙域", fileNameHex: "97 0B AA 40" },
  { name: "GVS廃棄コロニー(地球近辺)", fileNameHex: "3D 42 52 80" },
  { name: "GVSジャブロー", fileNameHex: "68 32 88 C3" },
  { name: "GVSニューホンコン", fileNameHex: "28 E0 8E 8C" },
  { name: "GVSサンダーボルト宙域", fileNameHex: "82 A9 76 4C" },
  { name: "GVS鉄華団基地", fileNameHex: "57 8D 0A 2C" },
  { name: "GVSトリントン演習場", fileNameHex: "E8 51 73 B6" },
  { name: "GVSニューホンコン（夕方）", fileNameHex: "D7 80 4B F5" },
  { name: "GVS森林（深夜）", fileNameHex: "FD AA 48 40" },
  { name: "GVSミンスリー", fileNameHex: "42 76 31 DA" },
];

function parseFileNameHex(hex: string): number {
  const bytes = hex.trim().split(/\s+/).map((s) => parseInt(s, 16));
  if (bytes.length !== 4 || bytes.some((b) => Number.isNaN(b))) {
    throw new Error(`Invalid fileName hex: ${hex}`);
  }
  return Buffer.from(bytes).readInt32LE(0);
}

function buildNameData(value: string): { Offset: number; StringBufferData: Buffer; Utf8String: string } {
  const utf8 = value ?? "";
  const encoded = Buffer.from(obfEncodeFromUtf8String(utf8));
  return { Offset: 0, StringBufferData: encoded, Utf8String: utf8 };
}

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

type StageIconState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; groups: StageIconIndexPickerGroup[] };

interface GvsSession {
  filePath: string;
  searchDir: string;
  list: StageListGVS;
}

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
  const [gvsSession, setGvsSession] = useState<GvsSession | null>(null);
  const [isGvsDialogOpen, setIsGvsDialogOpen] = useState(false);
  const [isApplyingGvs, setIsApplyingGvs] = useState(false);
  const [gvsBinPath, setGvsBinPath] = useState("");
  const [gvsSearchDir, setGvsSearchDir] = useState("");
  const [gvsSelectedIndex, setGvsSelectedIndex] = useState<number>(-1);
  const [gvsSortKey, setGvsSortKey] = useState<StageListGvsSortKey>("index");
  const [gvsSearchInputValue, setGvsSearchInputValue] = useState("");
  const [gvsSearchTerm, setGvsSearchTerm] = useState("");
  const [gvsIsComposing, setGvsIsComposing] = useState(false);
  const [isGvsAssetDialogOpen, setIsGvsAssetDialogOpen] = useState(false);
  const [isCollectingGvsAssetBins, setIsCollectingGvsAssetBins] = useState(false);
  const [isExtractingGvsAssets, setIsExtractingGvsAssets] = useState(false);
  const [isGvsBinStatusDialogOpen, setIsGvsBinStatusDialogOpen] = useState(false);
  const [gvsAssetOutputDir, setGvsAssetOutputDir] = useState("");
  const [gvsAssetBinEntries, setGvsAssetBinEntries] = useState<GvsIndexedBinEntry[]>([]);
  const [gvsAssetBinPaths, setGvsAssetBinPaths] = useState<string[]>([]);
  const [gvsAssetExtractProgress, setGvsAssetExtractProgress] = useState<GvsImageConvertProgress>({
    current: 0,
    total: 0,
    currentFile: "",
  });
  const [gvsAssetExtractSuccesses, setGvsAssetExtractSuccesses] = useState<GvsImageConvertSuccess[]>([]);
  const [gvsAssetExtractFailures, setGvsAssetExtractFailures] = useState<GvsImageConvertFailure[]>([]);
  const [stageIconState, setStageIconState] = useState<StageIconState>({ status: "idle" });
  const lastLoadedKeyRef = useRef<string>("");

  const resolveFilePath = useCallback(async () => {
    return await join(folderPath, STAGE_LIST_HASH, "stage_list.bin");
  }, [folderPath]);

  const resolveStageIconConvertDir = useCallback(
    async (hash: string) => {
      return await join(folderPath, hash, "__convert");
    },
    [folderPath]
  );

  const resolveStageIconStructureJsonPath = useCallback(
    async (hash: string) => {
      return await join(folderPath, `${hash}_structure.json`);
    },
    [folderPath]
  );

  const loadStageIconCount = useCallback(async () => {
    if (!folderPath) {
      setStageIconState({ status: "error", message: "Folder path is empty" });
      return;
    }

    setStageIconState({ status: "loading" });
    try {
      const groupDefs: Array<{ key: string; title: string; hash: string }> = [
        { key: "first", title: "Group 1", hash: STAGE_ICON_HASH },
        { key: "second", title: "Group 2", hash: STAGE_ICON_SECONDARY_HASH },
      ];
      const groups = await Promise.all(
        groupDefs.map(async (def) => {
          const [dirPath, structurePath] = await Promise.all([
            resolveStageIconConvertDir(def.hash),
            resolveStageIconStructureJsonPath(def.hash),
          ]);
          const raw = await readTextFile(structurePath);
          const json = JSON.parse(raw);
          const iconItems = extractCardIconItems(json);
          const items = iconItems.map((it, index) => {
            const previewPath = it.name ? buildCardIconPreviewPath(dirPath, it.name) : null;
            const previewSrc = previewPath ? convertFileSrc(previewPath) : "/tauri.svg";
            return { index, name: it.name, previewSrc };
          });
          return {
            key: def.key,
            title: def.title,
            convertDirPath: dirPath,
            structurePath,
            loadedCount: items.length,
            items,
          };
        })
      );
      setStageIconState({ status: "ready", groups });
    } catch (error) {
      setStageIconState({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [folderPath, resolveStageIconConvertDir, resolveStageIconStructureJsonPath]);

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

  useEffect(() => {
    if (!isActive) return;
    if (!folderPath) return;
    void loadStageIconCount();
  }, [folderPath, isActive, loadStageIconCount]);

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
    const activeFilePath =
      gvsSession?.filePath ??
      (loadState.status === "ready"
        ? loadState.filePath
        : loadState.status === "error"
          ? loadState.filePath
          : "");
    if (!activeFilePath) return;
    const folderPathToOpen = await dirname(activeFilePath);
    await handleOpenPath(folderPathToOpen);
  }, [gvsSession, loadState, handleOpenPath]);

  const loadGvsVariant = useCallback(async (filePath: string, searchDir: string) => {
    const fileExists = await exists(filePath);
    if (!fileExists) {
      throw new Error("GVS stage_list.bin does not exist");
    }

    const dirExists = await exists(searchDir);
    if (!dirExists) {
      throw new Error("Search directory does not exist");
    }

    const fileData = await readFile(filePath);
    const list = new StageListGVS(Buffer.from(fileData));
    setGvsSession({ filePath, searchDir, list });
    setGvsSelectedIndex(list.StageData.length > 0 ? 0 : -1);
    setGvsSortKey("index");
    setGvsSearchInputValue("");
    setGvsSearchTerm("");
    setGvsIsComposing(false);
  }, []);

  const handleApplyGvsVariant = useCallback(async () => {
    if (!gvsBinPath.trim()) {
      toast.error("Please select a GVS stage_list.bin file");
      return;
    }
    if (!gvsSearchDir.trim()) {
      toast.error("Please select a search directory");
      return;
    }
    if (isApplyingGvs) return;

    setIsApplyingGvs(true);
    try {
      await loadGvsVariant(gvsBinPath.trim(), gvsSearchDir.trim());
      setIsGvsDialogOpen(false);
      toast.success("Loaded GVS variant view");
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to load GVS variant: ${message}`);
    } finally {
      setIsApplyingGvs(false);
    }
  }, [gvsBinPath, gvsSearchDir, isApplyingGvs, loadGvsVariant]);

  const handleReloadActive = useCallback(async () => {
    if (gvsSession) {
      try {
        await loadGvsVariant(gvsSession.filePath, gvsSession.searchDir);
        toast.success("Reloaded GVS variant");
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : "Unknown error";
        toast.error(`Failed to reload GVS variant: ${message}`);
      }
      return;
    }

    await load();
  }, [gvsSession, load, loadGvsVariant]);

  const handleCopyAllNames = useCallback(async () => {
    const names = gvsSession
      ? gvsSession.list.StageData.map((entry) => entry.name?.Utf8String ?? "")
      : loadState.status === "ready"
        ? loadState.list.StageData.map((entry) => entry.name?.Utf8String ?? "")
        : [];

    if (names.length === 0) {
      toast.error("No names available to copy");
      return;
    }

    await writeText(names.join("\n"));
    toast.success(`Copied ${names.length} names to clipboard`);
  }, [gvsSession, loadState]);

  const handleOpenGvsAssetDialog = useCallback(async () => {
    if (!gvsSession) {
      throw new Error("GVS variant is not active");
    }
    if (isCollectingGvsAssetBins) return;

    setIsGvsAssetDialogOpen(true);
    setIsCollectingGvsAssetBins(true);
    setGvsAssetExtractProgress({ current: 0, total: 0, currentFile: "" });
    setGvsAssetExtractSuccesses([]);
    setGvsAssetExtractFailures([]);
    setGvsAssetBinEntries([]);
    console.log("[GVS_ASSET_UI] open dialog and start collecting indexed bins", {
      gvsBinPath: gvsSession.filePath,
      searchDir: gvsSession.searchDir,
      stageCount: gvsSession.list.StageData.length,
    });
    try {
      const entries = await collectGvsImageAssetBinEntries(gvsSession.list, gvsSession.searchDir);
      const existingEntries = entries.filter((entry) => entry.exists);
      const paths = existingEntries.map((entry) => entry.path);
      setGvsAssetBinEntries(existingEntries);
      setGvsAssetBinPaths(paths);
      console.log("[GVS_ASSET_UI] collect complete", {
        totalResolved: entries.length,
        keptExistingCount: existingEntries.length,
        removedMissingCount: entries.length - existingEntries.length,
        sample: paths.slice(0, 10),
      });
      toast.success(
        `Collected ${paths.length} existing indexed bins (filtered ${entries.length - existingEntries.length} missing bins)`
      );
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to collect indexed bins: ${message}`);
      setGvsAssetBinEntries([]);
      setGvsAssetBinPaths([]);
    } finally {
      setIsCollectingGvsAssetBins(false);
    }
  }, [gvsSession, isCollectingGvsAssetBins]);

  const handleExtractAllGvsImageAssets = useCallback(async () => {
    if (!gvsSession) {
      throw new Error("GVS variant is not active");
    }
    if (!gvsAssetOutputDir.trim()) {
      toast.error("Please select an output directory");
      return;
    }
    if (isExtractingGvsAssets) return;

    const existingBinPaths = gvsAssetBinEntries.filter((entry) => entry.exists).map((entry) => entry.path);
    if (existingBinPaths.length === 0) {
      toast.error("No existing bin files available for extraction");
      return;
    }

    setIsExtractingGvsAssets(true);
    setGvsAssetExtractSuccesses([]);
    setGvsAssetExtractFailures([]);
    setGvsAssetExtractProgress({ current: 0, total: 0, currentFile: "" });
    console.log("[GVS_ASSET_UI] extraction start", {
      outputDir: gvsAssetOutputDir.trim(),
      binPathCount: gvsAssetBinPaths.length,
      existingBinCount: existingBinPaths.length,
      missingBinCount: 0,
      sample: existingBinPaths.slice(0, 10),
    });
    try {
      const result = await extractGvsImageAssetsToPng(existingBinPaths, gvsAssetOutputDir.trim(), (progress) => {
        console.log("[GVS_ASSET_UI] progress update", progress);
        setGvsAssetExtractProgress(progress);
      });
      setGvsAssetExtractSuccesses(result.successes);
      setGvsAssetExtractFailures(result.failures);
      console.log("[GVS_ASSET_UI] extraction done", {
        converted: result.converted,
        failed: result.failed,
      });

      if (result.converted > 0) {
        toast.success(`Extracted ${result.converted} PNG file(s)`);
      }
      if (result.failed > 0) {
        toast.error(`Failed to extract ${result.failed} file(s)`);
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to extract image assets: ${message}`);
    } finally {
      setIsExtractingGvsAssets(false);
    }
  }, [gvsSession, gvsAssetOutputDir, isExtractingGvsAssets, gvsAssetBinEntries, gvsAssetBinPaths]);

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

  const handleDebugBatch = useCallback(() => {
    if (loadState.status !== "ready") return;
    if (gvsSession !== null) return;

    const list = loadState.list;
    const sourceStage = list.StageData.find((s) => s.id === DEBUG_SOURCE_ID);
    if (!sourceStage) {
      toast.error(`Source stage id ${DEBUG_SOURCE_ID} not found`);
      return;
    }

    const maxId = Math.max(0, ...list.StageData.map((s) => s.id ?? 0));
    const maxUniqueIndex = Math.max(
      0,
      ...list.StageData.map((s) => (typeof s.uniqueIndex === "number" ? s.uniqueIndex : 0))
    );

    const newStages: StageDataEntry[] = [];
    let nextId = maxId + 1;
    let nextUniqueIndex = maxUniqueIndex + 1;

    for (const entry of DEBUG_BATCH_ENTRIES) {
      const fileNameValue = parseFileNameHex(entry.fileNameHex);
      const copiedStage: StageDataEntry = {
        ...sourceStage,
        id: nextId,
        uniqueIndex: nextUniqueIndex,
        name: buildNameData(entry.name),
        fileName: fileNameValue,
      };
      newStages.push(copiedStage);
      nextId += 1;
      nextUniqueIndex += 1;
    }

    const nextRows = [...list.StageData, ...newStages];
    const nextList = Object.assign(Object.create(Object.getPrototypeOf(list)), list, {
      StageData: nextRows,
      StageCount: nextRows.length,
    });

    handleEditorChange(nextList);
    toast.success(`Added ${newStages.length} debug stages from id ${DEBUG_SOURCE_ID}`);
  }, [loadState, gvsSession, handleEditorChange]);

  const stageIconBaseNameOrder = useMemo(() => {
    if (stageIconState.status !== "ready") return undefined;
    const primaryGroup = stageIconState.groups[0];
    if (!primaryGroup) return undefined;
    return primaryGroup.items.map((it) => it.name ?? null);
  }, [stageIconState]);

  const stageIconConvertDirPath = useMemo(() => {
    if (stageIconState.status !== "ready") return undefined;
    return stageIconState.groups[0]?.convertDirPath;
  }, [stageIconState]);

  const isGvsActive = gvsSession !== null;

  const fileMeta = useMemo(() => {
    if (gvsSession) {
      return {
        primary: `Loaded GVS: ${gvsSession.list.StageCount} entries, entry size ${gvsSession.list.StageDataEachSize}`,
        secondary: `Search Directory: ${gvsSession.searchDir}`,
      };
    }
    if (loadState.status !== "ready") return null;
    return {
      primary: `Loaded: ${loadState.list.StageCount} stages, ${loadState.list.CommandsCount} commands`,
      secondary: "",
    };
  }, [gvsSession, loadState]);

  const activeFilePath = gvsSession?.filePath ?? (loadState.status === "ready" ? loadState.filePath : "");

  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  if (!isGvsActive && loadState.status === "loading") {
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

  if (!isGvsActive && loadState.status === "error") {
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
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => void handleReloadActive()} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Reload
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsGvsDialogOpen(true)}
                disabled={isApplyingGvs}
                className="inline-flex items-center gap-2"
              >
                Gvs Load
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isGvsActive && loadState.status !== "ready") {
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
              <div className="flex items-center gap-2">
                <CardTitle>Stage List</CardTitle>
                {isGvsActive ? <Badge variant="secondary">GVS Variant</Badge> : null}
              </div>
              <div className="text-xs text-muted-foreground break-all mt-1 flex items-center gap-1">
                {isGvsActive ? "Stage List GVS" : "Stage List"}: {activeFilePath}
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
                <>
                  <div className="text-xs text-muted-foreground mt-1">{fileMeta.primary}</div>
                  {fileMeta.secondary ? <div className="text-xs text-muted-foreground mt-1 break-all">{fileMeta.secondary}</div> : null}
                </>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void handleReloadActive()} className="inline-flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Reload
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handlePickImportStageJson()}
                  disabled={isImporting || isGvsActive || loadState.status !== "ready"}
                  className="inline-flex items-center gap-2"
                  title={isGvsActive ? "Not available in GVS variant view" : "Import stages from JSON"}
                >
                  <Upload className="w-4 h-4" />
                  Import JSON
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleExportStageJson()}
                  disabled={isExporting || isGvsActive || loadState.status !== "ready" || loadState.list.StageData.length === 0}
                  className="inline-flex items-center gap-2"
                  title={isGvsActive ? "Not available in GVS variant view" : "Export all stages to JSON"}
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
                  variant="outline"
                  onClick={() => handleDebugBatch()}
                  disabled={gvsSession !== null || loadState.status !== "ready"}
                  className="inline-flex items-center gap-2"
                  title={`Copy as new from id ${DEBUG_SOURCE_ID} with predefined GVS entries`}
                >
                  <Bug className="w-4 h-4" />
                  Debug
                </Button>
                {isGvsActive ? (
                  <Button size="sm" variant="outline" onClick={() => setGvsSession(null)}>
                    Back To Main
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => void handleSaveFile()}
                  disabled={!hasChanges || isGvsActive}
                  className="inline-flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save File
                </Button>
              </div>

              <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                <span className="text-[11px] font-medium text-muted-foreground">GVS</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleCopyAllNames()}
                  disabled={!isGvsActive && loadState.status !== "ready"}
                >
                  Copy All Name
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsGvsDialogOpen(true)}
                  disabled={isApplyingGvs}
                  className="inline-flex items-center gap-2"
                  title="Load Stage List GVS variant"
                >
                  Gvs Load
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleOpenGvsAssetDialog()}
                  disabled={!isGvsActive || isCollectingGvsAssetBins}
                  className="inline-flex items-center gap-2"
                >
                  <Image className="w-4 h-4" />
                  Extract All Image Assets
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 p-0">
          {isGvsActive && gvsSession ? (
            <StageGvsViewer
              stageListData={gvsSession.list}
              selectedIndex={gvsSelectedIndex}
              onSelectChange={setGvsSelectedIndex}
              sortKey={gvsSortKey}
              onSortKeyChange={setGvsSortKey}
              searchInputValue={gvsSearchInputValue}
              searchTerm={gvsSearchTerm}
              onSearchInputChange={setGvsSearchInputValue}
              onSearchTermChange={setGvsSearchTerm}
              isComposing={gvsIsComposing}
              onComposingChange={setGvsIsComposing}
              searchDir={gvsSession.searchDir}
            />
          ) : (
            <StageEditor
              stageListData={loadState.status === "ready" ? loadState.list : null}
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
              stageIconConvertDirPath={stageIconConvertDirPath}
              stageIconBaseNameOrder={stageIconBaseNameOrder}
              stageIconIndexPickerGroups={stageIconState.status === "ready" ? stageIconState.groups : []}
              stageIconIndexPickerLoading={stageIconState.status === "loading" || stageIconState.status === "idle"}
              stageIconIndexPickerError={
                stageIconState.status === "error" ? stageIconState.message : null
              }
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Info</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-2">
                <p>Auto-loads {STAGE_LIST_HASH}/stage_list.bin from the selected folder.</p>
                <p>Each stage entry has fields including iconIndex for the Stage Icon List.</p>
                <p>Use FHM2D Init to extract stage_list.bin from the source fhm2d file.</p>
                <p>Gvs Load loads a variant file with magic A9 B8 AB CE in a separate read-only viewer.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={isGvsDialogOpen} onOpenChange={setIsGvsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Load Stage List GVS Variant</DialogTitle>
            <DialogDescription>
              Select the GVS `stage_list.bin` variant and a search directory, then apply it to the Stage List viewer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="gvs-bin-path">GVS stage_list.bin</Label>
              <FilePathInput
                id="gvs-bin-path"
                value={gvsBinPath}
                onChange={(e) => setGvsBinPath(e.target.value)}
                storeKey="stageListGvsBinPath"
                picker={{
                  kind: "file",
                  title: "Select GVS stage_list.bin",
                  filters: [{ name: "BIN Files", extensions: ["bin"] }],
                  defaultPathKey: "stageListGvsBinPath",
                }}
                placeholder="Select a GVS stage_list.bin file"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gvs-search-dir">Search Directory</Label>
              <FilePathInput
                id="gvs-search-dir"
                value={gvsSearchDir}
                onChange={(e) => setGvsSearchDir(e.target.value)}
                storeKey="stageListGvsSearchDir"
                picker={{
                  kind: "folder",
                  title: "Select GVS search directory",
                  defaultPathKey: "stageListGvsSearchDir",
                }}
                placeholder="Select a search directory"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGvsDialogOpen(false)} disabled={isApplyingGvs}>
              Cancel
            </Button>
            <Button onClick={() => void handleApplyGvsVariant()} disabled={isApplyingGvs}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isGvsAssetDialogOpen} onOpenChange={setIsGvsAssetDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Extract All Image Assets</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1">
                <div>This operation automatically extracts nutexb assets and converts them to PNG in the selected output directory.</div>
                <div>PNG file names use the internal nutexb names, not the nutexb index names.</div>
                <div>Temporary files are written under `_gvs_extract_temp` inside the output directory.</div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gvs-asset-output-dir">Output Directory</Label>
              <FilePathInput
                id="gvs-asset-output-dir"
                value={gvsAssetOutputDir}
                onChange={(e) => setGvsAssetOutputDir(e.target.value)}
                storeKey="stageListGvsAssetOutputDir"
                picker={{
                  kind: "folder",
                  title: "Select output directory",
                  defaultPathKey: "stageListGvsAssetOutputDir",
                }}
                placeholder="Select output directory"
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Pending BIN Paths (Deduplicated)</div>
              <div className="text-xs text-muted-foreground">
                Total BIN files: {gvsAssetBinPaths.length}
              </div>
              <div className="max-h-40 overflow-auto rounded border p-2 text-xs font-mono whitespace-pre-wrap break-all">
                {isCollectingGvsAssetBins
                  ? "Collecting indexed bin paths..."
                  : gvsAssetBinPaths.length > 0
                    ? gvsAssetBinPaths.join("\n")
                    : "No indexed bin paths collected"}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Conversion Progress</div>
              <Progress
                value={
                  gvsAssetExtractProgress.total > 0
                    ? Math.round((gvsAssetExtractProgress.current / gvsAssetExtractProgress.total) * 100)
                    : 0
                }
              />
              <div className="text-xs text-muted-foreground">
                {gvsAssetExtractProgress.current} / {gvsAssetExtractProgress.total}
                {gvsAssetExtractProgress.currentFile ? ` · ${gvsAssetExtractProgress.currentFile}` : ""}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Success ({gvsAssetExtractSuccesses.length})</div>
                <div className="max-h-36 overflow-auto rounded border p-2 text-xs font-mono whitespace-pre-wrap break-all">
                  {gvsAssetExtractSuccesses.length > 0
                    ? gvsAssetExtractSuccesses.map((item) => item.outputPngPath).join("\n")
                    : "No success records"}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Failed ({gvsAssetExtractFailures.length})</div>
                <div className="max-h-36 overflow-auto rounded border p-2 text-xs font-mono whitespace-pre-wrap break-all">
                  {gvsAssetExtractFailures.length > 0
                    ? gvsAssetExtractFailures.map((item) => `${item.sourceBinPath} :: ${item.target} :: ${item.reason}`).join("\n")
                    : "No failure records"}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGvsAssetDialogOpen(false)} disabled={isExtractingGvsAssets}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsGvsBinStatusDialogOpen(true)}
              disabled={isCollectingGvsAssetBins || gvsAssetBinEntries.length === 0}
            >
              Bin Extraction Status
            </Button>
            <Button
              onClick={() => void handleExtractAllGvsImageAssets()}
              disabled={
                isExtractingGvsAssets ||
                isCollectingGvsAssetBins ||
                gvsAssetBinEntries.filter((entry) => entry.exists).length === 0
              }
            >
              Start Extract and Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isGvsBinStatusDialogOpen} onOpenChange={setIsGvsBinStatusDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Bin Extraction Status</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1">
                <div>Indexed BIN paths are resolved from GVS hash fields.</div>
                <div>This view already excludes missing BIN paths.</div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Total Existing BIN files: {gvsAssetBinEntries.length}
            </div>
            <div className="max-h-96 overflow-auto rounded border p-2 text-xs font-mono whitespace-pre-wrap break-all">
              {gvsAssetBinEntries.length > 0
                ? gvsAssetBinEntries
                    .map((entry) => `[OK] ${entry.path}`)
                    .join("\n")
                : "No indexed BIN paths collected"}
            </div>
          </div>
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
