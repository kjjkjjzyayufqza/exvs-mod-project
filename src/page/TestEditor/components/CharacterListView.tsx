import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { exists, readFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { dirname, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Buffer } from "buffer";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Download, Upload, RefreshCw, Save, Info, FolderOpen } from "lucide-react";

import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CharacterIdTable } from "@/models/characterIdTable";
import type { CharacterListData } from "@/models/characterListEntry";
import type { SeriesListData } from "@/models/seriesListEntry";
import { getPathSeparatorFromFileUrl } from "@/lib/fhm2d_fileUrlUtils";
import { extractCardIconItems } from "./card-icon-list/cardIconStructure";
import { buildCardIconPreviewPath } from "./card-icon-list/cardIconUtils";
import {
  extractA0253FirstFolderSeriesBaseNameOrder,
  formatSeriesPngFileNameFromBaseName,
  resolveMappedSeriesBaseName,
} from "./series-list/seriesImage";
import { CharacterEditor } from "./character-list/CharacterEditor";
import type { SeriesIdPickerItem } from "./character-list/SeriesIdPickerPopover";
import type { BgmCuePickerItem } from "./character-list/BgmCuePickerPopover";
import { bgmEntryLabel, parseBgmTablePack } from "./bgm-table/bgmTableDocument";
import {
  pickCharaJsonImportPreview,
  type CharaJsonImportPreview,
} from "./character-list/CharaJson";
import { CHARACTERLIST_STRING_FIELDS } from "@/models/characterListEntry";
import {
  checkStringCoverage,
  getDefaultRanges,
} from "@/utils/exvsStringAllowedRanges";
import {
  FontCoverageErrorDialog,
  type FontCoverageError,
} from "./character-list/FontCoverageErrorDialog";
import {
  resolveWorkspaceContent,
  workspacePackIdentityFromResolved,
  type WorkspaceContentId,
} from "@/services/testEditorWorkspace/contentCatalog";
import { promptAndMigrateWorkspaceContentIfNeeded } from "@/services/testEditorWorkspace/contentMigration";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import { findFhm2dNameMapping, listFhm2dNameMappingEntries } from "@/utils/fhm2dNameMapping";
import { clonedGuiPackIdentity, formatGuiHashHex, isMsGuiCloneKey, isPilotGuiCloneKey, type CloneGuiSetResult } from "./character-list/guiClonePlan";
import { sanitizeFhm2dStructureName } from "@/utils/fhm2dStructureMetadata";
import { extractWorkspaceGuiPack } from "./character-list/guiPackExtract";
import {
  collectCharacterGuiUsages,
  expectedWorkspaceGuiFolder,
  mergeGuiPackPickerItems,
  planGuiPackExtract,
  resolveGuiPackFolder,
  type GuiPackPickerItem,
  type WorkspaceGuiPack,
} from "./character-list/guiPackIndex";
import { LegacyWorkspaceMoveNotice } from "./workspace-layout/LegacyWorkspaceMoveNotice";
import { CatalogPackToolbarButtons } from "./workspace-layout/CatalogPackToolbarButtons";
import { useConfigStore } from "@/store/configStore";

interface CharacterListViewProps {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onJumpToCharacterIdTable?: (characterId: number) => void;
  onJumpToNaviList?: (uniqueId: number) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  onRevealTreeFolder?: (path: string) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
}

const CHARACTER_LIST_INFO_MODAL_DIMENSIONS = {
  width: 520,
  height: 360,
  minWidth: 420,
  minHeight: 280,
};

const CHARACTER_LIST_IMPORT_MODAL_DIMENSIONS = {
  width: 720,
  height: 560,
  minWidth: 560,
  minHeight: 420,
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
      list: CharacterListData;
    };

type SeriesPickerState =
  | { status: "idle"; filePath: string; convertDirPath: string }
  | { status: "loading"; filePath: string; convertDirPath: string }
  | { status: "error"; filePath: string; convertDirPath: string; message: string }
  | { status: "ready"; filePath: string; convertDirPath: string; items: SeriesIdPickerItem[] };

type BgmPickerState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: BgmCuePickerItem[] };

type CardIconMapState =
  | { status: "idle"; filePath: string; convertDirPath: string }
  | { status: "loading"; filePath: string; convertDirPath: string }
  | { status: "error"; filePath: string; convertDirPath: string; message: string }
  | {
      status: "ready";
      filePath: string;
      convertDirPath: string;
      nameOrder: Array<string | null>;
      pickerItems: Array<{ index: number; name: string | null; previewSrc: string }>;
    };

export default function CharacterListView({
  folderPath,
  isActive,
  onUnsavedChanges,
  onJumpToCharacterIdTable,
  onJumpToNaviList,
  onPackMutated,
  onRevealTreeFolder,
  workspaceDocument,
}: CharacterListViewProps) {
  const { t } = useTranslation("test-character-list-view");
  const obDplCachePath = useConfigStore((state) => state.obDplCachePath);
  const obModPath = useConfigStore((state) => state.obModPath);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [seriesPickerState, setSeriesPickerState] = useState<SeriesPickerState>({
    status: "idle",
    filePath: "",
    convertDirPath: "",
  });
  const [bgmPickerState, setBgmPickerState] = useState<BgmPickerState>({ status: "idle" });
  const [cardIconMapState, setCardIconMapState] = useState<CardIconMapState>({
    status: "idle",
    filePath: "",
    convertDirPath: "",
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<CharaJsonImportPreview | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [fontCoverageErrorDialogOpen, setFontCoverageErrorDialogOpen] = useState(false);
  const [fontCoverageErrors, setFontCoverageErrors] = useState<FontCoverageError[]>([]);
  const [editorResetKey, setEditorResetKey] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [characterIdTableIdSet, setCharacterIdTableIdSet] = useState<Set<number> | null>(null);
  const [characterIdTableIdsError, setCharacterIdTableIdsError] = useState<string | null>(null);
  const [workspaceGuiPacks, setWorkspaceGuiPacks] = useState<WorkspaceGuiPack[]>([]);
  const [guiPackLoading, setGuiPackLoading] = useState(false);
  const [guiPackError, setGuiPackError] = useState<string | null>(null);
  const [extractingGuiHash, setExtractingGuiHash] = useState<number | null>(null);
  const [cloningGuiHash, setCloningGuiHash] = useState<number | null>(null);
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

  const loadCharacterIdTableIds = useCallback(async () => {
    if (!folderPath) {
      setCharacterIdTableIdSet(null);
      setCharacterIdTableIdsError("Folder path is empty");
      return;
    }
    setCharacterIdTableIdSet(null);
    setCharacterIdTableIdsError(null);
    try {
      const { filePath } = await resolveContentFilePath("character-id-table");
      if (!filePath) {
        throw new Error("Character ID table content path is not configured");
      }
      const fileData = await readFile(filePath);
      const table = new CharacterIdTable(Buffer.from(fileData));
      setCharacterIdTableIdSet(new Set(table.CharacterData.map((r) => r.CharacterId)));
      setCharacterIdTableIdsError(null);
    } catch (error) {
      console.error(error);
      setCharacterIdTableIdSet(null);
      setCharacterIdTableIdsError(error instanceof Error ? error.message : "Unknown error");
    }
  }, [folderPath, resolveContentFilePath]);

  const load = useCallback(async () => {
    if (!folderPath) {
      setLoadState({ status: "error", filePath: "", message: t("errors.folderPathEmpty") });
      resetEditorState();
      return;
    }

    const { content, filePath } = await resolveContentFilePath("character-list");
    if (!filePath || !content.configured.filePath) {
      setLoadState({
        status: "error",
        filePath: content.configured.folderPath,
        message: t("errors.characterListNotConfigured"),
      });
      resetEditorState();
      return;
    }
    setLoadState({ status: "loading" });
    try {
      const list = await invoke<CharacterListData>("parse_typed_param_file", { path: filePath, paramType: "characterlist" });
      setLoadState({
        status: "ready",
        filePath,
        configuredFilePath: content.configured.filePath,
        sourceLayout: content.sourceLayout,
        writable: content.writable,
        list,
      });
      resetEditorState();
    } catch (error) {
      console.error(error);
      setLoadState({ status: "error", filePath, message: error instanceof Error ? error.message : t("errors.unknown") });
      resetEditorState();
    }
  }, [folderPath, resetEditorState, resolveContentFilePath]);

  const loadBgmPicker = useCallback(async () => {
    if (!folderPath) {
      setBgmPickerState({ status: "error", message: t("errors.folderPathEmpty") });
      return;
    }
    setBgmPickerState({ status: "loading" });
    try {
      const { pack } = await resolveContentPackPaths("bgm-table");
      const table = await parseBgmTablePack(pack.folderPath);
      setBgmPickerState({
        status: "ready",
        items: table.entries.map((entry) => ({
          cueHash: entry.entryId >>> 0,
          cueName: bgmEntryLabel(entry),
          bankGroup: entry.bankGroup,
        })),
      });
    } catch (error) {
      setBgmPickerState({
        status: "error",
        message: error instanceof Error ? error.message : t("errors.bgmNotUnpacked"),
      });
    }
  }, [folderPath, resolveContentPackPaths]);

  const loadSeriesPicker = useCallback(async () => {
    if (!folderPath) {
      setSeriesPickerState({ status: "error", filePath: "", convertDirPath: "", message: t("errors.folderPathEmpty") });
      return;
    }

    const { filePath } = await resolveContentFilePath("series-list");
    const { pack: seriesIconsPack } = await resolveContentPackPaths("series-icons");
    if (!filePath) {
      setSeriesPickerState({ status: "error", filePath: "", convertDirPath: "", message: t("errors.seriesListNotConfigured") });
      return;
    }
    const convertDirPath = await join(seriesIconsPack.folderPath, "__convert");
    setSeriesPickerState({ status: "loading", filePath, convertDirPath });

    try {
      const list = await invoke<SeriesListData>("parse_typed_param_file", {
        path: filePath,
        paramType: "serieslist",
      });

      const sep = getPathSeparatorFromFileUrl(convertDirPath);
      const structurePath = seriesIconsPack.structureJsonPath;
      const structRaw = await readFile(structurePath);
      const structText = new TextDecoder().decode(structRaw);
      const structJson = JSON.parse(structText);
      const seriesBaseNameOrder = extractA0253FirstFolderSeriesBaseNameOrder(structJson);

      const toPreviewSrc = (iconFileIndex: number) => {
        const baseName = resolveMappedSeriesBaseName(seriesBaseNameOrder, iconFileIndex);
        if (!baseName) return "/tauri.svg";
        const png = formatSeriesPngFileNameFromBaseName(baseName);
        if (!png) return "/tauri.svg";
        const full = convertDirPath.endsWith(sep) ? `${convertDirPath}${png}` : `${convertDirPath}${sep}${png}`;
        return convertFileSrc(full);
      };

      const items: SeriesIdPickerItem[] = list.entries.map((s) => ({
        id: s.entryId,
        iconFileIndex: s.iconFileIndex,
        label: s.name || `Series ${s.entryId}`,
        previewSrc: toPreviewSrc(s.iconFileIndex),
      })).sort((a, b) => {
        if (a.iconFileIndex !== b.iconFileIndex) return a.iconFileIndex - b.iconFileIndex;
        return a.id - b.id;
      });

      setSeriesPickerState({ status: "ready", filePath, convertDirPath, items });
    } catch (error) {
      console.error(error);
      setSeriesPickerState({
        status: "error",
        filePath,
        convertDirPath,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [folderPath, resolveContentFilePath, resolveContentPackPaths]);

  const loadCardIconMap = useCallback(async () => {
    if (!folderPath) {
      setCardIconMapState({ status: "error", filePath: "", convertDirPath: "", message: t("errors.folderPathEmpty") });
      return;
    }

    const { pack: cardIconsPack } = await resolveContentPackPaths("card-icons");
    const filePath = cardIconsPack.structureJsonPath;
    const convertDirPath = await join(cardIconsPack.folderPath, "__convert");
    setCardIconMapState({ status: "loading", filePath, convertDirPath });

    try {
      const raw = await readFile(filePath);
      const text = new TextDecoder().decode(raw);
      const json = JSON.parse(text);
      const items = extractCardIconItems(json);
      const nameOrder = items.map((it) => it.name);
      const pickerItems = items.map((it) => {
        const previewPath = it.name ? buildCardIconPreviewPath(convertDirPath, it.name) : null;
        const previewSrc = previewPath ? convertFileSrc(previewPath) : "/tauri.svg";
        return { index: it.itemIndex, name: it.name, previewSrc };
      });
      setCardIconMapState({ status: "ready", filePath, convertDirPath, nameOrder, pickerItems });
    } catch (error) {
      console.error(error);
      setCardIconMapState({
        status: "error",
        filePath,
        convertDirPath,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [folderPath, resolveContentPackPaths]);

  const loadGuiPacks = useCallback(async () => {
    if (!folderPath) return;
    setGuiPackLoading(true);
    setGuiPackError(null);
    try {
      const workspacePacks = await invoke<WorkspaceGuiPack[]>("list_workspace_gui_packs", {
        workspaceRoot: folderPath,
      });
      setWorkspaceGuiPacks(workspacePacks);
    } catch (error) {
      setWorkspaceGuiPacks([]);
      setGuiPackError(error instanceof Error ? error.message : "Failed to list 009gui packs");
    } finally {
      setGuiPackLoading(false);
    }
  }, [folderPath]);

  const guiPackItems = useMemo<GuiPackPickerItem[]>(() => {
    const usages =
      loadState.status === "ready"
        ? collectCharacterGuiUsages(loadState.list.entries as unknown as Array<Record<string, unknown>>)
        : [];
    return mergeGuiPackPickerItems({
      workspacePacks: workspaceGuiPacks,
      nameMappings: listFhm2dNameMappingEntries(),
      characterUsages: usages,
    });
  }, [loadState, workspaceGuiPacks]);

  useEffect(() => {
    if (!isActive) return;
    const routeKey = [
      workspaceDocument.legacyReadFallback,
      workspaceDocument.assetRoutes["list.character"]?.prefix ?? "",
      workspaceDocument.assetRoutes["list.series"]?.prefix ?? "",
      workspaceDocument.assetRoutes["gui.series-icons"]?.prefix ?? "",
      workspaceDocument.assetRoutes["gui.card-icons"]?.prefix ?? "",
      workspaceDocument.assetRoutes["unit.sound"]?.prefix ?? "",
    ].join("|");
    const key = `${folderPath}::characterlist::${routeKey}`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load();
    void loadSeriesPicker();
    void loadBgmPicker();
    void loadCardIconMap();
    void loadCharacterIdTableIds();
    void loadGuiPacks();
  }, [folderPath, isActive, load, loadBgmPicker, loadCardIconMap, loadCharacterIdTableIds, loadGuiPacks, loadSeriesPicker, workspaceDocument]);

  useEffect(() => {
    if (loadState.status !== "ready") return;
    setSelectedIndex((prev) => {
      if (loadState.list.entries.length === 0) return -1;
      if (prev < 0) return prev;
      return Math.min(prev, loadState.list.entries.length - 1);
    });
  }, [loadState]);

  const handleEditorChange = useCallback(
    (next: CharacterListData) => {
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

  const handleEditorSelectChange = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const fileMeta = useMemo(() => {
    if (loadState.status !== "ready") return null;
    return {
      count: loadState.list.entries.length,
      commands: loadState.list.header.commandsCount,
    };
  }, [loadState]);

  const handleOpenPath = useCallback(async (rawPath: string) => {
    try {
      const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(rawPath) || rawPath.startsWith("\\\\");
      const normalizedPath = isWindowsPath ? rawPath.replace(/\//g, "\\") : rawPath.replace(/\\/g, "/");

      if (normalizedPath.includes('"')) {
        toast.error(t("errors.invalidPathQuote"));
        return;
      }

      const pathExists = await exists(normalizedPath);
      if (!pathExists) {
        toast.error(t("errors.pathNotExist"));
        return;
      }

      await openPath(normalizedPath);
    } catch (error) {
      console.error("Error opening path:", error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t("errors.failedToOpen", { message }));
    }
  }, []);

  const handleOpenGuiPackFolder = useCallback(
    async (hash: number) => {
      let folder = resolveGuiPackFolder(hash, guiPackItems);
      if (!folder) {
        const mapping = findFhm2dNameMapping(formatGuiHashHex(hash), { routePrefix: "009gui" });
        if (mapping?.packagePath && mapping.name && folderPath) {
          folder = expectedWorkspaceGuiFolder(folderPath, mapping.packagePath, mapping.name);
        }
      }
      if (!folder) {
        toast.error(t("errors.noExtractedGui"));
        return;
      }
      onRevealTreeFolder?.(folder);
      await handleOpenPath(folder);
    },
    [folderPath, guiPackItems, handleOpenPath, onRevealTreeFolder],
  );

  const handleExtractGuiPack = useCallback(
    async (hash: number, fieldKey: string) => {
      const plan = planGuiPackExtract(hash, fieldKey, guiPackItems);
      if (!plan) {
        toast.error(hash === 0 ? t("errors.noPackHash") : t("errors.packAlreadyExtracted"));
        return;
      }
      const dplCachePath = (obDplCachePath ?? "").trim();
      if (!dplCachePath) {
        toast.error(t("errors.setObDplcache"));
        return;
      }
      if (!folderPath) {
        toast.error(t("errors.setWorkspace"));
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
        toast.success(`Extracted ${extracted.name}`, {
          description: `009gui/${extracted.workspaceRelative}`,
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
        onRevealTreeFolder?.(extracted.folderPath);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setExtractingGuiHash(null);
      }
    },
    [folderPath, guiPackItems, loadGuiPacks, obDplCachePath, obModPath, onPackMutated, onRevealTreeFolder],
  );

  const handleCloneGuiPack = useCallback(
    async (hash: number, fieldKey: string, requestedName: string) => {
      const normalized = hash >>> 0;
      if (normalized === 0) {
        toast.error(t("errors.noPackHash"));
        throw new Error("No pack hash");
      }
      if (!isPilotGuiCloneKey(fieldKey) && !isMsGuiCloneKey(fieldKey)) {
        toast.error(t("errors.fieldCannotClone"));
        throw new Error("This field cannot be cloned from character_list");
      }
      if (loadState.status !== "ready" || !loadState.writable) {
        toast.error(t("errors.readOnly"));
        throw new Error("Character list is read-only");
      }
      const entry = loadState.list.entries[selectedIndex];
      if (!entry) {
        toast.error(t("errors.selectCharacter"));
        throw new Error("Select a character first");
      }
      const dplCachePath = (obDplCachePath ?? "").trim();
      if (!dplCachePath) {
        toast.error(t("errors.setObDplcache"));
        throw new Error("Set OB dplcache path in Config");
      }
      if (!folderPath) {
        toast.error(t("errors.setWorkspace"));
        throw new Error("Set EXVS2 Workspace folder first");
      }
      const structureName = sanitizeFhm2dStructureName(requestedName);
      if (!structureName) {
        toast.error(t("errors.enterCloneName"));
        throw new Error("Enter a Name for the cloned pack");
      }
      setCloningGuiHash(normalized);
      try {
        const result = await invoke<CloneGuiSetResult>("clone_character_gui_set", {
          request: {
            dplCachePath,
            workspaceRoot: folderPath,
            obModPath: (obModPath ?? "").trim() || null,
            copyToObMod: false,
            targetEntryId: entry.entryId,
            donorEntryId: entry.entryId,
            clonePilot: true,
            cloneNavi: false,
            preview: false,
            selectedFieldKeys: [fieldKey],
            structureNames: { [fieldKey]: structureName },
            characterList: { entries: loadState.list.entries },
          },
        });
        // Keep the current character_list hash. The clone is only a new 009gui pack.
        await loadGuiPacks();
        for (const pack of result.packs) {
          onPackMutated?.(clonedGuiPackIdentity(pack));
        }
        const first = result.packs[0];
        toast.success(`Cloned ${first?.structureName ?? structureName}`, {
          description: first
            ? `${formatGuiHashHex(first.newHash)} is in 009gui. This field is unchanged.`
            : structureName,
        });
        if (first?.outputPath) onRevealTreeFolder?.(first.outputPath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(message);
        throw error instanceof Error ? error : new Error(message);
      } finally {
        setCloningGuiHash(null);
      }
    },
    [
      folderPath,
      loadGuiPacks,
      loadState,
      obDplCachePath,
      obModPath,
      onPackMutated,
      onRevealTreeFolder,
      selectedIndex,
    ],
  );

  const handleOpenCharacterListFolder = useCallback(async () => {
    if (loadState.status !== "ready") return;
    const folderPathToOpen = await dirname(loadState.filePath);
    await handleOpenPath(folderPathToOpen);
  }, [loadState, handleOpenPath]);

  const performSave = useCallback(async () => {
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

      const sortedEntries = [...loadState.list.entries].sort((a, b) => {
        const aIsPositive = a.entryId >= 0;
        const bIsPositive = b.entryId >= 0;
        if (aIsPositive !== bIsPositive) return aIsPositive ? -1 : 1;
        return a.entryId - b.entryId;
      });
      const sortedList: CharacterListData = { ...loadState.list, entries: sortedEntries };
      await invoke("build_typed_param_file", {
        dataJson: sortedList,
        outputPath: filePath,
        paramType: "characterlist",
      });
      toast.success(t("success.saved"));
      setHasChanges(false);
      onUnsavedChanges?.(false);
      try {
        const content = await resolveContent("character-list");
        onPackMutated?.(
          workspacePackIdentityFromResolved(
            content.existing ?? content.configured,
            content.sourceLayout === "legacy" ? "legacy" : "configured",
          ),
        );
      } catch {
        // File is saved; listening repack list can still be filled from Folder structure.
      }
      setLoadState((prev) => {
        if (prev.status !== "ready") return prev;
        return { ...prev, list: sortedList };
      });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(
        message
          ? `Failed to save character_list.bin: ${message}`
          : "Failed to save character_list.bin",
      );
    }
  }, [loadState, onPackMutated, onUnsavedChanges, resolveContent]);

  const handleSaveFile = useCallback(async () => {
    if (loadState.status !== "ready") return;
    const ranges = getDefaultRanges();
    const errors: FontCoverageError[] = [];

    for (const entry of loadState.list.entries) {
      const rec = entry as unknown as Record<string, unknown>;
      for (const fieldName of CHARACTERLIST_STRING_FIELDS) {
        const str = typeof rec[fieldName] === "string" ? (rec[fieldName] as string) : "";
        if (str.length === 0) continue;
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

  const handleForceSave = useCallback(async () => {
    setFontCoverageErrorDialogOpen(false);
    await performSave();
  }, [performSave]);

  const handleExportCharaJson = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (isExporting) return;

    setIsExporting(true);
    try {
      const filePath = await save({
        filters: [{ name: "Chara JSON", extensions: ["json"] }],
        defaultPath: "character_list.json",
      });
      if (!filePath) return;
      const jsonString = JSON.stringify(loadState.list.entries, null, 2);
      await writeTextFile(filePath, jsonString);
      toast.success(t("success.exported", { count: loadState.list.entries.length }));
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(t("errors.failedToExport", { message }));
    } finally {
      setIsExporting(false);
    }
  }, [isExporting, loadState]);

  const handlePickImportCharaJson = useCallback(async () => {
    if (loadState.status !== "ready" || !loadState.writable) return;
    if (isImporting) return;

    setIsImporting(true);
    try {
      const preview = await pickCharaJsonImportPreview();
      if (!preview) return;

      if (preview.validCount === 0) {
      toast.error(t("errors.invalidJson"));
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
    if (loadState.status !== "ready" || !loadState.writable) return;
    if (!importPreview) return;
    if (isImporting) return;

    setIsImporting(true);
    try {
      const importedEntries = importPreview.rows.map((row) => {
        const entry: Record<string, unknown> = { entryId: row.id };
        for (const [key, value] of Object.entries(row)) {
          // Skip id aliases; entryId is set from the normalized row id.
          if (key === "id" || key === "CharacterId" || key === "entryId") continue;
          entry[key] = value;
        }
        return entry;
      });
      const entryIds = importedEntries.map((e) => e.entryId as number);
      const nextList: CharacterListData = {
        ...loadState.list,
        entries: importedEntries as any,
        entryIds,
        header: {
          ...loadState.list.header,
          entryCount: importedEntries.length,
        },
      };
      setLoadState((prev) => {
        if (prev.status !== "ready") return prev;
        return { ...prev, list: nextList };
      });
      setHasChanges(true);
      onUnsavedChanges?.(true);
      setEditorResetKey((k) => k + 1);

      setIsImportDialogOpen(false);
      setImportPreview(null);
      toast.success(t("success.imported", { count: importPreview.validCount }));
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(t("errors.failedToApplyImport", { message }));
    } finally {
      setIsImporting(false);
    }
  }, [importPreview, isImporting, loadState, onUnsavedChanges]);

  const handleReloadAll = useCallback(() => {
    void load();
    void loadSeriesPicker();
    void loadBgmPicker();
    void loadCardIconMap();
    void loadCharacterIdTableIds();
    void loadGuiPacks();
  }, [load, loadBgmPicker, loadCardIconMap, loadCharacterIdTableIds, loadGuiPacks, loadSeriesPicker]);

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

  const jumpToCharacterIdTable = useMemo(() => {
    if (!onJumpToCharacterIdTable) {
      return undefined;
    }
    if (characterIdTableIdSet === null && !characterIdTableIdsError) {
      return {
        disabled: true,
        tooltip: t("tooltips.loadingIdTable"),
        onClick: () => {},
      };
    }
    if (characterIdTableIdsError || characterIdTableIdSet === null) {
      return {
        disabled: true,
        tooltip: t("tooltips.idTableUnavailable", { message: characterIdTableIdsError ?? t("errors.unknown") }),
        onClick: () => {},
      };
    }
    if (loadState.status !== "ready") {
      return {
        disabled: true,
        tooltip: t("tooltips.listNotReady"),
        onClick: () => {},
      };
    }
    const selected = loadState.list.entries[selectedIndex];
    if (!selected) {
      return {
        disabled: true,
        tooltip: t("tooltips.selectCharacter"),
        onClick: () => {},
      };
    }
    const id = selected.entryId;
    if (!characterIdTableIdSet.has(id)) {
      return {
        disabled: true,
        tooltip: t("tooltips.idMissing", { id }),
        onClick: () => {},
      };
    }
    return {
      disabled: false,
      tooltip: t("tooltips.openIdTable", { id }),
      onClick: () => onJumpToCharacterIdTable(id),
    };
  }, [characterIdTableIdSet, characterIdTableIdsError, loadState, onJumpToCharacterIdTable, selectedIndex]);

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
            <div className="text-sm text-muted-foreground">{t("loading")}</div>
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
                <div className="break-all">{t("errors.folderPathEmpty")}</div>
              )}
            </div>
            <div className="text-sm text-destructive">{loadState.message}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={handleReloadAll} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                {t("reload")}
              </Button>
              <CatalogPackToolbarButtons
                contentId="character-list"
                folderPath={folderPath}
                workspaceDocument={workspaceDocument}
                dplCachePath={obDplCachePath ?? ""}
                reload={handleReloadAll}
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
              <CardTitle>{t("title")}</CardTitle>
              <div className="text-xs text-muted-foreground break-all mt-1 flex items-center gap-1">
                {loadState.filePath}
                <button
                  type="button"
                  onClick={() => void handleOpenCharacterListFolder()}
                  className="shrink-0 p-0.5 rounded hover:bg-accent hover:text-accent-foreground"
                  title={t("openFolder")}
                  aria-label={t("openFolder")}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              </div>
              {fileMeta && (
                <div className="text-xs text-muted-foreground mt-1">
                  {t("loadedSummary", { count: fileMeta.count, commands: fileMeta.commands })}
                </div>
              )}
              <LegacyWorkspaceMoveNotice
                workspaceRoot={folderPath}
                workspaceDocument={workspaceDocument}
                contentId="character-list"
                sourceLayout={loadState.sourceLayout}
                configuredPath={loadState.configuredFilePath}
                onMoved={handleReloadAll}
                className="mt-2"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={handleReloadAll} className="inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                {t("reload")}
              </Button>
              <CatalogPackToolbarButtons
                contentId="character-list"
                folderPath={folderPath}
                workspaceDocument={workspaceDocument}
                dplCachePath={obDplCachePath ?? ""}
                reload={handleReloadAll}
                labels={catalogPackLabels}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handlePickImportCharaJson()}
                disabled={!loadState.writable || isImporting}
                className="inline-flex items-center gap-2"
                title={t("importTooltip")}
              >
                <Upload className="w-4 h-4" />
                {t("importJson")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleExportCharaJson()}
                disabled={isExporting || loadState.list.entries.length === 0}
                className="inline-flex items-center gap-2"
                title={t("exportTooltip")}
              >
                <Download className="w-4 h-4" />
                {t("exportJson")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsInfoDialogOpen(true)}
                className="inline-flex items-center gap-2"
              >
                <Info className="w-4 h-4" />
                {t("info")}
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSaveFile()}
                disabled={!loadState.writable || !hasChanges}
                className="inline-flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {t("saveFile")}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 min-h-0 p-0">
          <CharacterEditor
            key={editorResetKey}
            characterListData={loadState.list}
            selectedIndex={selectedIndex}
            seriesIdPickerItems={
              seriesPickerState.status === "ready"
                ? seriesPickerState.items
                : []
            }
            seriesIdPickerLoading={seriesPickerState.status === "loading" || seriesPickerState.status === "idle"}
            seriesIdPickerError={seriesPickerState.status === "error" ? seriesPickerState.message : null}
            cardIconConvertDirPath={cardIconMapState.convertDirPath}
            cardIconNameOrder={cardIconMapState.status === "ready" ? cardIconMapState.nameOrder : []}
            cardIconIndexPickerItems={cardIconMapState.status === "ready" ? cardIconMapState.pickerItems : []}
            cardIconIndexPickerLoading={cardIconMapState.status === "loading" || cardIconMapState.status === "idle"}
            cardIconIndexPickerError={cardIconMapState.status === "error" ? cardIconMapState.message : null}
            bgmCuePickerItems={bgmPickerState.status === "ready" ? bgmPickerState.items : []}
            bgmCuePickerLoading={bgmPickerState.status === "loading" || bgmPickerState.status === "idle"}
            bgmCuePickerError={bgmPickerState.status === "error" ? bgmPickerState.message : null}
            guiPackItems={guiPackItems}
            guiPackLoading={guiPackLoading}
            guiPackError={guiPackError}
            onOpenGuiPackFolder={(hash) => void handleOpenGuiPackFolder(hash)}
            onExtractGuiPack={(hash, fieldKey) => void handleExtractGuiPack(hash, fieldKey)}
            extractingGuiHash={extractingGuiHash}
            onCloneGuiPack={(hash, fieldKey, structureName) =>
              handleCloneGuiPack(hash, fieldKey, structureName)
            }
            cloningGuiHash={cloningGuiHash}
            jumpToCharacterIdTable={jumpToCharacterIdTable}
            cloneGuiWritable={loadState.writable}
            onPackMutated={onPackMutated}
            onRevealTreeFolder={onRevealTreeFolder}
            onJumpToNaviList={onJumpToNaviList}
            onCloneApplied={() => void loadGuiPacks()}
            workspaceDocument={workspaceDocument}
            sourceFilePath={loadState.filePath}
            onChange={handleEditorChange}
            onSelectChange={handleEditorSelectChange}
          />
        </CardContent>
      </Card>

      {isInfoDialogOpen ? (
        <AppRndModalShell
          titleId="character-list-info-title"
          title={t("info")}
          headerIcon={<Info className="h-5 w-5 text-primary" />}
          dimensions={CHARACTER_LIST_INFO_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.character-list-info"
          onClose={() => setIsInfoDialogOpen(false)}
        >
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-6 text-sm text-muted-foreground">
            <p>1. 自动加载0xb7367090\series_list.bin</p>
            <p>2. 图片mapping自0xA0253AA0\__convert</p>
            <p>3. 图片透过0xA0253AA0_structure.json来mapping原有顺序</p>
          </div>
        </AppRndModalShell>
      ) : null}

      {isImportDialogOpen ? (
        <AppRndModalShell
          titleId="character-list-import-title"
          title={t("importCharaJson")}
          subtitle={importPreview ? t("validCounts", { valid: importPreview.validCount, total: importPreview.totalCount }) : t("noFileSelected")}
          headerIcon={<Upload className="h-5 w-5 text-primary" />}
          dimensions={CHARACTER_LIST_IMPORT_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.character-list-import"
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
                {t("cancel")}
              </Button>
              <Button
                onClick={() => void handleConfirmImport()}
                disabled={!loadState.writable || !importPreview || importPreview.validCount === 0 || isImporting}
                className="inline-flex items-center gap-2"
              >
                {t("import")}
              </Button>
            </div>
          }
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            {importPreview ? (
              <>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <div className="break-all">{t("fileValue", { path: importPreview.filePath })}</div>
                  <div>
                    {t("importCounts", { total: importPreview.totalCount, valid: importPreview.validCount, invalid: importPreview.invalidCount, duplicates: importPreview.duplicateIds.length })}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t("idsToImport", { count: importPreview.ids.length })}</div>
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

      <FontCoverageErrorDialog
        open={fontCoverageErrorDialogOpen}
        errors={fontCoverageErrors}
        onClose={() => setFontCoverageErrorDialogOpen(false)}
        onForceSave={() => void handleForceSave()}
      />
    </div>
  );
}
