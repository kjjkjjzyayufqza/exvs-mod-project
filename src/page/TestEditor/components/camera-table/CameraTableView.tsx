import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Copy, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useConfigStore } from "@/store/configStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  resolveWorkspaceContent,
  type ResolvedWorkspaceContentPack,
} from "@/services/testEditorWorkspace/contentCatalog";
import { promptAndMigrateWorkspaceContentIfNeeded } from "@/services/testEditorWorkspace/contentMigration";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { LegacyWorkspaceMoveNotice } from "../workspace-layout/LegacyWorkspaceMoveNotice";
import {
  SoundTableWorkbench,
  soundTableMissingMessage,
} from "../sound-table/SoundTableWorkbench";
import { ExvsCommonRepackDialog } from "@/page/UnitModelEdit/components/ExvsCommonRepackDialog";
import {
  CAMERA_TABLE_BOOKMARKS,
  CAMERA_TABLE_DEFAULT_FAMILY,
  CAMERA_TABLE_FAMILIES,
  CAMERA_TABLE_PACK_HASH,
  buildCameraTableFile,
  cameraFieldFloat,
  cameraFieldHex,
  cameraFieldUint,
  formatCameraHash,
  isCameraTableFamily,
  parseCameraTablePack,
  type CameraTableData,
  type CameraTableEntry,
  type CameraTableFamily,
} from "./cameraTableDocument";
import { buildCameraTableSourceFhm2dPath, initCameraPack } from "./initCameraPack";
import { groupCameraPacks, type CameraClipPack } from "./groupCameraPacks";

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

function patchEntry(
  table: CameraTableData,
  entryIndex: number,
  patch: Partial<CameraTableEntry>,
): CameraTableData {
  const entries = table.entries.map((entry) =>
    entry.entryIndex === entryIndex ? { ...entry, ...patch } : entry,
  );
  return { ...table, entries };
}

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
  const [selectedPackIndex, setSelectedPackIndex] = useState<number | null>(null);
  const [selectedShotIndex, setSelectedShotIndex] = useState<number | null>(null);
  const [family, setFamily] = useState<CameraTableFamily>(CAMERA_TABLE_DEFAULT_FAMILY);
  const [isInitializing, setIsInitializing] = useState(false);
  const [repackOpen, setRepackOpen] = useState(false);
  const [rawFieldsOpen, setRawFieldsOpen] = useState(false);
  const lastLoadedKeyRef = useRef("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollPackIndexRef = useRef<number | null>(null);
  const obDplCachePath = useConfigStore((s) => s.obDplCachePath);

  const markChanged = useCallback(
    (table: CameraTableData) => {
      setLoadState((prev) => (prev.status === "ready" ? { ...prev, table } : prev));
      setHasChanges(true);
      onUnsavedChanges?.(true);
    },
    [onUnsavedChanges],
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
        setSelectedPackIndex(parsed.entries.length ? 0 : null);
        setSelectedShotIndex(parsed.entries.length ? 0 : null);
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

  const visiblePacks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return packs.map((pack, index) => ({ pack, index }));
    return packs
      .map((pack, index) => ({ pack, index }))
      .filter(({ pack }) => {
        const hash = formatCameraHash(pack.clipHash).toLowerCase();
        const sortRange = `${pack.sortKeyStart}-${pack.sortKeyEnd}`;
        const bookmark = CAMERA_TABLE_BOOKMARKS.find((item) => item.clipHash === pack.clipHash);
        return (
          hash.includes(query) ||
          sortRange.includes(query) ||
          String(pack.sortKeyStart).includes(query) ||
          (bookmark?.label.toLowerCase().includes(query) ?? false)
        );
      });
  }, [packs, searchQuery]);

  const selectedPack: CameraClipPack | null =
    loadState.status === "ready" && selectedPackIndex != null
      ? (packs[selectedPackIndex] ?? null)
      : null;
  const selectedShot: CameraTableEntry | null =
    selectedPack && selectedShotIndex != null
      ? (selectedPack.shots[selectedShotIndex] ?? selectedPack.shots[0] ?? null)
      : null;

  const getScrollElement = useCallback(() => listRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: visiblePacks.length,
    getScrollElement,
    estimateSize: () => 52,
    getItemKey: (index) => visiblePacks[index]?.pack.clipHash ?? index,
    overscan: 10,
  });

  useEffect(() => {
    const target = pendingScrollPackIndexRef.current;
    if (target == null) return;
    const virtIndex = visiblePacks.findIndex((row) => row.index === target);
    if (virtIndex < 0) return;
    pendingScrollPackIndexRef.current = null;
    rowVirtualizer.scrollToIndex(virtIndex, { align: "center" });
  }, [rowVirtualizer, visiblePacks]);

  const handleSave = useCallback(async () => {
    if (loadState.status !== "ready" || !loadState.writable) return;
    try {
      const written = await buildCameraTableFile(loadState.table, loadState.filePath);
      setLoadState({ ...loadState, table: written, filePath: written.filePath ?? loadState.filePath });
      setHasChanges(false);
      onUnsavedChanges?.(false);
      toast.success(t("sound.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [loadState, onUnsavedChanges, t]);

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
    (patch: Partial<CameraTableEntry>) => {
      if (loadState.status !== "ready" || !loadState.writable || !selectedShot) return;
      markChanged(patchEntry(loadState.table, selectedShot.entryIndex, patch));
    },
    [loadState, markChanged, selectedShot],
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
      <SoundTableWorkbench
        isActive={isActive}
        title={t("cameraTable.title")}
        purpose={t("cameraTable.purpose")}
        status={workbenchStatus}
        errorMessage={loadState.status === "error" ? loadState.message : null}
        unpackLabel={t("common.initPack")}
        unpacking={isInitializing}
        unpackDisabled={!folderPath}
        onUnpack={() => void handleInitPack()}
        onReload={() => {
          lastLoadedKeyRef.current = "";
          void load(family);
        }}
        onSave={() => void handleSave()}
        canSave={hasChanges}
        writable={loadState.status === "ready" ? loadState.writable : true}
        toolbarExtra={
          loadState.status === "ready" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRepackOpen(true)}
              className="inline-flex items-center gap-2"
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
              className="mt-2"
            />
          ) : null
        }
        addPanel={
          loadState.status === "ready" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[9rem]">
                  <Label className="text-[10px] text-muted-foreground">{t("cameraTable.family")}</Label>
                  <Select value={family} onValueChange={handleFamilyChange}>
                    <SelectTrigger className="mt-0.5 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAMERA_TABLE_FAMILIES.map((id) => (
                        <SelectItem key={id} value={id} className="text-xs">
                          {id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("cameraTable.search")}
                  className="h-8 min-w-[10rem] flex-1 text-xs"
                />
              </div>
              {family === "01waza" ? (
                <p className="text-[11px] text-amber-600">{t("cameraTable.wazaWarning")}</p>
              ) : null}
              <div className="flex flex-wrap gap-1">
                {CAMERA_TABLE_BOOKMARKS.map((bookmark) => (
                  <Button
                    key={bookmark.id}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      const index = packs.findIndex((pack) => pack.clipHash === bookmark.clipHash);
                      if (index < 0) {
                        toast.error(t("cameraTable.bookmarkMissing", { hash: formatCameraHash(bookmark.clipHash) }));
                        return;
                      }
                      pendingScrollPackIndexRef.current = index;
                      setSearchQuery("");
                      setSelectedPackIndex(index);
                      setSelectedShotIndex(0);
                    }}
                  >
                    {bookmark.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null
        }
        listPanel={
          loadState.status === "ready" ? (
            <div
              ref={listRef}
              className="h-full max-h-[min(70vh,560px)] overflow-auto rounded-md bg-muted/20"
            >
              <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = visiblePacks[virtualRow.index];
                  if (!row) return null;
                  const selected = row.index === selectedPackIndex;
                  const first = row.pack.shots[0];
                  return (
                    <button
                      key={virtualRow.key}
                      type="button"
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      onClick={() => {
                        setSelectedPackIndex(row.index);
                        setSelectedShotIndex(0);
                      }}
                      className={cn(
                        "absolute left-0 top-0 block w-full px-3 py-2 text-left text-xs transition-colors",
                        selected ? "bg-accent" : "hover:bg-muted/60",
                      )}
                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                    >
                      <div className="flex items-center justify-between gap-2 font-mono">
                        <span>{formatCameraHash(row.pack.clipHash)}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {t("cameraTable.shotCount", { count: row.pack.shots.length })}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {t("cameraTable.sortRange", {
                          start: row.pack.sortKeyStart,
                          end: row.pack.sortKeyEnd,
                        })}
                        {first?.fov != null ? ` · FOV ${first.fov}` : ""}
                        {!row.pack.consecutive ? ` · ${t("cameraTable.nonConsecutive")}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null
        }
        detailPanel={
          loadState.status === "ready" && selectedPack && selectedShot ? (
            <div className="space-y-4 rounded-lg bg-muted/20 p-4">
              <div className="space-y-1">
                <Label className="text-xs">{t("cameraTable.clipHash")}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={formatCameraHash(selectedPack.clipHash)}
                    readOnly
                    className="h-8 font-mono text-xs tabular-nums"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    title={t("cameraTable.copyHash")}
                    onClick={() => {
                      void navigator.clipboard.writeText(formatCameraHash(selectedPack.clipHash)).then(
                        () => toast.success(t("cameraTable.hashCopied")),
                        () => toast.error(t("cameraTable.hashCopyFailed")),
                      );
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("cameraTable.clipHashHint")}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedPack.shots.map((shot, index) => (
                  <Button
                    key={shot.entryIndex}
                    type="button"
                    size="sm"
                    variant={index === selectedShotIndex ? "default" : "outline"}
                    className="h-7 px-2 text-[11px]"
                    onClick={() => setSelectedShotIndex(index)}
                  >
                    {t("cameraTable.shotN", { n: index + 1, sort: shot.sortKey })}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("cameraTable.sortKey")}</Label>
                  <Input
                    value={String(selectedShot.sortKey)}
                    readOnly
                    className="h-8 font-mono text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("cameraTable.rowId")}</Label>
                  <Input
                    value={formatCameraHash(selectedShot.entryId)}
                    readOnly
                    className="h-8 font-mono text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("cameraTable.fov")}</Label>
                  <Input
                    value={selectedShot.fov == null ? "" : String(selectedShot.fov)}
                    placeholder={t("cameraTable.fovInherit")}
                    disabled={!loadState.writable}
                    onChange={(event) => {
                      const text = event.target.value.trim();
                      if (!text) {
                        updateSelectedShot({ fov: null });
                        return;
                      }
                      const next = Number(text);
                      if (Number.isFinite(next)) updateSelectedShot({ fov: next });
                    }}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("cameraTable.offset")}</Label>
                  <Input
                    type="number"
                    value={Number.isFinite(selectedShot.offset) ? selectedShot.offset : 0}
                    disabled={!loadState.writable}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next)) updateSelectedShot({ offset: next });
                    }}
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("cameraTable.firstShot")}</Label>
                  <Input
                    type="number"
                    value={selectedShot.firstShot}
                    disabled={!loadState.writable}
                    onChange={(event) => {
                      const next = Number.parseInt(event.target.value, 10);
                      if (Number.isFinite(next)) updateSelectedShot({ firstShot: next >>> 0 });
                    }}
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>
              <Collapsible open={rawFieldsOpen} onOpenChange={setRawFieldsOpen}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
                    {t("cameraTable.rawFields")}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 max-h-48 overflow-auto rounded border bg-background/50 p-2 font-mono text-[10px]">
                    {(loadState.table.fieldSpecs ?? []).map((spec) => (
                      <div key={spec.hash} className="flex justify-between gap-2">
                        <span>{formatCameraHash(spec.hash)} +0x{spec.entryOffset.toString(16)}</span>
                        <span>
                          {spec.kind === 5
                            ? String(cameraFieldFloat(selectedRaw, spec.entryOffset))
                            : formatCameraHash(cameraFieldUint(selectedRaw, spec.entryOffset))}
                          {" "}
                          {cameraFieldHex(selectedRaw, spec.entryOffset)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : loadState.status === "ready" ? (
            <p className="text-sm text-muted-foreground">{t("cameraTable.selectPack")}</p>
          ) : null
        }
      />
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
