import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { dirname, join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { RefreshCw, Save, Image as ImageIcon, Loader2, Info, FolderOpen } from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SeriesListData } from "@/models/seriesListEntry";
import {
  resolveWorkspaceContent,
  type WorkspaceContentId,
} from "@/services/testEditorWorkspace/contentCatalog";
import { promptAndMigrateWorkspaceContentIfNeeded } from "@/services/testEditorWorkspace/contentMigration";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { SeriesEditor } from "./series-list/SeriesEditor";
import { extractA0253FirstFolderSeriesBaseNameOrder } from "./series-list/seriesImage";
import { LegacyWorkspaceMoveNotice } from "./workspace-layout/LegacyWorkspaceMoveNotice";
import { CatalogPackToolbarButtons } from "./workspace-layout/CatalogPackToolbarButtons";
import { useConfigStore } from "@/store/configStore";

interface SeriesListViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
}

const SERIES_LIST_INFO_MODAL_DIMENSIONS = {
  width: 520,
  height: 360,
  minWidth: 420,
  minHeight: 280,
};

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
      list: SeriesListData;
    };

type SeriesImageCountState =
  | { status: "idle"; dirPath: string; structureJsonPath: string; writable: boolean }
  | { status: "loading"; dirPath: string; structureJsonPath: string; writable: boolean }
  | { status: "error"; dirPath: string; structureJsonPath: string; writable: boolean; message: string }
  | {
      status: "ready";
      dirPath: string;
      structureJsonPath: string;
      configuredStructureJsonPath: string;
      sourceLayout: "configured" | "legacy" | "missing";
      writable: boolean;
      count: number;
      seriesBaseNameOrder: Array<string | null>;
    };

export default function SeriesListView({
  folderPath,
  isActive,
  onUnsavedChanges,
  workspaceDocument,
}: SeriesListViewProps) {
  const { t } = useTranslation("test-lists");
  const obDplCachePath = useConfigStore((state) => state.obDplCachePath);
  const catalogPackLabels = useMemo(
    () => ({
      initPack: t("common.initPack"),
      initializing: t("common.initializing"),
      renameZeroBin: t("common.renameZeroBin"),
      renaming: t("common.renaming"),
      setObDplcacheInit: t("common.setObDplcacheInit"),
      unpacked: t("common.unpacked"),
      alreadyNamed: t("common.alreadyNamed"),
      formatRenamed: (names: string) => t("common.renamedFiles", { names }),
    }),
    [t],
  );
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [hasChanges, setHasChanges] = useState(false);
  const [isRefreshingNutexb, setIsRefreshingNutexb] = useState(false);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [seriesImageCountState, setSeriesImageCountState] = useState<SeriesImageCountState>({
    status: "idle",
    dirPath: "",
    structureJsonPath: "",
    writable: false,
  });
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

  const resetEditorState = useCallback(() => {
    setHasChanges(false);
    onUnsavedChanges?.(false);
  }, [onUnsavedChanges]);

  const load = useCallback(async () => {
    if (!folderPath) {
      setLoadState({ status: "error", filePath: "", message: t("common.folderPathEmpty") });
      resetEditorState();
      return;
    }

    const { content, filePath } = await resolveContentFilePath("series-list");
    if (!filePath) {
      setLoadState({ status: "error", filePath: "", message: t("series.notConfigured") });
      resetEditorState();
      return;
    }

    setLoadState({ status: "loading" });
    try {
      const list = await invoke<SeriesListData>("parse_typed_param_file", {
        path: filePath,
        paramType: "serieslist",
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
    } catch (error) {
      console.error(error);
      setLoadState({ status: "error", filePath, message: error instanceof Error ? error.message : "Unknown error" });
      resetEditorState();
    }
  }, [folderPath, resetEditorState, resolveContentFilePath]);

  useEffect(() => {
    if (!isActive) return;
    const key = [
      folderPath,
      workspaceDocument.assetRoutes["list.series"]?.prefix ?? "",
      workspaceDocument.legacyReadFallback ? "legacy-on" : "legacy-off",
      "serieslist",
    ].join("::");
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load();
  }, [folderPath, isActive, load, workspaceDocument]);

  const loadSeriesImageCount = useCallback(async () => {
    if (!folderPath) {
      setSeriesImageCountState({
        status: "error",
        dirPath: "",
        structureJsonPath: "",
        writable: false,
        message: t("common.folderPathEmpty"),
      });
      return;
    }

    const { content, pack } = await resolveContentPackPaths("series-icons");
    const dirPath = await join(pack.folderPath, "__convert");
    const structurePath = pack.structureJsonPath;
    setSeriesImageCountState({
      status: "loading",
      dirPath,
      structureJsonPath: structurePath,
      writable: content.writable,
    });
    try {
      const raw = await readFile(structurePath);
      const text = new TextDecoder().decode(raw);
      const json = JSON.parse(text);
      const seriesBaseNameOrder = extractA0253FirstFolderSeriesBaseNameOrder(json);
      setSeriesImageCountState({
        status: "ready",
        dirPath,
        structureJsonPath: structurePath,
        configuredStructureJsonPath: content.configured.structureJsonPath,
        sourceLayout: content.sourceLayout,
        writable: content.writable,
        count: seriesBaseNameOrder.length,
        seriesBaseNameOrder,
      });
    } catch (error) {
      setSeriesImageCountState({
        status: "error",
        dirPath,
        structureJsonPath: structurePath,
        writable: content.writable,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [folderPath, resolveContentPackPaths]);

  useEffect(() => {
    if (!isActive) return;
    if (!folderPath) return;
    void loadSeriesImageCount();
  }, [folderPath, isActive, loadSeriesImageCount]);

  const handleEditorChange = useCallback(
    (next: SeriesListData) => {
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

  const fileMeta = useMemo(() => {
    if (loadState.status !== "ready") return null;
    return {
      count: loadState.list.entries.length,
      commands: loadState.list.header.commandsCount,
    };
  }, [loadState]);

  const handleSaveFile = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error(t("common.legacyReadOnly"));
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
        const aIsPositive = a.entryId >= 0;
        const bIsPositive = b.entryId >= 0;
        if (aIsPositive !== bIsPositive) return aIsPositive ? -1 : 1;
        return a.entryId - b.entryId;
      });
      const sortedList: SeriesListData = {
        ...loadState.list,
        entries: sortedRows,
        header: { ...loadState.list.header, entryCount: sortedRows.length },
      };
      await invoke("build_typed_param_file", {
        dataJson: sortedList,
        outputPath: filePath,
        paramType: "serieslist",
      });
      toast.success(t("series.saved"));
      setHasChanges(false);
      onUnsavedChanges?.(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(t("series.saveFailed"));
    }
  }, [loadState, onUnsavedChanges]);

  const handleRefreshNutexb = useCallback(async () => {
    if (!folderPath) {
      toast.error(t("common.folderPathEmpty"));
      return;
    }

    try {
      setIsRefreshingNutexb(true);
      const content = await resolveContent("series-icons");
      if (!content.writable) {
        toast.error(t("series.iconNotWritable"));
        return;
      }
      const seriesImageDir = content.configured.folderPath;
      const result = await invoke<{ converted: number; failed: number; skipped: number }>(
        "nutexb_batch_export_png",
        {
          rootDir: seriesImageDir,
          outputMode: "root_convert",
          overwrite: true,
        }
      );
      toast.success(t("series.convertedPng", { count: result.converted }));
      if (result.failed > 0) {
        toast.error(t("series.convertFailed", { count: result.failed }));
      }
      void loadSeriesImageCount();
    } catch (error) {
      console.error(error);
      toast.error(t("series.refreshFailed"));
    } finally {
      setIsRefreshingNutexb(false);
    }
  }, [folderPath, loadSeriesImageCount, resolveContent]);

  const handleOpenPath = useCallback(async (rawPath: string) => {
    try {
      const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(rawPath) || rawPath.startsWith("\\\\");
      const normalizedPath = isWindowsPath ? rawPath.replace(/\//g, "\\") : rawPath.replace(/\\/g, "/");

      if (normalizedPath.includes('"')) {
        toast.error(t("common.invalidQuotePath"));
        return;
      }

      const pathExists = await exists(normalizedPath);
      if (!pathExists) {
        toast.error(t("common.pathMissing"));
        return;
      }

      await openPath(normalizedPath);
    } catch (error) {
      console.error("Error opening path:", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message ? t("common.openFailedWithMessage", { message }) : t("common.openFailed"));
    }
  }, []);

  const handleOpenSeriesListFolder = useCallback(async () => {
    if (loadState.status !== "ready") return;
    const folderPathToOpen = await dirname(loadState.filePath);
    await handleOpenPath(folderPathToOpen);
  }, [loadState, handleOpenPath]);

  const handleOpenSeriesImageFolder = useCallback(async () => {
    const dirPath = seriesImageCountState.dirPath;
    if (!dirPath) return;
    await handleOpenPath(dirPath);
  }, [seriesImageCountState.dirPath, handleOpenPath]);

  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  if (loadState.status === "loading") {
    return (
      <div className="h-full w-full">
        <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
          <CardHeader className="p-0 pb-4">
            <CardTitle>{t("series.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <div className="text-sm text-muted-foreground">{t("series.loading")}</div>
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
            <CardTitle>{t("series.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            <div className="text-sm text-muted-foreground">
              {loadState.filePath ? (
                <>
                  <div className="font-medium text-foreground">{t("common.file")}</div>
                  <div className="break-all">{loadState.filePath}</div>
                </>
              ) : (
                <div className="break-all">{t("common.folderPathEmpty")}</div>
              )}
            </div>
            <div className="text-sm text-destructive">{loadState.message}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={() => void load()} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                {t("common.reload")}
              </Button>
              <CatalogPackToolbarButtons
                contentId="series-list"
                folderPath={folderPath}
                workspaceDocument={workspaceDocument}
                dplCachePath={obDplCachePath ?? ""}
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
        {t("series.selectTab")}
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
        <CardHeader className="p-0 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>{t("series.title")}</CardTitle>
              <div className="text-xs text-muted-foreground break-all mt-1 flex items-center gap-1">
                {t("series.fileLabel", { path: loadState.filePath })}
                <button
                  type="button"
                  onClick={() => void handleOpenSeriesListFolder()}
                  className="shrink-0 p-0.5 rounded hover:bg-accent hover:text-accent-foreground"
                  title={t("common.openFolder")}
                  aria-label={t("common.openFolder")}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              </div>
              {fileMeta && (
                <div className="text-xs text-muted-foreground mt-1">
                  {t("series.loadedSeries", { count: fileMeta.count, commands: fileMeta.commands })}
                </div>
              )}
              <LegacyWorkspaceMoveNotice
                workspaceRoot={folderPath}
                workspaceDocument={workspaceDocument}
                contentId="series-list"
                sourceLayout={loadState.sourceLayout}
                configuredPath={loadState.configuredFilePath}
                onMoved={load}
                className="mt-2"
              />
              <div className="text-xs text-muted-foreground break-all mt-2 flex items-center gap-1">
                {t("series.imageListLabel", { path: seriesImageCountState.dirPath || "-" })}
                {seriesImageCountState.dirPath && (
                  <button
                    type="button"
                    onClick={() => void handleOpenSeriesImageFolder()}
                    className="shrink-0 p-0.5 rounded hover:bg-accent hover:text-accent-foreground"
                    title={t("common.openFolder")}
                    aria-label={t("common.openFolder")}
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {t("common.loadedPrefix")}{" "}
                {seriesImageCountState.status === "ready"
                  ? t("series.pngCount", { count: seriesImageCountState.count })
                  : seriesImageCountState.status === "loading"
                    ? t("common.loadingEllipsis")
                    : seriesImageCountState.status === "error"
                      ? t("common.failed")
                      : "-"}
              </div>
              {seriesImageCountState.status === "ready" ? (
                <LegacyWorkspaceMoveNotice
                  workspaceRoot={folderPath}
                  workspaceDocument={workspaceDocument}
                  contentId="series-icons"
                  sourceLayout={seriesImageCountState.sourceLayout}
                  configuredPath={seriesImageCountState.configuredStructureJsonPath}
                  onMoved={loadSeriesImageCount}
                  className="mt-2"
                />
              ) : null}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => void load()} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                {t("common.reload")}
              </Button>
              <CatalogPackToolbarButtons
                contentId="series-list"
                folderPath={folderPath}
                workspaceDocument={workspaceDocument}
                dplCachePath={obDplCachePath ?? ""}
                reload={load}
                labels={catalogPackLabels}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRefreshNutexb()}
                disabled={isRefreshingNutexb || !folderPath || !seriesImageCountState.writable}
                className="inline-flex items-center gap-2"
              >
                {isRefreshingNutexb ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                {t("series.refreshNutexb")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsInfoDialogOpen(true)}
                className="inline-flex items-center gap-2"
              >
                <Info className="w-4 h-4" />
                {t("common.info")}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSaveFile()}
                disabled={!loadState.writable || !hasChanges}
                className="inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {t("common.saveFile")}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 p-0">
          <SeriesEditor
            seriesListData={loadState.list}
            editable={loadState.writable}
            seriesImageConvertDirPath={seriesImageCountState.dirPath}
            seriesImageStructureJsonPath={seriesImageCountState.structureJsonPath}
            seriesImageWritable={seriesImageCountState.writable}
            seriesImageSeriesBaseNameOrder={seriesImageCountState.status === "ready" ? seriesImageCountState.seriesBaseNameOrder : []}
            onRefreshSeriesImages={loadSeriesImageCount}
            onChange={handleEditorChange}
          />
        </CardContent>
      </Card>

      {isInfoDialogOpen ? (
        <AppRndModalShell
          titleId="series-list-info-title"
          title={t("common.info")}
          headerIcon={<Info className="h-5 w-5 text-primary" />}
          dimensions={SERIES_LIST_INFO_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.series-list-info"
          onClose={() => setIsInfoDialogOpen(false)}
        >
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-6 text-sm text-muted-foreground">
            <p>{t("series.info.load")}</p>
            <p>{t("series.info.mapping")}</p>
            <p>{t("series.info.order")}</p>
          </div>
        </AppRndModalShell>
      ) : null}
    </div>
  );
}
