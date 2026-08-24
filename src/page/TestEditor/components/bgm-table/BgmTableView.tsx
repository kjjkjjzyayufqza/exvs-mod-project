import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
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
import {
  BGM_BANK_UPDATE_02_PACK_HASH,
  BGM_TABLE_PACK_HASH,
  bgmEntryLabel,
  bgmUpdate02AudioPath,
  buildBgmTablePack,
  emptyBgmTableEntry,
  emptyBgmTableFields,
  finalizeBgmTableEntry,
  findNus3bankFile,
  parseBgmTablePack,
  type BgmTableData,
  type BgmTableEntry,
} from "./bgmTableDocument";
import { buildBgmTableSourceFhm2dPath, initBgmTablePack } from "./initBgmTablePack";
import {
  buildBgmBankUpdate02SourceFhm2dPath,
  initBgmBankUpdate02Pack,
} from "./initBgmBankUpdate02Pack";
import { parsePackageHashInput } from "../pilot-voice-resource/pilotVoiceResourceDocument";

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
      table: BgmTableData;
    };

type BgmTableViewProps = {
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
        placeholder="empty"
        disabled={disabled}
        className={cn("h-8 font-mono text-xs tabular-nums", empty && "border-amber-500")}
      />
    </div>
  );
}

export default function BgmTableView({
  folderPath,
  isActive,
  onUnsavedChanges,
  onPackMutated,
  workspaceDocument,
}: BgmTableViewProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [hasChanges, setHasChanges] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [addCueName, setAddCueName] = useState("vstg_battle_9004");
  const [isInitializing, setIsInitializing] = useState(false);
  const [isUnpackingBank, setIsUnpackingBank] = useState(false);
  const [bankPath, setBankPath] = useState<string | null>(null);
  const [audioPath, setAudioPath] = useState("");
  const lastLoadedKeyRef = useRef("");
  const obDplCachePath = useConfigStore((s) => s.obDplCachePath);

  const markChanged = useCallback(
    (table: BgmTableData) => {
      setLoadState((prev) => (prev.status === "ready" ? { ...prev, table } : prev));
      setHasChanges(true);
      onUnsavedChanges?.(true);
    },
    [onUnsavedChanges],
  );

  const refreshRelatedPaths = useCallback(async () => {
    const audio = await bgmUpdate02AudioPath(obDplCachePath ?? "");
    setAudioPath(audio);
    try {
      const bankContent = await resolveWorkspaceContent(folderPath, workspaceDocument, "bgm-bank-update-02");
      const pack = bankContent.existing ?? bankContent.configured;
      if (bankContent.sourceLayout === "missing") {
        setBankPath(null);
        return;
      }
      const found = await findNus3bankFile(pack.folderPath);
      setBankPath(found);
    } catch {
      setBankPath(null);
    }
  }, [folderPath, obDplCachePath, workspaceDocument]);

  const load = useCallback(async () => {
    if (!folderPath) {
      setLoadState({ status: "error", folderPath: "", message: "Folder path is empty" });
      setHasChanges(false);
      onUnsavedChanges?.(false);
      return;
    }
    setLoadState({ status: "loading" });
    try {
      const content = await promptAndMigrateWorkspaceContentIfNeeded(
        await resolveWorkspaceContent(folderPath, workspaceDocument, "bgm-table"),
      );
      const pack = content.existing ?? content.configured;
      const parsed = await parseBgmTablePack(pack.folderPath);
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
      await refreshRelatedPaths();
    } catch (error) {
      setLoadState({
        status: "error",
        folderPath,
        message: error instanceof Error ? error.message : String(error),
      });
      setHasChanges(false);
      onUnsavedChanges?.(false);
    }
  }, [folderPath, onUnsavedChanges, refreshRelatedPaths, workspaceDocument]);

  useEffect(() => {
    if (!isActive) return;
    const routePrefix = workspaceDocument.assetRoutes["unit.sound"]?.prefix ?? "";
    const key = `${folderPath}::bgm-table::${routePrefix}`;
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
      .filter(({ entry }) => (query ? bgmEntryLabel(entry).toLowerCase().includes(query) : true));
  }, [loadState, searchQuery]);

  const updateSelected = useCallback(
    async (patch: Partial<BgmTableEntry>) => {
      if (loadState.status !== "ready" || selectedIndex == null || !loadState.writable) return;
      const current = loadState.table.entries[selectedIndex];
      if (!current) return;
      let nextEntry: BgmTableEntry = { ...current, ...patch };
      if (patch.cueName !== undefined || patch.bankGroup !== undefined) {
        try {
          nextEntry = await finalizeBgmTableEntry(nextEntry, loadState.table);
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
      const derived = await finalizeBgmTableEntry(
        { ...emptyBgmTableEntry(), cueName: addCueName, bankGroup: 6 },
        loadState.table,
      );
      const entries = [...loadState.table.entries, derived];
      markChanged({ ...loadState.table, entries, entryIds: entries.map((entry) => entry.entryId) });
      setSelectedIndex(entries.length - 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [addCueName, loadState, markChanged]);

  const handleDelete = useCallback(() => {
    if (loadState.status !== "ready" || selectedIndex == null || !loadState.writable) return;
    const entries = loadState.table.entries.filter((_, index) => index !== selectedIndex);
    markChanged({ ...loadState.table, entries, entryIds: entries.map((entry) => entry.entryId) });
    setSelectedIndex(entries.length ? Math.min(selectedIndex, entries.length - 1) : null);
  }, [loadState, markChanged, selectedIndex]);

  const handleSave = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error("Legacy workspace content is read-only");
      return;
    }
    const incomplete = loadState.table.entries.findIndex((entry) => emptyBgmTableFields(entry).length > 0);
    if (incomplete >= 0) {
      setSelectedIndex(incomplete);
      toast.error(
        `Row ${incomplete} has empty fields: ${emptyBgmTableFields(loadState.table.entries[incomplete]).join(", ")}`,
      );
      return;
    }
    try {
      const written = await buildBgmTablePack(loadState.table, loadState.filePath);
      setLoadState({ ...loadState, table: written, filePath: written.filePath ?? loadState.filePath });
      setHasChanges(false);
      onUnsavedChanges?.(false);
      onPackMutated?.(workspacePackIdentityFromResolved(loadState.pack, "configured"));
      toast.success("Saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [loadState, onPackMutated, onUnsavedChanges]);

  const handleInitPack = useCallback(async () => {
    const sourceFhm2dPath = buildBgmTableSourceFhm2dPath(obDplCachePath ?? "");
    if (!sourceFhm2dPath) {
      toast.error("Set the OB dplcache folder in FHM2D Init first");
      return;
    }
    setIsInitializing(true);
    try {
      await initBgmTablePack({
        sourceFhm2dPath,
        workspaceRoot: folderPath,
        workspaceDocument,
      });
      lastLoadedKeyRef.current = "";
      toast.success("Unpacked BGM table");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsInitializing(false);
    }
  }, [folderPath, load, obDplCachePath, workspaceDocument]);

  const handleInitBank = useCallback(async () => {
    const sourceFhm2dPath = buildBgmBankUpdate02SourceFhm2dPath(obDplCachePath ?? "");
    if (!sourceFhm2dPath) {
      toast.error("Set the OB dplcache folder in FHM2D Init first");
      return;
    }
    setIsUnpackingBank(true);
    try {
      await initBgmBankUpdate02Pack({
        sourceFhm2dPath,
        workspaceRoot: folderPath,
        workspaceDocument,
      });
      toast.success("Unpacked BGM_AC27_UPDATE_02 bank");
      await refreshRelatedPaths();
      onPackMutated?.(
        workspacePackIdentityFromResolved(
          (await resolveWorkspaceContent(folderPath, workspaceDocument, "bgm-bank-update-02")).configured,
          "configured",
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsUnpackingBank(false);
    }
  }, [folderPath, obDplCachePath, onPackMutated, refreshRelatedPaths, workspaceDocument]);

  const workbenchStatus =
    loadState.status === "ready"
      ? "ready"
      : loadState.status === "error" && soundTableMissingMessage(loadState.message)
        ? "missing"
        : loadState.status === "error"
          ? "error"
          : "loading";

  const selectedEmpty = selected ? emptyBgmTableFields(selected) : [];
  const showGroup6Assets = selected?.bankGroup === 6;

  return (
    <SoundTableWorkbench
      isActive={isActive}
      title="BGM table"
      purpose="Register a BGM cueHash in bgm_table.vgsht2. Add the matching cue in Audio Editor."
      status={workbenchStatus}
      errorMessage={loadState.status === "error" ? loadState.message : null}
      unpackLabel="Init pack"
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
                label: "Structure",
                value: loadState.pack.structureJsonPath,
                onOpen: () => void dirname(loadState.pack.structureJsonPath).then((target) => openPath(target)),
              },
              {
                label: "File",
                value: loadState.filePath,
                onOpen: () => void dirname(loadState.filePath).then((target) => openPath(target)),
              },
              {
                label: "Pack",
                value: `${BGM_TABLE_PACK_HASH}.fhm2d`,
              },
            ]
          : undefined
      }
      loadedLabel={
        loadState.status === "ready" ? `Loaded: ${loadState.table.entries.length} cues` : undefined
      }
      notice={
        loadState.status === "ready" ? (
          <LegacyWorkspaceMoveNotice
            workspaceRoot={folderPath}
            workspaceDocument={workspaceDocument}
            contentId="bgm-table"
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
              value={addCueName}
              onChange={(event) => setAddCueName(event.target.value)}
              placeholder="vstg_battle_9004"
              disabled={!loadState.writable}
              className="h-8 font-mono text-xs"
            />
            <Button size="sm" onClick={() => void handleAdd()} disabled={!loadState.writable} className="h-8">
              <Plus className="h-4 w-4" />
              Add
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
              placeholder="Search"
              className="h-8 text-xs"
            />
            <ScrollArea className="min-h-0 flex-1 rounded-md bg-muted/20">
              <div className="py-1">
                {visibleEntries.map(({ entry, index }) => {
                  const missing = emptyBgmTableFields(entry);
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
                        <span className="truncate font-medium">{bgmEntryLabel(entry)}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">g{entry.bankGroup}</span>
                      </div>
                      {missing.length > 0 ? (
                        <div className="text-[10px] font-medium text-amber-600">warning</div>
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
              <div className="text-xs font-medium text-amber-600">Empty: {selectedEmpty.join(", ")}</div>
            ) : null}
            <div className="space-y-1">
              <Label className={cn("text-xs", selectedEmpty.includes("cueName") && "text-amber-600")}>Cue name</Label>
              <Input
                value={selected.cueName ?? ""}
                onChange={(event) => {
                  const entries = loadState.table.entries.map((entry, index) =>
                    index === selectedIndex ? { ...entry, cueName: event.target.value } : entry,
                  );
                  markChanged({ ...loadState.table, entries });
                }}
                onBlur={() => void updateSelected({ cueName: selected.cueName ?? "" })}
                placeholder="vstg_battle_9004"
                disabled={!loadState.writable}
                className={cn("h-8 font-mono text-xs", selectedEmpty.includes("cueName") && "border-amber-500")}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bank group</Label>
              <Input
                type="number"
                value={selected.bankGroup}
                onChange={(event) => {
                  const bankGroup = Number.parseInt(event.target.value, 10) || 0;
                  void updateSelected({ bankGroup, bankGroupCopy: bankGroup });
                }}
                disabled={!loadState.writable}
                className="h-8 font-mono text-xs"
              />
            </div>
            <HashField
              label="cueHash (entryId)"
              value={selected.entryId}
              empty={selectedEmpty.includes("cueHash")}
              disabled={!loadState.writable}
              onCommit={(entryId) => void updateSelected({ entryId })}
            />
            <HashField
              label="cueLabelCrc"
              value={selected.cueLabelCrc}
              empty={selectedEmpty.includes("cueLabelCrc")}
              disabled
              onCommit={() => undefined}
            />
            <HashField label="routeSelector" value={selected.routeSelector} empty={false} disabled onCommit={() => undefined} />
            {showGroup6Assets ? (
              <div className="space-y-2 rounded-md border border-border/60 p-3">
                <div className="text-xs font-medium">Group 6 files (Audio Editor)</div>
                <div className="break-all text-[11px] text-muted-foreground">
                  Audio: {audioPath || "-"}
                </div>
                {audioPath ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={async () => {
                      if (await exists(audioPath)) await openPath(audioPath);
                      else toast.error("Audio file not found");
                    }}
                  >
                    Open audio
                  </Button>
                ) : null}
                <div className="break-all text-[11px] text-muted-foreground">
                  Bank: {bankPath ?? `${BGM_BANK_UPDATE_02_PACK_HASH} not unpacked`}
                </div>
                {bankPath ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => void dirname(bankPath).then((target) => openPath(target))}
                  >
                    Open bank folder
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={isUnpackingBank}
                    onClick={() => void handleInitBank()}
                  >
                    {isUnpackingBank ? "Unpacking bank..." : "Unpack UPDATE_02 bank"}
                  </Button>
                )}
              </div>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={!loadState.writable}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          </div>
        ) : loadState.status === "ready" ? (
          <div className="flex h-full items-center text-sm text-muted-foreground">Select a row, or add one.</div>
        ) : null
      }
    />
  );
}
