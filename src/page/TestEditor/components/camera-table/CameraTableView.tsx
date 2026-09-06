import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, CopyPlus, FileInput, FileJson, PackageCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useConfigStore } from "@/store/configStore";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  resolveWorkspaceContent,
  type ResolvedWorkspaceContentPack,
} from "@/services/testEditorWorkspace/contentCatalog";
import { promptAndMigrateWorkspaceContentIfNeeded } from "@/services/testEditorWorkspace/contentMigration";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { LegacyWorkspaceMoveNotice } from "../workspace-layout/LegacyWorkspaceMoveNotice";
import { soundTableMissingMessage } from "../sound-table/SoundTableWorkbench";
import { ExvsCommonRepackDialog } from "@/page/UnitModelEdit/components/ExvsCommonRepackDialog";
import {
  CAMERA_TABLE_DEFAULT_FAMILY,
  CAMERA_TABLE_FAMILIES,
  CAMERA_TABLE_PACK_HASH,
  applyCameraClipHash,
  buildCameraTableFile,
  formatCameraHash,
  isCameraTableFamily,
  parseCameraTablePack,
  patchCameraEntry,
  removeCameraEntries,
  renameCameraEntryId,
  sortCameraTableByEntryId,
  writeCameraFloatHash,
  writeCameraUintHash,
  type CameraTableData,
  type CameraTableEntry,
  type CameraTableFamily,
} from "./cameraTableDocument";
import { CAM_CMD, TICKS_PER_SECOND } from "./cameraCommandHashes";
import { clipDuration, clipShotStarts, compileClip } from "./compileCameraClip";
import { evalClip } from "./evalCameraClip";
import { CameraClipImportDialog } from "./CameraClipImportDialog";
import { CameraClipJsonViewDialog } from "./CameraClipJsonViewDialog";
import { CameraClipListPanel } from "./CameraClipListPanel";
import { CameraClipScopeDialog, type CameraClipScopeAction } from "./CameraClipScopeDialog";
import { CameraClipPlaybackBar } from "./CameraClipPlaybackBar";
import { CameraClipPreviewCanvas } from "./CameraClipPreviewCanvas";
import { CameraEditorWorkbench } from "./CameraEditorWorkbench";
import { CameraShotInspector } from "./CameraShotInspector";
import {
  cloneCameraClipPackRows,
  cloneCameraShotRow,
  formatCameraClipJson,
  formatCameraShotJson,
  type CameraTableJsonApplyResult,
} from "./cameraTableJson";
import { buildCameraTableSourceFhm2dPath, initCameraPack } from "./initCameraPack";
import {
  filterCameraPacks,
  findCameraPackForEntry,
  groupCameraPacks,
} from "./groupCameraPacks";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; folderPath: string; message: string }
  | {
      status: "ready";
      pack: ResolvedWorkspaceContentPack;
      sourceLayout: "configured" | "legacy" | "missing";
      writable: boolean;
      filePath: string;
      family: CameraTableFamily;
      table: CameraTableData;
    };

type CameraTableViewProps = {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
  modFolderPath?: string;
};

export default function CameraTableView({
  folderPath,
  isActive,
  onUnsavedChanges,
  workspaceDocument,
  modFolderPath,
}: CameraTableViewProps) {
  const { t } = useTranslation("test-lists");
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [hasChanges, setHasChanges] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntryIndex, setSelectedEntryIndex] = useState<number | null>(null);
  const [family, setFamily] = useState<CameraTableFamily>(CAMERA_TABLE_DEFAULT_FAMILY);
  const [isInitializing, setIsInitializing] = useState(false);
  const [repackOpen, setRepackOpen] = useState(false);
  const [jsonViewOpen, setJsonViewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [scopeAction, setScopeAction] = useState<CameraClipScopeAction | null>(null);
  const [rawFieldsOpen, setRawFieldsOpen] = useState(false);
  const [clock, setClock] = useState(0);
  const [playing, setPlaying] = useState(false);
  const lastLoadedKeyRef = useRef("");
  const obDplCachePath = useConfigStore((s) => s.obDplCachePath);
  const viewZoom = useConfigStore((s) => s.cameraPreviewViewZoom);
  const setCameraPreviewViewZoom = useConfigStore((s) => s.setCameraPreviewViewZoom);
  const handleViewZoomChange = useCallback((zoom: number) => {
    void setCameraPreviewViewZoom(zoom);
  }, [setCameraPreviewViewZoom]);

  const markChanged = useCallback(
    (table: CameraTableData) => {
      setLoadState((prev) => (prev.status === "ready" ? { ...prev, table } : prev));
      setHasChanges(true);
      onUnsavedChanges?.(true);
    },
    [onUnsavedChanges],
  );

  const commitJsonResult = useCallback(
    (result: Extract<CameraTableJsonApplyResult, { ok: true }>) => {
      markChanged(result.table);
      if (result.selection.clearSearch) setSearchQuery("");
      const match = result.table.entries.find(
        (entry) => (entry.entryId >>> 0) === (result.selection.entryId >>> 0),
      );
      if (match) setSelectedEntryIndex(match.entryIndex);
    },
    [markChanged],
  );

  const load = useCallback(
    async (nextFamily: CameraTableFamily = family) => {
      if (!folderPath) {
        setLoadState({ status: "error", folderPath: "", message: t("common.folderPathEmpty") });
        setHasChanges(false);
        onUnsavedChanges?.(false);
        return;
      }
      setLoadState({ status: "loading" });
      try {
        const content = await promptAndMigrateWorkspaceContentIfNeeded(
          await resolveWorkspaceContent(folderPath, workspaceDocument, "camera-table"),
        );
        const pack = content.existing ?? content.configured;
        const parsed = await parseCameraTablePack(pack.folderPath, nextFamily);
        setLoadState({
          status: "ready",
          pack,
          sourceLayout: content.sourceLayout,
          writable: content.writable,
          filePath: parsed.filePath ?? pack.filePath ?? "",
          family: nextFamily,
          table: parsed,
        });
        setSelectedEntryIndex(parsed.entries.length ? 0 : null);
        setHasChanges(false);
        onUnsavedChanges?.(false);
      } catch (error) {
        setLoadState({
          status: "error",
          folderPath,
          message: error instanceof Error ? error.message : String(error),
        });
        setHasChanges(false);
        onUnsavedChanges?.(false);
      }
    },
    [family, folderPath, onUnsavedChanges, t, workspaceDocument],
  );

  useEffect(() => {
    if (!isActive) return;
    const routePrefix = workspaceDocument.assetRoutes["unit.model"]?.prefix ?? "";
    const key = `${folderPath}::camera-table::${routePrefix}::${family}`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load(family);
  }, [family, folderPath, isActive, load, workspaceDocument]);

  const packs = useMemo(() => {
    if (loadState.status !== "ready") return [];
    return groupCameraPacks(loadState.table.entries);
  }, [loadState]);

  const visiblePacks = useMemo(() => filterCameraPacks(packs, searchQuery), [packs, searchQuery]);

  const selectedShot: CameraTableEntry | null =
    loadState.status === "ready" && selectedEntryIndex != null
      ? (loadState.table.entries.find((entry) => entry.entryIndex === selectedEntryIndex) ??
        loadState.table.entries[selectedEntryIndex] ??
        null)
      : null;
  const selectedPackMatch =
    selectedEntryIndex != null ? findCameraPackForEntry(packs, selectedEntryIndex) : null;
  const selectedPack = selectedPackMatch?.pack ?? null;
  const selectedShotIndex = selectedPackMatch?.shotIndex ?? 0;

  const compiledShots = useMemo(() => {
    if (loadState.status !== "ready" || !selectedPack) return [];
    return compileClip(selectedPack.shots, loadState.table.entriesRaw, loadState.table.fieldSpecs ?? []);
  }, [loadState, selectedPack]);

  const clipTotal = useMemo(() => clipDuration(compiledShots), [compiledShots]);
  const shotStarts = useMemo(() => clipShotStarts(compiledShots), [compiledShots]);
  const pose = useMemo(() => evalClip(compiledShots, clock), [compiledShots, clock]);
  const packKey = selectedPack ? `${selectedPack.clipHash}:${selectedPack.sortKeyStart}` : "";
  const shotStartsRef = useRef(shotStarts);
  shotStartsRef.current = shotStarts;

  useEffect(() => {
    setPlaying(false);
    setClock(shotStartsRef.current[selectedShotIndex] ?? 0);
  }, [packKey, selectedEntryIndex, selectedShotIndex]);

  useEffect(() => {
    if (!isActive) setPlaying(false);
  }, [isActive]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setClock((prev) => prev + dt * TICKS_PER_SECOND);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    if (!playing || clipTotal <= 0) return;
    if (clock >= clipTotal) {
      setPlaying(false);
      setClock(clipTotal);
    }
  }, [clock, clipTotal, playing]);

  const handleSave = useCallback(async () => {
    if (loadState.status !== "ready" || !loadState.writable) return;
    try {
      const keepId = selectedShot?.entryId;
      const sorted = sortCameraTableByEntryId(loadState.table);
      const written = await buildCameraTableFile(sorted, loadState.filePath);
      setLoadState({ ...loadState, table: written, filePath: written.filePath ?? loadState.filePath });
      const match =
        keepId == null
          ? null
          : written.entries.find((entry) => (entry.entryId >>> 0) === (keepId >>> 0));
      setSelectedEntryIndex(match?.entryIndex ?? written.entries[0]?.entryIndex ?? null);
      setHasChanges(false);
      onUnsavedChanges?.(false);
      toast.success(t("sound.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [loadState, onUnsavedChanges, selectedShot, t]);

  const handleInitPack = useCallback(async () => {
    const sourceFhm2dPath = buildCameraTableSourceFhm2dPath(obDplCachePath ?? "");
    if (!sourceFhm2dPath) {
      toast.error(t("common.setObDplcacheInit"));
      return;
    }
    setIsInitializing(true);
    try {
      await initCameraPack({
        sourceFhm2dPath,
        workspaceRoot: folderPath,
        workspaceDocument,
      });
      lastLoadedKeyRef.current = "";
      toast.success(t("cameraTable.unpacked"));
      await load(family);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsInitializing(false);
    }
  }, [family, folderPath, load, obDplCachePath, t, workspaceDocument]);

  const handleFamilyChange = useCallback(
    (next: string) => {
      if (!isCameraTableFamily(next) || next === family) return;
      if (hasChanges) {
        toast.error(t("cameraTable.saveBeforeFamily"));
        return;
      }
      setFamily(next);
      lastLoadedKeyRef.current = "";
    },
    [family, hasChanges, t],
  );

  const updateSelectedShot = useCallback(
    (overlay: Partial<CameraTableEntry>, writeRaw?: (raw: number[]) => number[]) => {
      if (loadState.status !== "ready" || !loadState.writable || !selectedShot) return;
      const specs = loadState.table.fieldSpecs;
      markChanged(
        patchCameraEntry(loadState.table, selectedShot.entryIndex, overlay, (raw) => {
          let next = writeRaw ? writeRaw(raw) : raw;
          if (overlay.fov !== undefined) {
            next = writeCameraFloatHash(next, specs, CAM_CMD.fovV0, overlay.fov ?? Number.NaN);
          }
          if (overlay.offset !== undefined) {
            next = writeCameraFloatHash(next, specs, CAM_CMD.offset, overlay.offset ?? Number.NaN);
          }
          if (overlay.firstShot !== undefined) {
            next = writeCameraUintHash(next, specs, CAM_CMD.firstShot, overlay.firstShot);
          }
          if (overlay.clipHash !== undefined) {
            next = writeCameraUintHash(next, specs, CAM_CMD.clipHash, overlay.clipHash);
          }
          if (overlay.sortKey !== undefined) {
            next = writeCameraUintHash(next, specs, CAM_CMD.sortKey, overlay.sortKey);
          }
          return next;
        }),
      );
    },
    [loadState, markChanged, selectedShot],
  );

  const writeSelectedFloat = useCallback(
    (hash: number, value: number, overlay?: Partial<CameraTableEntry>) => {
      if (loadState.status !== "ready" || !loadState.writable || !selectedShot) return;
      const specs = loadState.table.fieldSpecs;
      markChanged(
        patchCameraEntry(loadState.table, selectedShot.entryIndex, overlay ?? {}, (raw) =>
          writeCameraFloatHash(raw, specs, hash, value),
        ),
      );
    },
    [loadState, markChanged, selectedShot],
  );

  const writeSelectedUint = useCallback(
    (hash: number, value: number) => {
      if (loadState.status !== "ready" || !loadState.writable || !selectedShot) return;
      const specs = loadState.table.fieldSpecs;
      markChanged(
        patchCameraEntry(loadState.table, selectedShot.entryIndex, {}, (raw) =>
          writeCameraUintHash(raw, specs, hash, value),
        ),
      );
    },
    [loadState, markChanged, selectedShot],
  );

  const handleCopyJson = useCallback(async () => {
    if (loadState.status !== "ready" || selectedEntryIndex == null) {
      toast.error(t("cameraTable.selectPack"));
      return;
    }
    setScopeAction("copy");
  }, [loadState, selectedEntryIndex, t]);

  const handleCloneShot = useCallback(() => {
    if (loadState.status !== "ready" || !loadState.writable || !selectedPack || !selectedShot) {
      toast.error(t("cameraTable.selectPack"));
      return;
    }
    setScopeAction("clone");
  }, [loadState, selectedPack, selectedShot, t]);

  const handleRemove = useCallback(() => {
    if (loadState.status !== "ready" || !loadState.writable || !selectedPack || !selectedShot) {
      toast.error(t("cameraTable.selectPack"));
      return;
    }
    setScopeAction("remove");
  }, [loadState, selectedPack, selectedShot, t]);

  const handleRenameEntryId = useCallback(
    (entryId: number) => {
      if (loadState.status !== "ready" || !loadState.writable || !selectedShot) return;
      const result = renameCameraEntryId(loadState.table, selectedShot.entryIndex, entryId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      markChanged(result.table);
      toast.success(t("cameraTable.entryIdRenamed", { id: formatCameraHash(entryId) }));
    },
    [loadState, markChanged, selectedShot, t],
  );

  const handleApplyClipHash = useCallback(
    (clipHash: number, wholePack: boolean) => {
      if (loadState.status !== "ready" || !loadState.writable || !selectedPack || !selectedShot) return;
      const indexes = wholePack
        ? selectedPack.shots.map((item) => item.entryIndex)
        : [selectedShot.entryIndex];
      markChanged(applyCameraClipHash(loadState.table, indexes, clipHash));
      toast.success(
        t(wholePack ? "cameraTable.clipHashRenamedPack" : "cameraTable.clipHashRenamedShot", {
          hash: formatCameraHash(clipHash),
        }),
      );
    },
    [loadState, markChanged, selectedPack, selectedShot, t],
  );

  const handleScopeChoose = useCallback(
    async (scope: "shot" | "clip") => {
      setScopeAction(null);
      if (loadState.status !== "ready" || !selectedPack || !selectedShot || scopeAction == null) return;

      if (scopeAction === "copy") {
        const text =
          scope === "clip"
            ? formatCameraClipJson(loadState.table, family, selectedPack)
            : formatCameraShotJson(loadState.table, family, selectedShot.entryIndex);
        if (!text) {
          toast.error(t("cameraTable.selectPack"));
          return;
        }
        try {
          await writeText(text);
          toast.success(
            t(scope === "clip" ? "cameraTable.jsonView.toast.copiedClip" : "cameraTable.jsonView.toast.copied"),
          );
        } catch {
          toast.error(t("cameraTable.jsonView.toast.copyFailed"));
        }
        return;
      }

      if (!loadState.writable) {
        toast.error(t("cameraTable.selectPack"));
        return;
      }

      if (scopeAction === "clone") {
        const result =
          scope === "clip"
            ? cloneCameraClipPackRows(loadState.table, selectedPack)
            : cloneCameraShotRow(loadState.table, selectedPack, selectedShot);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        commitJsonResult(result);
        toast.success(
          t(scope === "clip" ? "cameraTable.jsonView.toast.clonedClip" : "cameraTable.jsonView.toast.cloned", {
            id: formatCameraHash(result.selection.entryId),
            hash: formatCameraHash(result.selection.clipHash),
          }),
        );
        return;
      }

      const drop =
        scope === "clip"
          ? selectedPack.shots.map((item) => item.entryIndex)
          : [selectedShot.entryIndex];
      const nextTable = removeCameraEntries(loadState.table, drop);
      const nextPacks = groupCameraPacks(nextTable.entries);
      const sameClip = nextPacks.find((pack) => (pack.clipHash >>> 0) === (selectedPack.clipHash >>> 0));
      let nextIndex: number | null = null;
      if (sameClip?.shots.length) {
        nextIndex = sameClip.shots[Math.min(selectedShotIndex, sameClip.shots.length - 1)]?.entryIndex ?? null;
      } else {
        const oldIndex = packs.findIndex((pack) => (pack.clipHash >>> 0) === (selectedPack.clipHash >>> 0));
        const neighbor = nextPacks[Math.min(Math.max(oldIndex, 0), Math.max(nextPacks.length - 1, 0))];
        nextIndex = neighbor?.shots[0]?.entryIndex ?? nextTable.entries[0]?.entryIndex ?? null;
      }
      markChanged(nextTable);
      setSelectedEntryIndex(nextIndex);
      toast.success(t(scope === "clip" ? "cameraTable.removedClip" : "cameraTable.removedShot"));
    },
    [
      commitJsonResult,
      family,
      loadState,
      markChanged,
      packs,
      scopeAction,
      selectedPack,
      selectedShot,
      selectedShotIndex,
      t,
    ],
  );

  const workbenchStatus =
    loadState.status === "ready"
      ? "ready"
      : loadState.status === "error" && soundTableMissingMessage(loadState.message)
        ? "missing"
        : loadState.status === "error"
          ? "error"
          : "loading";

  const selectedRaw = selectedShot
    ? loadState.status === "ready"
      ? loadState.table.entriesRaw[selectedShot.entryIndex]
      : undefined
    : undefined;

  return (
    <>
      <CameraEditorWorkbench
        isActive={isActive}
        title={t("cameraTable.title")}
        purpose={t("cameraTable.purpose")}
        status={workbenchStatus}
        errorMessage={loadState.status === "error" ? loadState.message : null}
        unpackLabel={t("common.initPack")}
        unpacking={isInitializing}
        unpackDisabled={!folderPath}
        filesSummaryLabel={t("cameraTable.workspaceFiles")}
        onUnpack={() => void handleInitPack()}
        onReload={() => {
          lastLoadedKeyRef.current = "";
          void load(family);
        }}
        onSave={() => void handleSave()}
        canSave={hasChanges}
        writable={loadState.status === "ready" ? loadState.writable : true}
        familyControl={
          <Select value={family} onValueChange={handleFamilyChange}>
            <SelectTrigger className="h-9 w-35 font-mono text-xs" aria-label={t("cameraTable.family")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAMERA_TABLE_FAMILIES.map((id) => (
                <SelectItem key={id} value={id} className="font-mono text-xs">
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        toolbarExtra={
          loadState.status === "ready" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRepackOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 px-2.5 transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96]"
            >
              <PackageCheck className="h-4 w-4" />
              {t("common.repack")}
            </Button>
          ) : null
        }
        metaLines={
          loadState.status === "ready"
            ? [
                {
                  label: t("common.structure"),
                  value: loadState.pack.structureJsonPath,
                  onOpen: () =>
                    void dirname(loadState.pack.structureJsonPath).then((target) => openPath(target)),
                },
                {
                  label: t("common.file"),
                  value: loadState.filePath,
                  onOpen: () => void dirname(loadState.filePath).then((target) => openPath(target)),
                },
                {
                  label: t("common.pack"),
                  value: `${CAMERA_TABLE_PACK_HASH}.fhm2d`,
                },
              ]
            : undefined
        }
        loadedLabel={
          loadState.status === "ready"
            ? t("cameraTable.loadedPacks", {
                packs: packs.length,
                shots: loadState.table.entries.length,
              })
            : undefined
        }
        notice={
          loadState.status === "ready" ? (
            <LegacyWorkspaceMoveNotice
              workspaceRoot={folderPath}
              workspaceDocument={workspaceDocument}
              contentId="camera-table"
              sourceLayout={loadState.sourceLayout}
              configuredPath={loadState.pack.folderPath}
              onMoved={() => {
                lastLoadedKeyRef.current = "";
                void load(family);
              }}
            />
          ) : null
        }
        warning={
          loadState.status === "ready" && family === "01waza" ? (
            <p className="text-[11px] text-pretty text-amber-600">{t("cameraTable.wazaWarning")}</p>
          ) : null
        }
        listPanel={
          loadState.status === "ready" ? (
            <CameraClipListPanel
              packs={visiblePacks}
              totalPacks={packs.length}
              totalShots={loadState.table.entries.length}
              selectedEntryIndex={selectedEntryIndex}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSelectEntry={setSelectedEntryIndex}
              tools={
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10px]"
                    disabled={selectedEntryIndex == null}
                    title={t("cameraTable.tools.importTooltip")}
                    onClick={() => setImportOpen(true)}
                  >
                    <FileInput className="h-3 w-3" />
                    {t("cameraTable.tools.import")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10px]"
                    disabled={selectedEntryIndex == null}
                    title={t("cameraTable.tools.jsonViewTooltip")}
                    onClick={() => setJsonViewOpen(true)}
                  >
                    <FileJson className="h-3 w-3" />
                    {t("cameraTable.tools.jsonView")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10px]"
                    disabled={selectedEntryIndex == null}
                    title={t("cameraTable.tools.copyJsonTooltip")}
                    onClick={() => void handleCopyJson()}
                  >
                    <Copy className="h-3 w-3" />
                    {t("cameraTable.tools.copyJson")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10px]"
                    disabled={!loadState.writable || selectedEntryIndex == null}
                    title={t("cameraTable.tools.cloneTooltip")}
                    onClick={handleCloneShot}
                  >
                    <CopyPlus className="h-3 w-3" />
                    {t("cameraTable.tools.clone")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10px] text-destructive"
                    disabled={!loadState.writable || selectedEntryIndex == null}
                    title={t("cameraTable.tools.removeTooltip")}
                    onClick={handleRemove}
                  >
                    <Trash2 className="h-3 w-3" />
                    {t("cameraTable.tools.remove")}
                  </Button>
                </>
              }
            />
          ) : (
            <div />
          )
        }
        inspectorPanel={
          loadState.status === "ready" && selectedPack && selectedShot ? (
            <CameraShotInspector
              pack={selectedPack}
              shot={selectedShot}
              packIndex={selectedShot.entryIndex}
              packTotal={loadState.table.entries.length}
              shotIndex={selectedShotIndex}
              duration={compiledShots[selectedShotIndex ?? 0]?.duration ?? 0}
              raw={selectedRaw}
              specs={loadState.table.fieldSpecs ?? []}
              writable={loadState.writable}
              rawFieldsOpen={rawFieldsOpen}
              onRawFieldsOpenChange={setRawFieldsOpen}
              onWriteFloat={writeSelectedFloat}
              onWriteUint={writeSelectedUint}
              onUpdateShot={updateSelectedShot}
              onRenameEntryId={handleRenameEntryId}
              onApplyClipHash={handleApplyClipHash}
              onSelectShotIndex={(nextIndex) => {
                const next = selectedPack.shots[nextIndex];
                if (next) setSelectedEntryIndex(next.entryIndex);
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-3 text-sm text-pretty text-muted-foreground">
              {t("cameraTable.selectPack")}
            </div>
          )
        }
        stagePanel={
          loadState.status === "ready" && selectedPack && selectedShot ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="min-h-0 flex-1">
                <CameraClipPreviewCanvas
                  pose={pose}
                  playing={playing}
                  clipLabel={`${formatCameraHash(selectedShot.entryId)}  ${formatCameraHash(selectedPack.clipHash)}`}
                  viewZoom={viewZoom}
                  onViewZoomChange={handleViewZoomChange}
                />
              </div>
              <CameraClipPlaybackBar
                clock={Math.min(clock, Math.max(clipTotal, 0))}
                total={clipTotal}
                playing={playing}
                playShotIndex={pose.shotIndex}
                editShotIndex={selectedShotIndex}
                shots={compiledShots}
                onToggle={() => {
                  if (clipTotal <= 0) return;
                  if (clock >= clipTotal) setClock(0);
                  setPlaying((prev) => !prev);
                }}
                onReset={() => {
                  setPlaying(false);
                  setClock(0);
                }}
                onSeek={(next) => {
                  setPlaying(false);
                  setClock(Math.min(Math.max(next, 0), clipTotal));
                }}
                onSelectShot={(index) => {
                  const shot = selectedPack.shots[index];
                  if (shot) setSelectedEntryIndex(shot.entryIndex);
                }}
                viewZoom={viewZoom}
                onViewZoomChange={handleViewZoomChange}
              />
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-1 items-center justify-center px-6 text-sm text-pretty text-zinc-400">
              {t("cameraTable.viewportEmpty")}
            </div>
          )
        }
      />
      {loadState.status === "ready" ? (
        <>
          <CameraClipJsonViewDialog
            open={jsonViewOpen}
            onOpenChange={setJsonViewOpen}
            family={family}
            table={loadState.table}
            pack={selectedPack}
            selectedEntryIndex={selectedEntryIndex}
            writable={loadState.writable}
            onCommit={commitJsonResult}
          />
          <CameraClipImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            family={family}
            table={loadState.table}
            pack={selectedPack}
            selectedEntryIndex={selectedEntryIndex}
            writable={loadState.writable}
            onCommit={commitJsonResult}
          />
          <CameraClipScopeDialog
            open={scopeAction != null}
            action={scopeAction}
            clipHash={selectedPack?.clipHash ?? 0}
            entryId={selectedShot?.entryId ?? 0}
            shotIndex={selectedShotIndex}
            shotCount={selectedPack?.shots.length ?? 0}
            sortKeyStart={selectedPack?.sortKeyStart ?? 0}
            sortKeyEnd={selectedPack?.sortKeyEnd ?? 0}
            onOpenChange={(open) => {
              if (!open) setScopeAction(null);
            }}
            onChoose={(scope) => {
              void handleScopeChoose(scope);
            }}
          />
        </>
      ) : null}
      <ExvsCommonRepackDialog
        open={repackOpen}
        onOpenChange={setRepackOpen}
        modelRoot={loadState.status === "ready" ? loadState.pack.folderPath : null}
        structurePath={loadState.status === "ready" ? loadState.pack.structureJsonPath : null}
        modFolder={modFolderPath ?? ""}
        onValidationResult={() => {}}
        onRepacked={() => {
          toast.success(t("cameraTable.repacked"));
        }}
      />
    </>
  );
}
