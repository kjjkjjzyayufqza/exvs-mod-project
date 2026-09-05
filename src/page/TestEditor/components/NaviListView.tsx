import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { dirname } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { FolderOpen, Info, RefreshCw, Save } from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NaviListData } from "@/models/naviListEntry";
import { NAVILIST_STRING_FIELDS } from "@/models/naviListEntry";
import type { SeriesListData } from "@/models/seriesListEntry";
import {
  resolveWorkspaceContent,
  workspacePackIdentityFromResolved,
  type WorkspaceContentId,
} from "@/services/testEditorWorkspace/contentCatalog";
import { promptAndMigrateWorkspaceContentIfNeeded } from "@/services/testEditorWorkspace/contentMigration";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import { useConfigStore } from "@/store/configStore";
import { checkStringCoverage, getDefaultRanges } from "@/utils/exvsStringAllowedRanges";
import { mergeGuiPackPickerItems, planGuiPackExtract, resolveGuiPackFolder, type GuiPackPickerItem, type WorkspaceGuiPack } from "./character-list/guiPackIndex";
import { extractWorkspaceGuiPack } from "./character-list/guiPackExtract";
import { formatGuiHashHex } from "./character-list/guiClonePlan";
import type { SeriesIdPickerItem } from "./character-list/SeriesIdPickerPopover";
import { listFhm2dNameMappingEntries } from "@/utils/fhm2dNameMapping";
import {
  FontCoverageErrorDialog,
  type FontCoverageError,
} from "./character-list/FontCoverageErrorDialog";
import { NaviEditor } from "./navi-list/NaviEditor";
import { buildNaviListSourceFhm2dPath, initNaviListPack } from "./navi-list/initNaviListPack";
import { LegacyWorkspaceMoveNotice } from "./workspace-layout/LegacyWorkspaceMoveNotice";

interface NaviListViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  pendingSelectUniqueId?: number | null;
  onConsumePendingSelect?: () => void;
  workspaceDocument: TestEditorWorkspaceDocument;
}

const NAVI_LIST_INFO_MODAL_DIMENSIONS = {
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
      list: NaviListData;
    };

export default function NaviListView({
  folderPath,
  isActive,
  onUnsavedChanges,
  onPackMutated,
  pendingSelectUniqueId,
  onConsumePendingSelect,
  workspaceDocument,
}: NaviListViewProps) {
  const { t } = useTranslation("test-lists");
  const obDplCachePath = useConfigStore((state) => state.obDplCachePath);
  const obModPath = useConfigStore((state) => state.obModPath);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [hasChanges, setHasChanges] = useState(false);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [seriesPickerItems, setSeriesPickerItems] = useState<SeriesIdPickerItem[]>([]);
  const [seriesPickerLoading, setSeriesPickerLoading] = useState(false);
  const [seriesPickerError, setSeriesPickerError] = useState<string | null>(null);
  const [guiPackItems, setGuiPackItems] = useState<GuiPackPickerItem[]>([]);
  const [guiPackLoading, setGuiPackLoading] = useState(false);
  const [guiPackError, setGuiPackError] = useState<string | null>(null);
  const [extractingGuiHash, setExtractingGuiHash] = useState<number | null>(null);
  const [fontCoverageErrorDialogOpen, setFontCoverageErrorDialogOpen] = useState(false);
  const [fontCoverageErrors, setFontCoverageErrors] = useState<FontCoverageError[]>([]);
  const hasChangesRef = useRef(false);
  hasChangesRef.current = hasChanges;

  const resolveContent = useCallback(
    async (id: WorkspaceContentId) => {
      return await promptAndMigrateWorkspaceContentIfNeeded(
        await resolveWorkspaceContent(folderPath, workspaceDocument, id),
      );
    },
    [folderPath, workspaceDocument],
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
    const content = await resolveContent("navi-list");
    const filePath = content.existing?.filePath ?? content.configured.filePath;
    if (!filePath) {
      setLoadState({ status: "error", filePath: "", message: t("navi.notConfigured") });
      resetEditorState();
      return;
    }
    setLoadState({ status: "loading" });
    try {
      if (!(await exists(filePath))) {
        throw new Error(`navi_list.bin not found. Init pack ${content.configured.hashHex ?? "0x6FCC0FBA"} first.`);
      }
      const list = await invoke<NaviListData>("parse_typed_param_file", {
        path: filePath,
        paramType: "navilist",
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
      setLoadState({
        status: "error",
        filePath,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      resetEditorState();
    }
  }, [folderPath, resetEditorState, resolveContent]);

  const loadSeriesPicker = useCallback(async () => {
    if (!folderPath) return;
    setSeriesPickerLoading(true);
    setSeriesPickerError(null);
    try {
      const content = await resolveContent("series-list");
      const filePath = content.existing?.filePath ?? content.configured.filePath;
      if (!filePath) throw new Error("Series list is not configured");
      const list = await invoke<SeriesListData>("parse_typed_param_file", {
        path: filePath,
        paramType: "serieslist",
      });
      setSeriesPickerItems(
        list.entries.map((entry) => ({
          id: entry.entryId,
          iconFileIndex: entry.iconFileIndex,
          label: entry.name || `Series ${entry.entryId}`,
          previewSrc: "/tauri.svg",
        })),
      );
    } catch (error) {
      setSeriesPickerItems([]);
      setSeriesPickerError(error instanceof Error ? error.message : "Series list unavailable");
    } finally {
      setSeriesPickerLoading(false);
    }
  }, [folderPath, resolveContent]);

  const loadGuiPacks = useCallback(async () => {
    if (!folderPath) return;
    setGuiPackLoading(true);
    setGuiPackError(null);
    try {
      const workspacePacks = await invoke<WorkspaceGuiPack[]>("list_workspace_gui_packs", {
        workspaceRoot: folderPath,
      });
      setGuiPackItems(
        mergeGuiPackPickerItems({
          workspacePacks,
          nameMappings: listFhm2dNameMappingEntries(),
          characterUsages: [],
        }),
      );
    } catch (error) {
      setGuiPackItems(
        mergeGuiPackPickerItems({
          workspacePacks: [],
          nameMappings: listFhm2dNameMappingEntries(),
          characterUsages: [],
        }),
      );
      setGuiPackError(error instanceof Error ? error.message : "Failed to list 009gui packs");
    } finally {
      setGuiPackLoading(false);
    }
  }, [folderPath]);

  useEffect(() => {
    if (!isActive) return;
    if (hasChangesRef.current) return;
    void load();
    void loadSeriesPicker();
    void loadGuiPacks();
  }, [isActive, load, loadGuiPacks, loadSeriesPicker]);

  useEffect(() => {
    if (!isActive) return;
    if (pendingSelectUniqueId == null) return;
    if (loadState.status !== "ready") return;
    const index = loadState.list.entries.findIndex(
      (entry) => entry.characterUniqueId === pendingSelectUniqueId,
    );
    if (index >= 0) setSelectedIndex(index);
    onConsumePendingSelect?.();
  }, [isActive, loadState, onConsumePendingSelect, pendingSelectUniqueId]);

  const handleEditorChange = useCallback(
    (next: NaviListData) => {
      if (loadState.status !== "ready" || !loadState.writable) return;
      setLoadState((prev) => (prev.status === "ready" ? { ...prev, list: next } : prev));
      setHasChanges(true);
      onUnsavedChanges?.(true);
    },
    [loadState, onUnsavedChanges],
  );

  const performSave = useCallback(async () => {
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
      const sortedRows = [...loadState.list.entries].sort((a, b) => a.entryId - b.entryId);
      const sortedList: NaviListData = {
        ...loadState.list,
        entries: sortedRows,
        header: { ...loadState.list.header, entryCount: sortedRows.length },
      };
      await invoke("build_typed_param_file", {
        dataJson: sortedList,
        outputPath: filePath,
        paramType: "navilist",
      });
      const content = await resolveContent("navi-list");
      onPackMutated?.(workspacePackIdentityFromResolved(content.existing ?? content.configured, "configured"));
      toast.success(t("navi.saved"));
      setHasChanges(false);
      onUnsavedChanges?.(false);
      setLoadState((prev) => (prev.status === "ready" ? { ...prev, list: sortedList } : prev));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("navi.saveFailed"));
    }
  }, [loadState, onPackMutated, onUnsavedChanges, resolveContent]);

  const handleSaveFile = useCallback(async () => {
    if (loadState.status !== "ready") return;
    const ranges = getDefaultRanges();
    const errors: FontCoverageError[] = [];
    for (const entry of loadState.list.entries) {
      const rec = entry as unknown as Record<string, unknown>;
      for (const fieldName of NAVILIST_STRING_FIELDS) {
        const str = typeof rec[fieldName] === "string" ? rec[fieldName] : "";
        if (!str) continue;
        const result = checkStringCoverage(str, ranges);
        if (!result.ok) {
          errors.push({
            characterId: entry.entryId,
            fieldName,
            fieldLabel: fieldName,
            missing: result.missing,
          });
        }
      }
    }
    if (errors.length > 0) {
      setFontCoverageErrors(errors);
      setFontCoverageErrorDialogOpen(true);
      return;
    }
    await performSave();
  }, [loadState, performSave]);

  const handleInitPack = useCallback(async () => {
    const sourceFhm2dPath = buildNaviListSourceFhm2dPath(obDplCachePath ?? "");
    if (!sourceFhm2dPath) {
      toast.error(t("common.setObDplcacheInit"));
      return;
    }
    setIsInitializing(true);
    try {
      await initNaviListPack({
        sourceFhm2dPath,
        workspaceRoot: folderPath,
        workspaceDocument,
      });
      toast.success(t("navi.unpacked"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsInitializing(false);
    }
  }, [folderPath, load, obDplCachePath, workspaceDocument]);

  const handleOpenPath = useCallback(async (rawPath: string) => {
    const normalizedPath = /^[a-zA-Z]:[\\/]/.test(rawPath) || rawPath.startsWith("\\\\")
      ? rawPath.replace(/\//g, "\\")
      : rawPath.replace(/\\/g, "/");
    if (!(await exists(normalizedPath))) {
      toast.error(t("common.pathMissing"));
      return;
    }
    await openPath(normalizedPath);
  }, []);

  const handleOpenGuiPackFolder = useCallback(
    async (hash: number) => {
      const folder = resolveGuiPackFolder(hash, guiPackItems);
      if (!folder) {
        toast.error(t("common.noGuiFolder"));
        return;
      }
      await handleOpenPath(folder);
    },
    [guiPackItems, handleOpenPath],
  );

  const handleExtractGuiPack = useCallback(
    async (hash: number, fieldKey: string) => {
      const plan = planGuiPackExtract(hash, fieldKey, guiPackItems);
      if (!plan) {
        toast.error(hash === 0 ? t("common.noPackHash") : t("common.packAlreadyExtracted"));
        return;
      }
      const dplCachePath = (obDplCachePath ?? "").trim();
      if (!dplCachePath) {
        toast.error(t("common.setObDplcacheConfig"));
        return;
      }
      if (!folderPath) {
        toast.error(t("common.setWorkspace"));
        return;
      }
      setExtractingGuiHash(plan.hash);
      try {
        const extracted = await extractWorkspaceGuiPack({
          dplCachePath,
          workspaceRoot: folderPath,
          obModPath: (obModPath ?? "").trim() || null,
          hash: plan.hash,
          packagePath: plan.packagePath,
          structureName: plan.structureName,
        });
        toast.success(t("navi.extracted", { name: extracted.name }), {
          description: t("navi.guiPath", { path: extracted.workspaceRelative }),
        });
        await loadGuiPacks();
        onPackMutated?.({
          packKey: extracted.structureJsonPath || extracted.folderPath,
          routeId: null,
          prefix: "009gui",
          hashFolderName: extracted.name || formatGuiHashHex(extracted.hash),
          folderPath: extracted.folderPath,
          structureJsonPath: extracted.structureJsonPath,
          sourceLayout: "configured",
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setExtractingGuiHash(null);
      }
    },
    [folderPath, guiPackItems, loadGuiPacks, obDplCachePath, obModPath, onPackMutated],
  );

  const fileMeta = useMemo(() => {
    if (loadState.status !== "ready") return null;
    return {
      count: loadState.list.entries.length,
      commands: loadState.list.header.commandsCount,
    };
  }, [loadState]);

  if (!isActive) {
    return <div className="h-full w-full" />;
  }

  if (loadState.status === "loading") {
    return (
      <div className="h-full w-full">
        <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
          <CardHeader className="p-0 pb-4">
            <CardTitle>{t("navi.title")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 text-sm text-muted-foreground">{t("navi.loading")}</CardContent>
        </Card>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="h-full w-full">
        <Card className="border-none shadow-none rounded-none bg-transparent">
          <CardHeader className="p-0 pb-4">
            <CardTitle>{t("navi.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            {loadState.filePath ? (
              <div className="text-sm break-all">{loadState.filePath}</div>
            ) : null}
            <div className="text-sm text-destructive">{loadState.message}</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => void load()}>
                <RefreshCw className="w-4 h-4 mr-1.5" />
                {t("common.reload")}
              </Button>
              <Button size="sm" onClick={() => void handleInitPack()} disabled={isInitializing}>
                {isInitializing ? t("common.initializing") : t("common.initPack")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadState.status !== "ready") {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
        {t("navi.selectTab")}
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <Card className="h-full flex flex-col border-none shadow-none rounded-none bg-transparent">
        <CardHeader className="p-0 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle>{t("navi.title")}</CardTitle>
              <div className="text-xs text-muted-foreground break-all mt-1 flex items-center gap-1">
                {loadState.filePath}
                <button
                  type="button"
                  className="inline-flex"
                  onClick={() => void dirname(loadState.filePath).then((target) => handleOpenPath(target))}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                </button>
              </div>
              {fileMeta ? (
                <div className="text-xs text-muted-foreground mt-1">
                  {t("navi.rowsCommands", { count: fileMeta.count, commands: fileMeta.commands })}
                </div>
              ) : null}
              <LegacyWorkspaceMoveNotice
                workspaceRoot={folderPath}
                workspaceDocument={workspaceDocument}
                contentId="navi-list"
                sourceLayout={loadState.sourceLayout}
                configuredPath={loadState.configuredFilePath}
                onMoved={() => void load()}
                className="mt-2"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => void load()} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                {t("common.reload")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsInfoDialogOpen(true)}>
                <Info className="w-4 h-4 mr-1.5" />
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
          <NaviEditor
            naviListData={loadState.list}
            selectedIndex={selectedIndex}
            editable={loadState.writable}
            seriesIdPickerItems={seriesPickerItems}
            seriesIdPickerLoading={seriesPickerLoading}
            seriesIdPickerError={seriesPickerError}
            guiPackItems={guiPackItems}
            guiPackLoading={guiPackLoading}
            guiPackError={guiPackError}
            onOpenGuiPackFolder={(hash) => void handleOpenGuiPackFolder(hash)}
            onExtractGuiPack={(hash, fieldKey) => void handleExtractGuiPack(hash, fieldKey)}
            extractingGuiHash={extractingGuiHash}
            onChange={handleEditorChange}
            onSelectChange={setSelectedIndex}
          />
        </CardContent>
      </Card>

      {isInfoDialogOpen ? (
        <AppRndModalShell
          titleId="navi-list-info-title"
          title={t("common.info")}
          headerIcon={<Info className="h-5 w-5 text-primary" />}
          dimensions={NAVI_LIST_INFO_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.navi-list-info"
          onClose={() => setIsInfoDialogOpen(false)}
        >
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-6 text-sm text-muted-foreground">
            <p>{t("navi.info.support")}</p>
            <p>{t("navi.info.uniqueId")}</p>
            <p>{t("navi.info.cloneGui")}</p>
            <p>{t("navi.info.repack")}</p>
          </div>
        </AppRndModalShell>
      ) : null}

      <FontCoverageErrorDialog
        open={fontCoverageErrorDialogOpen}
        errors={fontCoverageErrors}
        onClose={() => setFontCoverageErrorDialogOpen(false)}
        onForceSave={() => {
          setFontCoverageErrorDialogOpen(false);
          void performSave();
        }}
      />
    </div>
  );
}
