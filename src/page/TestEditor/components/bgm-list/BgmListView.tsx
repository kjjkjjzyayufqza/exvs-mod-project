import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/store/configStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatHash } from "@/models/commandTable";
import { cn } from "@/lib/utils";
import {
  resolveWorkspaceContent,
  workspacePackIdentityFromResolved,
  type ResolvedWorkspaceContentPack,
} from "@/services/testEditorWorkspace/contentCatalog";
import { promptAndMigrateWorkspaceContentIfNeeded } from "@/services/testEditorWorkspace/contentMigration";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import { LegacyWorkspaceMoveNotice } from "../workspace-layout/LegacyWorkspaceMoveNotice";
import {
  SoundTableWorkbench,
  soundTableMissingMessage,
} from "../sound-table/SoundTableWorkbench";
import { parsePackageHashInput } from "../pilot-voice-resource/pilotVoiceResourceDocument";
import { BgmCuePickerItem, BgmCuePickerPopover } from "../character-list/BgmCuePickerPopover";
import { bgmEntryLabel, parseBgmTablePack } from "../bgm-table/bgmTableDocument";
import {
  BGM_LIST_PACK_HASH,
  bgmListEntryLabel,
  buildBgmListPack,
  emptyBgmListEntry,
  emptyBgmListFields,
  finalizeBgmListEntry,
  parseBgmListPack,
  type BgmListData,
  type BgmListEntry,
} from "./bgmListDocument";
import { buildBgmListSourceFhm2dPath, initBgmListPack } from "./initBgmListPack";
import { useTranslation } from "react-i18next";

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
      table: BgmListData;
    };

type BgmListViewProps = {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
};

function HashField({
  label,
  value,
  empty,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  empty: boolean;
  disabled: boolean;
  onCommit: (next: number) => void;
}) {
  const { t } = useTranslation("test-lists");
  const [text, setText] = useState(value ? formatHash(value) : "");
  useEffect(() => {
    setText(value ? formatHash(value) : "");
  }, [value]);
  return (
    <div className="space-y-1">
      <Label className={cn("text-xs", empty && "text-amber-600")}>{label}</Label>
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const parsed = parsePackageHashInput(text);
          if (parsed === null) {
            setText(value ? formatHash(value) : "");
            return;
          }
          onCommit(parsed);
        }}
        placeholder={t("common.empty")}
        disabled={disabled}
        className={cn("h-8 font-mono text-xs tabular-nums", empty && "border-amber-500")}
      />
    </div>
  );
}

export default function BgmListView({
  folderPath,
  isActive,
  onUnsavedChanges,
  onPackMutated,
  workspaceDocument,
}: BgmListViewProps) {
  const { t } = useTranslation("test-lists");
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [hasChanges, setHasChanges] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);
  const [cueItems, setCueItems] = useState<BgmCuePickerItem[]>([]);
  const lastLoadedKeyRef = useRef("");
  const obDplCachePath = useConfigStore((s) => s.obDplCachePath);

  const markChanged = useCallback(
    (table: BgmListData) => {
      setLoadState((prev) => (prev.status === "ready" ? { ...prev, table } : prev));
      setHasChanges(true);
      onUnsavedChanges?.(true);
    },
    [onUnsavedChanges],
  );

  const refreshCuePicker = useCallback(async () => {
    try {
      const content = await resolveWorkspaceContent(folderPath, workspaceDocument, "bgm-table");
      const pack = content.existing ?? content.configured;
      if (content.sourceLayout === "missing") {
        setCueItems([]);
        return;
      }
      const parsed = await parseBgmTablePack(pack.folderPath);
      setCueItems(
        parsed.entries.map((entry) => ({
          cueHash: entry.entryId >>> 0,
          cueName: bgmEntryLabel(entry),
          bankGroup: entry.bankGroup,
        })),
      );
    } catch {
      setCueItems([]);
    }
  }, [folderPath, workspaceDocument]);

  const load = useCallback(async () => {
    if (!folderPath) {
      setLoadState({ status: "error", folderPath: "", message: t("common.folderPathEmpty") });
      setHasChanges(false);
      onUnsavedChanges?.(false);
      return;
    }
    setLoadState({ status: "loading" });
    try {
      const content = await promptAndMigrateWorkspaceContentIfNeeded(
        await resolveWorkspaceContent(folderPath, workspaceDocument, "bgm-list"),
      );
      const pack = content.existing ?? content.configured;
      const parsed = await parseBgmListPack(pack.folderPath);
      setLoadState({
        status: "ready",
        pack,
        sourceLayout: content.sourceLayout,
        writable: content.writable,
        filePath: parsed.filePath ?? pack.filePath ?? "",
        table: parsed,
      });
      setSelectedIndex(parsed.entries.length ? 0 : null);
      setHasChanges(false);
      onUnsavedChanges?.(false);
      await refreshCuePicker();
    } catch (error) {
      setLoadState({
        status: "error",
        folderPath,
        message: error instanceof Error ? error.message : String(error),
      });
      setHasChanges(false);
      onUnsavedChanges?.(false);
    }
  }, [folderPath, onUnsavedChanges, refreshCuePicker, workspaceDocument]);

  useEffect(() => {
    if (!isActive) return;
    const routePrefix = workspaceDocument.assetRoutes["list.character"]?.prefix ?? "";
    const key = `${folderPath}::bgm-list::${routePrefix}`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load();
  }, [folderPath, isActive, load, workspaceDocument]);

  const selected = useMemo(() => {
    if (loadState.status !== "ready" || selectedIndex == null) return null;
    return loadState.table.entries[selectedIndex] ?? null;
  }, [loadState, selectedIndex]);

  const visibleEntries = useMemo(() => {
    if (loadState.status !== "ready") return [];
    const query = searchQuery.trim().toLowerCase();
    return loadState.table.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => (query ? bgmListEntryLabel(entry).toLowerCase().includes(query) : true));
  }, [loadState, searchQuery]);

  const updateSelected = useCallback(
    async (patch: Partial<BgmListEntry>) => {
      if (loadState.status !== "ready" || selectedIndex == null || !loadState.writable) return;
      const current = loadState.table.entries[selectedIndex];
      if (!current) return;
      let nextEntry: BgmListEntry = { ...current, ...patch };
      if (patch.title !== undefined || patch.cueHash !== undefined || patch.musicId !== undefined) {
        try {
          nextEntry = await finalizeBgmListEntry(nextEntry, loadState.table);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error));
          return;
        }
      }
      const entries = loadState.table.entries.map((entry, index) =>
        index === selectedIndex ? nextEntry : entry,
      );
      markChanged({ ...loadState.table, entries, entryIds: entries.map((entry) => entry.entryId) });
    },
    [loadState, markChanged, selectedIndex],
  );

  const handleAdd = useCallback(async () => {
    if (loadState.status !== "ready" || !loadState.writable) return;
    try {
      const title = addTitle.trim();
      const derived = await finalizeBgmListEntry(
        {
          ...emptyBgmListEntry(),
          title,
          titleWithNotePrefix: title ? `\u266A${title}` : "",
        },
        loadState.table,
      );
      const entries = [...loadState.table.entries, derived];
      markChanged({ ...loadState.table, entries, entryIds: entries.map((entry) => entry.entryId) });
      setSelectedIndex(entries.length - 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [addTitle, loadState, markChanged]);

  const handleDelete = useCallback(() => {
    if (loadState.status !== "ready" || selectedIndex == null || !loadState.writable) return;
    const entries = loadState.table.entries.filter((_, index) => index !== selectedIndex);
    markChanged({ ...loadState.table, entries, entryIds: entries.map((entry) => entry.entryId) });
    setSelectedIndex(entries.length ? Math.min(selectedIndex, entries.length - 1) : null);
  }, [loadState, markChanged, selectedIndex]);

  const handleSave = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error(t("common.legacyReadOnlyShort"));
      return;
    }
    const incomplete = loadState.table.entries.findIndex((entry) => emptyBgmListFields(entry).length > 0);
    if (incomplete >= 0) {
      setSelectedIndex(incomplete);
      toast.error(
        t("sound.rowEmptyFields", {
          row: incomplete,
          fields: emptyBgmListFields(loadState.table.entries[incomplete]).join(", "),
        }),
      );
      return;
    }
    try {
      const written = await buildBgmListPack(loadState.table, loadState.filePath);
      setLoadState({ ...loadState, table: written, filePath: written.filePath ?? loadState.filePath });
      setHasChanges(false);
      onUnsavedChanges?.(false);
      onPackMutated?.(workspacePackIdentityFromResolved(loadState.pack, "configured"));
      toast.success(t("sound.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [loadState, onPackMutated, onUnsavedChanges]);

  const handleInitPack = useCallback(async () => {
    const sourceFhm2dPath = buildBgmListSourceFhm2dPath(obDplCachePath ?? "");
    if (!sourceFhm2dPath) {
      toast.error(t("common.setObDplcacheInit"));
      return;
    }
    setIsInitializing(true);
    try {
      await initBgmListPack({
        sourceFhm2dPath,
        workspaceRoot: folderPath,
        workspaceDocument,
      });
      lastLoadedKeyRef.current = "";
      toast.success(t("bgmList.unpacked"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsInitializing(false);
    }
  }, [folderPath, load, obDplCachePath, workspaceDocument]);

  const workbenchStatus =
    loadState.status === "ready"
      ? "ready"
      : loadState.status === "error" && soundTableMissingMessage(loadState.message)
        ? "missing"
        : loadState.status === "error"
          ? "error"
          : "loading";

  const selectedEmpty = selected ? emptyBgmListFields(selected) : [];

  return (
    <SoundTableWorkbench
      isActive={isActive}
      title={t("bgmList.title")}
      purpose={t("bgmList.purpose")}
      status={workbenchStatus}
      errorMessage={loadState.status === "error" ? loadState.message : null}
      unpackLabel={t("common.initPack")}
      unpacking={isInitializing}
      unpackDisabled={!folderPath}
      onUnpack={() => void handleInitPack()}
      onReload={() => void load()}
      onSave={() => void handleSave()}
      canSave={hasChanges}
      writable={loadState.status === "ready" ? loadState.writable : true}
      metaLines={
        loadState.status === "ready"
          ? [
              {
                label: t("common.structure"),
                value: loadState.pack.structureJsonPath,
                onOpen: () => void dirname(loadState.pack.structureJsonPath).then((target) => openPath(target)),
              },
              {
                label: t("common.file"),
                value: loadState.filePath,
                onOpen: () => void dirname(loadState.filePath).then((target) => openPath(target)),
              },
              {
                label: t("common.pack"),
                value: `${BGM_LIST_PACK_HASH}.fhm2d`,
              },
            ]
          : undefined
      }
      loadedLabel={
        loadState.status === "ready" ? t("sound.loadedTitles", { count: loadState.table.entries.length }) : undefined
      }
      notice={
        loadState.status === "ready" ? (
          <LegacyWorkspaceMoveNotice
            workspaceRoot={folderPath}
            workspaceDocument={workspaceDocument}
            contentId="bgm-list"
            sourceLayout={loadState.sourceLayout}
            configuredPath={loadState.pack.folderPath}
            onMoved={() => void load()}
            className="mt-2"
          />
        ) : null
      }
      addPanel={
        loadState.status === "ready" ? (
          <div className="flex items-center gap-2">
            <Input
              value={addTitle}
              onChange={(event) => setAddTitle(event.target.value)}
              placeholder={t("bgmList.hudTitle")}
              disabled={!loadState.writable}
              className="h-8 text-xs"
            />
            <Button size="sm" onClick={() => void handleAdd()} disabled={!loadState.writable} className="h-8">
              <Plus className="h-4 w-4" />
              {t("common.add")}
            </Button>
          </div>
        ) : null
      }
      listPanel={
        loadState.status === "ready" ? (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("common.search")}
              className="h-8 text-xs"
            />
            <ScrollArea className="min-h-0 flex-1 rounded-md bg-muted/20">
              <div className="py-1">
                {visibleEntries.map(({ entry, index }) => {
                  const missing = emptyBgmListFields(entry);
                  const selectedRow = index === selectedIndex;
                  return (
                    <button
                      key={`${entry.entryId}-${index}`}
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      className={cn(
                        "block w-full px-3 py-2 text-left text-xs transition-colors",
                        selectedRow ? "bg-accent" : "hover:bg-muted/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{bgmListEntryLabel(entry)}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {t("bgmList.idAbbrev", { id: entry.musicId })}
                        </span>
                      </div>
                      {missing.length > 0 ? (
                        <div className="text-[10px] font-medium text-amber-600">{t("common.warning")}</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        ) : null
      }
      detailPanel={
        loadState.status === "ready" && selected && selectedIndex != null ? (
          <div className="space-y-4 rounded-lg bg-muted/20 p-4">
            {selectedEmpty.length > 0 ? (
              <div className="text-xs font-medium text-amber-600">
                {t("sound.emptyFields", { fields: selectedEmpty.join(", ") })}
              </div>
            ) : null}
            <div className="space-y-1">
              <Label className={cn("text-xs", selectedEmpty.includes("title") && "text-amber-600")}>
                {t("bgmList.titleField")}
              </Label>
              <Input
                value={selected.title ?? ""}
                onChange={(event) => {
                  const title = event.target.value;
                  const note = selected.titleWithNotePrefix.startsWith("\u266A")
                    ? `\u266A${title}`
                    : selected.titleWithNotePrefix;
                  const entries = loadState.table.entries.map((entry, index) =>
                    index === selectedIndex ? { ...entry, title, titleWithNotePrefix: note } : entry,
                  );
                  markChanged({ ...loadState.table, entries });
                }}
                placeholder={t("bgmList.titlePlaceholder")}
                disabled={!loadState.writable}
                className={cn("h-8 text-xs", selectedEmpty.includes("title") && "border-amber-500")}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("bgmList.titleWithNote")}</Label>
              <Input
                value={selected.titleWithNotePrefix ?? ""}
                onChange={(event) => {
                  const entries = loadState.table.entries.map((entry, index) =>
                    index === selectedIndex ? { ...entry, titleWithNotePrefix: event.target.value } : entry,
                  );
                  markChanged({ ...loadState.table, entries });
                }}
                placeholder={t("bgmList.titleNotePlaceholder")}
                disabled={!loadState.writable}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className={cn("text-xs", selectedEmpty.includes("musicId") && "text-amber-600")}>
                {t("bgmList.musicId")}
              </Label>
              <Input
                type="number"
                value={selected.musicId}
                onChange={(event) => {
                  const musicId = Number.parseInt(event.target.value, 10) || 0;
                  void updateSelected({ musicId });
                }}
                disabled={!loadState.writable}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className={cn("text-xs", selectedEmpty.includes("cueHash") && "text-amber-600")}>
                {t("bgmList.cueHashRecord")}
              </Label>
              <div className="flex items-center gap-2">
                <BgmCuePickerPopover
                  onSelect={(cueHash) => void updateSelected({ cueHash })}
                  items={cueItems}
                  selectedValue={selected.cueHash}
                />
              </div>
            </div>
            <HashField
              label={t("bgmList.cueHash")}
              value={selected.cueHash}
              empty={selectedEmpty.includes("cueHash")}
              disabled={!loadState.writable}
              onCommit={(cueHash) => void updateSelected({ cueHash })}
            />
            <HashField
              label={t("bgmList.sourceGroupHash")}
              value={selected.sourceGroupHash}
              empty={false}
              disabled={!loadState.writable}
              onCommit={(sourceGroupHash) => {
                const entries = loadState.table.entries.map((entry, index) =>
                  index === selectedIndex ? { ...entry, sourceGroupHash } : entry,
                );
                markChanged({ ...loadState.table, entries });
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={!loadState.writable}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              {t("common.remove")}
            </Button>
          </div>
        ) : loadState.status === "ready" ? (
          <div className="flex h-full items-center text-sm text-muted-foreground">{t("common.selectRowOrAdd")}</div>
        ) : null
      }
    />
  );
}
