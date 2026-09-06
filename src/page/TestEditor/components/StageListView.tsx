import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { exists, readFile, readTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { dirname, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Buffer } from "buffer";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { RefreshCw, Save, FolderOpen, Info, Upload, Download, Image, Bug } from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { StageListGVS } from "@/models/stageList";
import type { StageListData, StageListEntry } from "@/models/stageListEntry";
import { useConfigStore } from "@/store/configStore";
import { useResourceRegistry } from "@/hooks/useResourceRegistry";
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
import {
  resolveWorkspaceContent,
  type WorkspaceContentId,
} from "@/services/testEditorWorkspace/contentCatalog";
import { promptAndMigrateWorkspaceContentIfNeeded } from "@/services/testEditorWorkspace/contentMigration";
import { resolveWorkspaceRouteRoot } from "@/services/testEditorWorkspace/paths";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { LegacyWorkspaceMoveNotice } from "./workspace-layout/LegacyWorkspaceMoveNotice";
import { CatalogPackToolbarButtons } from "./workspace-layout/CatalogPackToolbarButtons";

const STAGE_LIST_HASH = "0xCE74091E";
const STAGE_INFO_MODAL_DIMENSIONS = {
  width: 560,
  height: 380,
  minWidth: 440,
  minHeight: 300,
};
const STAGE_GVS_LOAD_MODAL_DIMENSIONS = {
  width: 640,
  height: 460,
  minWidth: 520,
  minHeight: 360,
};
const STAGE_GVS_ASSET_MODAL_DIMENSIONS = {
  width: 920,
  height: 760,
  minWidth: 720,
  minHeight: 540,
};
const STAGE_GVS_BIN_STATUS_MODAL_DIMENSIONS = {
  width: 900,
  height: 640,
  minWidth: 660,
  minHeight: 460,
};
const STAGE_IMPORT_MODAL_DIMENSIONS = {
  width: 720,
  height: 560,
  minWidth: 560,
  minHeight: 420,
};

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

interface StageListViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onRevealTreeFolder?: (path: string) => void;
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
      list: StageListData;
    };

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

export default function StageListView({
  folderPath,
  isActive,
  onUnsavedChanges,
  onRevealTreeFolder,
  workspaceDocument,
}: StageListViewProps) {
  const { t } = useTranslation("test-stage-list-view");
  const getSetting = useConfigStore((s) => s.getSetting);
  const catalogPackLabels = useMemo(
    () => ({
      initPack: t("actions.initPack"),
      initializing: t("actions.initializing"),
      renameZeroBin: t("actions.renameZeroBin"),
      renaming: t("actions.renaming"),
      setObDplcacheInit: t("errors.setObDplcacheInit"),
      unpacked: t("toast.unpacked"),
      alreadyNamed: t("toast.alreadyNamed"),
      formatRenamed: (names: string) => t("toast.renamedFiles", { names }),
    }),
    [t],
  );
  const resourceRegistry = useResourceRegistry(folderPath || null);
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
  const [sortKey, setSortKey] = useState<StageListSortKey>("selectOrderDefault");
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
  const [stageModelRouteRootPath, setStageModelRouteRootPath] = useState("");
  const lastLoadedKeyRef = useRef<string>("");

  const resolveContent = useCallback(
    async (id: WorkspaceContentId) => {
      return await promptAndMigrateWorkspaceContentIfNeeded(
        await resolveWorkspaceContent(folderPath, workspaceDocument, id),
      );
    },
    [folderPath, workspaceDocument],
  );

  const resolveContentFilePath = useCallback(
    async (id: WorkspaceContentId) => {
      const content = await resolveContent(id);
      return {
        content,
        filePath: content.existing?.filePath ?? content.configured.filePath,
      };
    },
    [resolveContent],
  );

  const resolveContentPackPaths = useCallback(
    async (id: WorkspaceContentId) => {
      const content = await resolveContent(id);
      const pack = content.existing ?? content.configured;
      return { content, pack };
    },
    [resolveContent],
  );

  const loadStageIconCount = useCallback(async () => {
    if (!folderPath) {
      setStageIconState({ status: "error", message: t("errors.folderPathEmpty") });
      return;
    }

    setStageIconState({ status: "loading" });
    try {
      const groupDefs: Array<{ key: string; title: string; id: WorkspaceContentId }> = [
        { key: "first", title: t("iconGroup.first"), id: "stage-icons-primary" },
        { key: "second", title: t("iconGroup.second"), id: "stage-icons-secondary" },
      ];
      const groups = await Promise.all(
        groupDefs.map(async (def) => {
          const { pack } = await resolveContentPackPaths(def.id);
          const dirPath = await join(pack.folderPath, "__convert");
          const structurePath = pack.structureJsonPath;
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
        message: error instanceof Error ? error.message : t("errors.unknown"),
      });
    }
  }, [folderPath, resolveContentPackPaths, t]);

  const resetEditorState = useCallback(() => {
    setHasChanges(false);
    onUnsavedChanges?.(false);
  }, [onUnsavedChanges]);

  const load = useCallback(async () => {
    if (!folderPath) {
      setLoadState({ status: "error", filePath: "", message: t("errors.folderPathEmpty") });
      resetEditorState();
      return;
    }

    const { content, filePath } = await resolveContentFilePath("stage-list");
    if (!filePath) {
      setLoadState({ status: "error", filePath: "", message: t("errors.contentPathNotConfigured") });
      resetEditorState();
      return;
    }

    setLoadState({ status: "loading" });
    try {
      const list = await invoke<StageListData>("parse_typed_param_file", {
        path: filePath,
        paramType: "stagelist",
      });
      setLoadState({
        status: "ready",
        filePath,
        configuredFilePath: content.configured.filePath ?? "",
        sourceLayout: content.sourceLayout,
        writable: content.writable,
        list,
      });
      resetEditorState();
      setSelectedIndex((prev) => {
        const len = list.entries.length;
        if (len === 0) return -1;
        return prev < 0 ? prev : Math.min(prev, len - 1);
      });
    } catch (error) {
      console.error(error);
      setLoadState({
        status: "error",
        filePath,
        message: error instanceof Error ? error.message : t("errors.unknown"),
      });
      resetEditorState();
    }
  }, [folderPath, resetEditorState, resolveContentFilePath]);

  useEffect(() => {
    const loadConfig = async () => {
      setObDplCachePath((await getSetting<string>("obDplCachePath")) || "");
      setObModPath((await getSetting<string>("obModPath")) || "");
    };
    void loadConfig();
  }, [getSetting]);

  useEffect(() => {
    if (!isActive) return;
    const key = [
      folderPath,
      workspaceDocument.assetRoutes["list.stage"]?.prefix ?? "",
      workspaceDocument.legacyReadFallback ? "legacy-on" : "legacy-off",
      "stagelist",
    ].join("::");
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load();
  }, [folderPath, isActive, load, workspaceDocument]);

  useEffect(() => {
    if (!isActive) return;
    if (!folderPath) return;
    void loadStageIconCount();
  }, [folderPath, isActive, loadStageIconCount, workspaceDocument]);

  useEffect(() => {
    if (!folderPath) {
      setStageModelRouteRootPath("");
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const routeRootPath = await resolveWorkspaceRouteRoot(folderPath, workspaceDocument, "stage.model");
        if (!cancelled) {
          setStageModelRouteRootPath(routeRootPath);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setStageModelRouteRootPath(folderPath);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [folderPath, workspaceDocument]);

  const handleEditorChange = useCallback(
    (next: StageListData) => {
      if (loadState.status !== "ready" || !loadState.writable) return;
      setLoadState((prev) => {
        if (prev.status !== "ready") return prev;
        return { ...prev, list: next };
      });
      setHasChanges(true);
      onUnsavedChanges?.(true);
    },
    [loadState, onUnsavedChanges]
  );

  const handleSaveFile = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error(t("errors.legacyReadOnly"));
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

      const sortedRows = [...loadState.list.entries].sort((a, b) => {
        const aIsPositive = (a.entryId ?? 0) >= 0;
        const bIsPositive = (b.entryId ?? 0) >= 0;
        if (aIsPositive !== bIsPositive) return aIsPositive ? -1 : 1;
        return (a.entryId ?? 0) - (b.entryId ?? 0);
      });
      const sortedList: StageListData = {
        ...loadState.list,
        entries: sortedRows,
        header: { ...loadState.list.header, entryCount: sortedRows.length },
      };
      await invoke("build_typed_param_file", {
        dataJson: sortedList,
        outputPath: filePath,
        paramType: "stagelist",
      });
      toast.success(t("toast.saved"));
      setHasChanges(false);
      onUnsavedChanges?.(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(t("errors.saveFailed"));
    }
  }, [loadState, load, onUnsavedChanges]);

  const handleOpenPath = useCallback(async (rawPath: string) => {
    try {
      const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(rawPath) || rawPath.startsWith("\\\\");
      const normalizedPath = isWindowsPath ? rawPath.replace(/\//g, "\\") : rawPath.replace(/\\/g, "/");

      if (normalizedPath.includes('"')) {
        toast.error(t("errors.invalidQuotePath"));
        return;
      }

      const pathExists = await exists(normalizedPath);
      if (!pathExists) {
      toast.error(t("errors.pathMissing"));
        return;
      }

      await openPath(normalizedPath);
    } catch (error) {
      console.error("Error opening path:", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message ? t("errors.openFailedWithMessage", { message }) : t("errors.openFailed"));
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
      throw new Error(t("errors.gvsFileMissing"));
    }

    const dirExists = await exists(searchDir);
    if (!dirExists) {
      throw new Error(t("errors.searchDirMissing"));
    }

    const fileData = await readFile(filePath);
    const list = new StageListGVS(Buffer.from(fileData));
    setGvsSession({ filePath, searchDir, list });
    setGvsSelectedIndex(list.StageData.length > 0 ? 0 : -1);
    setGvsSortKey("index");
    setGvsSearchInputValue("");
    setGvsSearchTerm("");
    setGvsIsComposing(false);
  }, [t]);

  const handleApplyGvsVariant = useCallback(async () => {
    if (!gvsBinPath.trim()) {
      toast.error(t("errors.selectGvsFile"));
      return;
    }
    if (!gvsSearchDir.trim()) {
      toast.error(t("errors.selectSearchDir"));
      return;
    }
    if (isApplyingGvs) return;

    setIsApplyingGvs(true);
    try {
      await loadGvsVariant(gvsBinPath.trim(), gvsSearchDir.trim());
      setIsGvsDialogOpen(false);
      toast.success(t("toast.loadedGvs"));
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : t("errors.unknown");
      toast.error(t("errors.loadGvsFailed", { message }));
    } finally {
      setIsApplyingGvs(false);
    }
  }, [gvsBinPath, gvsSearchDir, isApplyingGvs, loadGvsVariant, t]);

  const handleReloadActive = useCallback(async () => {
    if (gvsSession) {
      try {
        await loadGvsVariant(gvsSession.filePath, gvsSession.searchDir);
        toast.success(t("toast.reloadedGvs"));
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : t("errors.unknown");
        toast.error(t("errors.reloadGvsFailed", { message }));
      }
      return;
    }

    await load();
  }, [gvsSession, load, loadGvsVariant, t]);

  const handleCopyAllNames = useCallback(async () => {
    const names = gvsSession
      ? gvsSession.list.StageData.map((entry) => entry.name?.Utf8String ?? "")
      : loadState.status === "ready"
        ? loadState.list.entries.map((entry) => entry.name ?? "")
        : [];

    if (names.length === 0) {
      toast.error(t("errors.noNamesToCopy"));
      return;
    }

    await writeText(names.join("\n"));
    toast.success(t("toast.copiedNames", { count: names.length }));
  }, [gvsSession, loadState, t]);

  const handleOpenGvsAssetDialog = useCallback(async () => {
    if (!gvsSession) {
      throw new Error(t("errors.gvsNotActive"));
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
        t("toast.collectedBins", { existing: paths.length, missing: entries.length - existingEntries.length })
      );
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : t("errors.unknown");
      toast.error(t("errors.collectBinsFailed", { message }));
      setGvsAssetBinEntries([]);
      setGvsAssetBinPaths([]);
    } finally {
      setIsCollectingGvsAssetBins(false);
    }
  }, [gvsSession, isCollectingGvsAssetBins, t]);

  const handleExtractAllGvsImageAssets = useCallback(async () => {
    if (!gvsSession) {
      throw new Error(t("errors.gvsNotActive"));
    }
    if (!gvsAssetOutputDir.trim()) {
      toast.error(t("errors.selectOutputDir"));
      return;
    }
    if (isExtractingGvsAssets) return;

    const existingBinPaths = gvsAssetBinEntries.filter((entry) => entry.exists).map((entry) => entry.path);
    if (existingBinPaths.length === 0) {
      toast.error(t("errors.noExistingBins"));
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
        toast.success(t("toast.extractedPng", { count: result.converted }));
      }
      if (result.failed > 0) {
        toast.error(t("errors.extractFailedCount", { count: result.failed }));
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : t("errors.unknown");
      toast.error(t("errors.extractAssetsFailed", { message }));
    } finally {
      setIsExtractingGvsAssets(false);
    }
  }, [gvsSession, gvsAssetOutputDir, isExtractingGvsAssets, gvsAssetBinEntries, gvsAssetBinPaths, t]);

  const handleExportStageJson = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (isExporting) return;

    setIsExporting(true);
    try {
      const result = await exportStageJsonToFile(loadState.list.entries);
      if (!result) return;
      toast.success(t("toast.exportedStages", { count: result.count }));
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : t("errors.unknown");
      toast.error(t("errors.exportFailed", { message }));
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, loadState, t]);

  const handlePickImportStageJson = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error(t("errors.legacyReadOnly"));
      return;
    }
    if (isImporting) return;

    setIsImporting(true);
    try {
      const preview = await pickStageJsonImportPreview();
      if (!preview) return;

      if (preview.validCount === 0) {
        toast.error(t("errors.invalidJson"));
        return;
      }

      setImportPreview(preview);
      setIsImportDialogOpen(true);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : t("errors.unknown");
      toast.error(t("errors.importFailed", { message }));
    } finally {
      setIsImporting(false);
    }
  }, [isImporting, loadState, t]);

  const handleConfirmImport = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error(t("errors.legacyReadOnly"));
      return;
    }
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
      toast.success(t("toast.importedStages", { count: importPreview.validCount }));
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : t("errors.unknown");
      toast.error(t("errors.applyImportFailed", { message }));
    } finally {
      setIsImporting(false);
    }
  }, [importPreview, isImporting, loadState, onUnsavedChanges, t]);

  const handleDebugBatch = useCallback(() => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error(t("errors.legacyReadOnly"));
      return;
    }
    if (gvsSession !== null) return;

    const list = loadState.list;
    const sourceStage = list.entries.find((s) => s.entryId === DEBUG_SOURCE_ID);
    if (!sourceStage) {
      toast.error(t("errors.sourceStageMissing", { id: DEBUG_SOURCE_ID }));
      return;
    }

    const maxId = Math.max(0, ...list.entries.map((s) => s.entryId ?? 0));
    const maxSelectOrder = Math.max(
      0,
      ...list.entries.map((s) => (typeof s.selectOrderDefault === "number" ? s.selectOrderDefault : 0))
    );

    const newStages: StageListEntry[] = [];
    let nextId = maxId + 1;
    let nextSelectOrder = maxSelectOrder + 1;

    for (const entry of DEBUG_BATCH_ENTRIES) {
      const fileNameValue = parseFileNameHex(entry.fileNameHex);
      const copiedStage: StageListEntry = {
        ...sourceStage,
        entryId: nextId,
        selectOrderDefault: nextSelectOrder,
        name: entry.name,
        fileName: fileNameValue,
      };
      newStages.push(copiedStage);
      nextId += 1;
      nextSelectOrder += 1;
    }

    const nextRows = [...list.entries, ...newStages];
    const nextList: StageListData = {
      ...list,
      entries: nextRows,
      header: { ...list.header, entryCount: nextRows.length },
    };

    handleEditorChange(nextList);
    toast.success(t("debugStagesAdded", { count: newStages.length, id: DEBUG_SOURCE_ID }));
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
        primary: t("status.loadedGvs", { count: gvsSession.list.StageCount, size: gvsSession.list.StageDataEachSize }),
        secondary: t("status.searchDirectory", { path: gvsSession.searchDir }),
      };
    }
    if (loadState.status !== "ready") return null;
    return {
      primary: t("status.loaded", { count: loadState.list.entries.length, commands: loadState.list.header.commandsCount }),
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
            <CardTitle>{t("title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <div className="text-sm text-muted-foreground">{t("loading")}</div>
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
                <div className="break-all">{t("errors.folderPathEmpty")}</div>
              )}
            </div>
            <div className="text-sm text-destructive">{loadState.message}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={() => void handleReloadActive()} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                {t("actions.reload")}
              </Button>
              <CatalogPackToolbarButtons
                contentId="stage-list"
                folderPath={folderPath}
                workspaceDocument={workspaceDocument}
                dplCachePath={obDplCachePath}
                reload={load}
                labels={catalogPackLabels}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsGvsDialogOpen(true)}
                disabled={isApplyingGvs}
                className="inline-flex items-center gap-2"
              >
                {t("actions.gvsLoad")}
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
        {t("selectTabToLoad")}
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
                <CardTitle>{t("title")}</CardTitle>
                {isGvsActive ? <Badge variant="secondary">{t("gvsVariant")}</Badge> : null}
              </div>
              <div className="text-xs text-muted-foreground break-all mt-1 flex items-center gap-1">
                {isGvsActive ? t("stageListGvs") : t("title")}: {activeFilePath}
                <button
                  type="button"
                  onClick={() => void handleOpenStageListFolder()}
                  className="shrink-0 p-0.5 rounded hover:bg-accent hover:text-accent-foreground"
                  title={t("actions.openFolder")}
                  aria-label={t("actions.openFolder")}
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
              {!isGvsActive && loadState.status === "ready" ? (
                <LegacyWorkspaceMoveNotice
                  workspaceRoot={folderPath}
                  workspaceDocument={workspaceDocument}
                  contentId="stage-list"
                  sourceLayout={loadState.sourceLayout}
                  configuredPath={loadState.configuredFilePath}
                  onMoved={load}
                  className="mt-2"
                />
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void handleReloadActive()} className="inline-flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  {t("actions.reload")}
                </Button>
                <CatalogPackToolbarButtons
                  contentId="stage-list"
                  folderPath={folderPath}
                  workspaceDocument={workspaceDocument}
                  dplCachePath={obDplCachePath}
                  reload={load}
                  labels={catalogPackLabels}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handlePickImportStageJson()}
                  disabled={isImporting || isGvsActive || loadState.status !== "ready" || !loadState.writable}
                  className="inline-flex items-center gap-2"
                  title={isGvsActive ? t("errors.unavailableGvs") : t("actions.importStagesTitle")}
                >
                  <Upload className="w-4 h-4" />
                  {t("actions.importJson")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleExportStageJson()}
                  disabled={isExporting || isGvsActive || loadState.status !== "ready" || loadState.list.entries.length === 0}
                  className="inline-flex items-center gap-2"
                  title={isGvsActive ? t("errors.unavailableGvs") : t("actions.exportStagesTitle")}
                >
                  <Download className="w-4 h-4" />
                  {t("actions.exportJson")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsInfoDialogOpen(true)}
                  className="inline-flex items-center gap-2"
                >
                  <Info className="w-4 h-4" />
                  {t("actions.info")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDebugBatch()}
                  disabled={gvsSession !== null || loadState.status !== "ready" || !loadState.writable}
                  className="inline-flex items-center gap-2"
                  title={t("actions.debugTitle", { id: DEBUG_SOURCE_ID })}
                >
                  <Bug className="w-4 h-4" />
                  {t("actions.debug")}
                </Button>
                {isGvsActive ? (
                  <Button size="sm" variant="outline" onClick={() => setGvsSession(null)}>
                    {t("actions.backToMain")}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => void handleSaveFile()}
                  disabled={!hasChanges || isGvsActive || loadState.status !== "ready" || !loadState.writable}
                  className="inline-flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {t("actions.saveFile")}
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
                {t("actions.copyAllNames")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsGvsDialogOpen(true)}
                  disabled={isApplyingGvs}
                  className="inline-flex items-center gap-2"
                  title={t("gvsLoad.title")}
                >
                  {t("actions.gvsLoad")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleOpenGvsAssetDialog()}
                  disabled={!isGvsActive || isCollectingGvsAssetBins}
                  className="inline-flex items-center gap-2"
                >
                  <Image className="w-4 h-4" />
                  {t("actions.extractAllAssets")}
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
              editable={loadState.status === "ready" ? loadState.writable : false}
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
              workspaceRootPath={folderPath}
              stageModelRouteRootPath={stageModelRouteRootPath || folderPath}
              workspaceDocument={workspaceDocument}
              onReveal={onRevealTreeFolder}
              onChange={handleEditorChange}
              stageIconConvertDirPath={stageIconConvertDirPath}
              stageIconBaseNameOrder={stageIconBaseNameOrder}
              stageIconIndexPickerGroups={stageIconState.status === "ready" ? stageIconState.groups : []}
              stageIconIndexPickerLoading={stageIconState.status === "loading" || stageIconState.status === "idle"}
              stageIconIndexPickerError={
                stageIconState.status === "error" ? stageIconState.message : null
              }
              resourceRegistry={resourceRegistry}
            />
          )}
        </CardContent>
      </Card>

      {isInfoDialogOpen ? (
        <AppRndModalShell
          titleId="stage-list-info-title"
          title={t("actions.info")}
          headerIcon={<Info className="h-5 w-5 text-primary" />}
          dimensions={STAGE_INFO_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.stage-list-info"
          onClose={() => setIsInfoDialogOpen(false)}
        >
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-6 text-sm text-muted-foreground">
            <p>{t("info.autoLoads", { hash: STAGE_LIST_HASH })}</p>
            <p>{t("info.fields")}</p>
            <p>{t("info.fhm2d")}</p>
            <p>{t("info.gvsMagic")}</p>
          </div>
        </AppRndModalShell>
      ) : null}

      {isGvsDialogOpen ? (
        <AppRndModalShell
          titleId="stage-gvs-load-title"
          title={t("gvsLoad.title")}
          subtitle={t("gvsLoad.subtitle")}
          headerIcon={<FolderOpen className="h-5 w-5 text-primary" />}
          dimensions={STAGE_GVS_LOAD_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.stage-gvs-load"
          onClose={() => setIsGvsDialogOpen(false)}
          closeDisabled={isApplyingGvs}
          footer={
            <div className="flex justify-end gap-2 bg-background px-6 py-4">
              <Button variant="outline" onClick={() => setIsGvsDialogOpen(false)} disabled={isApplyingGvs}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => void handleApplyGvsVariant()} disabled={isApplyingGvs}>
                {t("common.apply")}
              </Button>
            </div>
          }
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            <div className="space-y-2">
                <Label htmlFor="gvs-bin-path">{t("gvsLoad.binLabel")}</Label>
              <FilePathInput
                id="gvs-bin-path"
                value={gvsBinPath}
                onChange={(e) => setGvsBinPath(e.target.value)}
                storeKey="stageListGvsBinPath"
                picker={{
                  kind: "file",
                  title: t("gvsLoad.binPickerTitle"),
                  filters: [{ name: "BIN Files", extensions: ["bin"] }],
                  defaultPathKey: "stageListGvsBinPath",
                }}
                placeholder={t("gvsLoad.binPlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gvs-search-dir">{t("gvsLoad.searchLabel")}</Label>
              <FilePathInput
                id="gvs-search-dir"
                value={gvsSearchDir}
                onChange={(e) => setGvsSearchDir(e.target.value)}
                storeKey="stageListGvsSearchDir"
                picker={{
                  kind: "folder",
                  title: t("gvsLoad.searchPickerTitle"),
                  defaultPathKey: "stageListGvsSearchDir",
                }}
                placeholder={t("gvsLoad.searchPlaceholder")}
              />
            </div>
          </div>
        </AppRndModalShell>
      ) : null}

      {isGvsAssetDialogOpen ? (
        <AppRndModalShell
          titleId="stage-gvs-asset-extract-title"
          title={t("actions.extractAllAssets")}
          subtitle={t("assets.subtitle")}
          headerIcon={<Image className="h-5 w-5 text-primary" />}
          dimensions={STAGE_GVS_ASSET_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.stage-gvs-asset-extract"
          onClose={() => setIsGvsAssetDialogOpen(false)}
          closeDisabled={isExtractingGvsAssets}
          footer={
            <div className="flex flex-wrap justify-end gap-2 bg-background px-6 py-4">
              <Button variant="outline" onClick={() => setIsGvsAssetDialogOpen(false)} disabled={isExtractingGvsAssets}>
                {t("common.close")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsGvsBinStatusDialogOpen(true)}
                disabled={isCollectingGvsAssetBins || gvsAssetBinEntries.length === 0}
              >
                {t("actions.binExtractionStatus")}
              </Button>
              <Button
                onClick={() => void handleExtractAllGvsImageAssets()}
                disabled={
                  isExtractingGvsAssets ||
                  isCollectingGvsAssetBins ||
                  gvsAssetBinEntries.filter((entry) => entry.exists).length === 0
                }
              >
                {t("assets.startExtract")}
              </Button>
            </div>
          }
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>{t("assets.namingNote")}</div>
              <div>{t("assets.tempNote")}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gvs-asset-output-dir">{t("assets.outputLabel")}</Label>
              <FilePathInput
                id="gvs-asset-output-dir"
                value={gvsAssetOutputDir}
                onChange={(e) => setGvsAssetOutputDir(e.target.value)}
                storeKey="stageListGvsAssetOutputDir"
                picker={{
                  kind: "folder",
                  title: t("assets.outputPickerTitle"),
                  defaultPathKey: "stageListGvsAssetOutputDir",
                }}
                placeholder={t("assets.outputPlaceholder")}
              />
            </div>

            <div className="space-y-2">
                <div className="text-sm font-medium">{t("assets.pendingPaths")}</div>
              <div className="text-xs text-muted-foreground">
                {t("assets.totalBins", { count: gvsAssetBinPaths.length })}
              </div>
              <div className="max-h-40 overflow-auto rounded border p-2 text-xs font-mono whitespace-pre-wrap break-all">
                {isCollectingGvsAssetBins
                  ? t("assets.collectingPaths")
                  : gvsAssetBinPaths.length > 0
                    ? gvsAssetBinPaths.join("\n")
                    : t("assets.noPaths")}
              </div>
            </div>

            <div className="space-y-2">
                <div className="text-sm font-medium">{t("assets.progress")}</div>
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
                <div className="text-sm font-medium">{t("assets.success", { count: gvsAssetExtractSuccesses.length })}</div>
                <div className="max-h-36 overflow-auto rounded border p-2 text-xs font-mono whitespace-pre-wrap break-all">
                  {gvsAssetExtractSuccesses.length > 0
                    ? gvsAssetExtractSuccesses.map((item) => item.outputPngPath).join("\n")
                    : t("assets.noSuccess")}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">{t("assets.failed", { count: gvsAssetExtractFailures.length })}</div>
                <div className="max-h-36 overflow-auto rounded border p-2 text-xs font-mono whitespace-pre-wrap break-all">
                  {gvsAssetExtractFailures.length > 0
                    ? gvsAssetExtractFailures.map((item) => `${item.sourceBinPath} :: ${item.target} :: ${item.reason}`).join("\n")
                    : t("assets.noFailure")}
                </div>
              </div>
            </div>
          </div>
        </AppRndModalShell>
      ) : null}

      {isGvsBinStatusDialogOpen ? (
        <AppRndModalShell
          titleId="stage-gvs-bin-status-title"
          title={t("actions.binExtractionStatus")}
          subtitle={t("binStatus.subtitle")}
          headerIcon={<Image className="h-5 w-5 text-primary" />}
          dimensions={STAGE_GVS_BIN_STATUS_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.stage-gvs-bin-status"
          onClose={() => setIsGvsBinStatusDialogOpen(false)}
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-6">
            <div className="text-xs text-muted-foreground">{t("binStatus.excludesMissing")}</div>
            <div className="text-sm text-muted-foreground">
              {t("binStatus.totalExisting", { count: gvsAssetBinEntries.length })}
            </div>
            <div className="max-h-96 overflow-auto rounded border p-2 text-xs font-mono whitespace-pre-wrap break-all">
              {gvsAssetBinEntries.length > 0
                ? gvsAssetBinEntries
                    .map((entry) => `[OK] ${entry.path}`)
                    .join("\n")
                : t("assets.noPaths")}
            </div>
          </div>
        </AppRndModalShell>
      ) : null}

      {isImportDialogOpen ? (
        <AppRndModalShell
          titleId="stage-list-import-title"
          title={t("import.title")}
          subtitle={importPreview ? t("import.validSummary", { valid: importPreview.validCount, total: importPreview.totalCount }) : t("import.noFile")}
          headerIcon={<Upload className="h-5 w-5 text-primary" />}
          dimensions={STAGE_IMPORT_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.stage-list-import"
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
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => void handleConfirmImport()}
                disabled={
                  loadState.status !== "ready" ||
                  !loadState.writable ||
                  !importPreview ||
                  importPreview.validCount === 0 ||
                  isImporting
                }
                className="inline-flex items-center gap-2"
              >
                {t("actions.import")}
              </Button>
            </div>
          }
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            {importPreview ? (
              <>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="break-all">{t("import.file", { path: importPreview.filePath })}</div>
                  <div>
                    {t("import.countSummary", { total: importPreview.totalCount, valid: importPreview.validCount, invalid: importPreview.invalidCount })}
                    {importPreview.duplicateIds.length > 0 ? ` · ${t("import.duplicates", { count: importPreview.duplicateIds.length })}` : ""}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t("import.ids", { count: importPreview.ids.length })}</div>
                  <div className="max-h-56 overflow-auto rounded-md border p-2 font-mono text-xs whitespace-pre-wrap" data-i18n-ignore="">
                    {importPreview.ids.slice(0, 500).join(", ")}
                    {importPreview.ids.length > 500 ? `\n${t("import.andMore", { count: importPreview.ids.length - 500 })}` : ""}
                  </div>
                  {importPreview.duplicateIds.length > 0 ? (
                    <div className="text-xs text-muted-foreground">
                      {t("import.duplicateIds", { ids: importPreview.duplicateIds.slice(0, 100).join(", ") })}
                      {importPreview.duplicateIds.length > 100 ? ` ${t("import.andMore", { count: importPreview.duplicateIds.length - 100 })}` : ""}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">{t("import.noFile")}</div>
            )}
          </div>
        </AppRndModalShell>
      ) : null}
    </div>
  );
}
