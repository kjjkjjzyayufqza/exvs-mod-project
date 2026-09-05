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
import { useTranslation } from "react-i18next";
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
  buildPilotVoiceResourcePack,
  emptyPilotVoiceFields,
  emptyPilotVoiceResourceRecord,
  finalizePilotVoiceResourceEntry,
  parsePackageHashInput,
  parsePilotVoiceResourcePack,
  PILOT_VOICE_RESOURCE_PACK_HASH,
  type PilotVoiceResourceRecord,
  type PilotVoiceResourceTable,
} from "./pilotVoiceResourceDocument";
import {
  buildPilotVoiceResourceSourceFhm2dPath,
  initPilotVoiceResourcePack,
} from "./initPilotVoiceResourcePack";

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
      table: PilotVoiceResourceTable;
    };

type PilotVoiceResourceViewProps = {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
};

function recordLabel(record: PilotVoiceResourceRecord, emptyName: string): string {
  return record.voiceStem?.trim() || emptyName;
}

function VoiceStemField({
  value,
  empty,
  disabled,
  onCommit,
}: {
  value: string;
  empty: boolean;
  disabled: boolean;
  onCommit: (next: string) => void;
}) {
  const { t } = useTranslation("test-lists");
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  return (
    <div className="space-y-1">
      <Label className={cn("text-xs", empty && "text-amber-600")}>{t("pilotVoice.voice")}</Label>
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onCommit(text.replace(/\s+/g, ""))}
        placeholder={t("common.empty")}
        disabled={disabled}
        className={cn("h-8 font-mono text-xs", empty && "border-amber-500")}
      />
    </div>
  );
}

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

export default function PilotVoiceResourceView({
  folderPath,
  isActive,
  onUnsavedChanges,
  onPackMutated,
  workspaceDocument,
}: PilotVoiceResourceViewProps) {
  const { t } = useTranslation("test-lists");
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [hasChanges, setHasChanges] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const lastLoadedKeyRef = useRef("");
  const obDplCachePath = useConfigStore((s) => s.obDplCachePath);

  const markChanged = useCallback(
    (table: PilotVoiceResourceTable) => {
      setLoadState((prev) => (prev.status === "ready" ? { ...prev, table } : prev));
      setHasChanges(true);
      onUnsavedChanges?.(true);
    },
    [onUnsavedChanges],
  );

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
        await resolveWorkspaceContent(folderPath, workspaceDocument, "pilot-voice-resource"),
      );
      const pack = content.existing ?? content.configured;
      const parsed = await parsePilotVoiceResourcePack(pack.folderPath);
      setLoadState({
        status: "ready",
        pack,
        sourceLayout: content.sourceLayout,
        writable: content.writable,
        filePath: parsed.filePath,
        table: parsed.table,
      });
      setSelectedIndex(parsed.table.records.length ? 0 : null);
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
  }, [folderPath, onUnsavedChanges, workspaceDocument]);

  useEffect(() => {
    if (!isActive) return;
    const routePrefix = workspaceDocument.assetRoutes["unit.sound"]?.prefix ?? "";
    const key = `${folderPath}::pilot-voice-resource::${routePrefix}`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load();
  }, [folderPath, isActive, load, workspaceDocument]);

  const selected = useMemo(() => {
    if (loadState.status !== "ready" || selectedIndex == null) return null;
    return loadState.table.records[selectedIndex] ?? null;
  }, [loadState, selectedIndex]);

  const visibleRecords = useMemo(() => {
    if (loadState.status !== "ready") return [];
    const query = searchQuery.trim().toLowerCase();
    return loadState.table.records
      .map((record, index) => ({ record, index }))
      .filter(({ record }) =>
        query ? recordLabel(record, t("pilotVoice.newVoice")).toLowerCase().includes(query) : true,
      );
  }, [loadState, searchQuery]);

  const updateSelected = useCallback(
    async (patch: Partial<PilotVoiceResourceRecord>) => {
      if (loadState.status !== "ready" || selectedIndex == null || !loadState.writable) return;
      const current = loadState.table.records[selectedIndex];
      if (!current) return;
      let nextRecord = { ...current, ...patch };
      if (patch.voiceStem !== undefined) {
        try {
          nextRecord = await finalizePilotVoiceResourceEntry(nextRecord);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error));
          return;
        }
      }
      const records = loadState.table.records.map((record, index) =>
        index === selectedIndex ? nextRecord : record,
      );
      markChanged({ ...loadState.table, records });
    },
    [loadState, markChanged, selectedIndex],
  );

  const handleAdd = useCallback(() => {
    if (loadState.status !== "ready" || !loadState.writable) return;
    const records = [...loadState.table.records, emptyPilotVoiceResourceRecord()];
    markChanged({ ...loadState.table, records });
    setSelectedIndex(records.length - 1);
  }, [loadState, markChanged]);

  const handleDelete = useCallback(() => {
    if (loadState.status !== "ready" || selectedIndex == null || !loadState.writable) return;
    const records = loadState.table.records.filter((_, index) => index !== selectedIndex);
    markChanged({ ...loadState.table, records });
    setSelectedIndex(records.length ? Math.min(selectedIndex, records.length - 1) : null);
  }, [loadState, markChanged, selectedIndex]);

  const handleSave = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error(t("common.legacyReadOnlyShort"));
      return;
    }
    const incomplete = loadState.table.records.findIndex((record) => emptyPilotVoiceFields(record).length > 0);
    if (incomplete >= 0) {
      setSelectedIndex(incomplete);
      toast.error(
        t("sound.rowEmptyFields", {
          row: incomplete,
          fields: emptyPilotVoiceFields(loadState.table.records[incomplete]).join(", "),
        }),
      );
      return;
    }
    try {
      const written = await buildPilotVoiceResourcePack(loadState.table, loadState.filePath);
      setLoadState({ ...loadState, table: written });
      setHasChanges(false);
      onUnsavedChanges?.(false);
      onPackMutated?.(workspacePackIdentityFromResolved(loadState.pack, "configured"));
      toast.success(t("sound.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [loadState, onPackMutated, onUnsavedChanges]);

  const handleInitPack = useCallback(async () => {
    const sourceFhm2dPath = buildPilotVoiceResourceSourceFhm2dPath(obDplCachePath ?? "");
    if (!sourceFhm2dPath) {
      toast.error(t("common.setObDplcacheInit"));
      return;
    }
    setIsInitializing(true);
    try {
      await initPilotVoiceResourcePack({
        sourceFhm2dPath,
        workspaceRoot: folderPath,
        workspaceDocument,
      });
      lastLoadedKeyRef.current = "";
      toast.success(t("pilotVoice.unpacked"));
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

  const selectedEmpty = selected ? emptyPilotVoiceFields(selected) : [];

  return (
    <SoundTableWorkbench
      isActive={isActive}
      title={t("pilotVoice.title")}
      purpose={t("pilotVoice.purpose")}
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
                value: `${PILOT_VOICE_RESOURCE_PACK_HASH}.fhm2d`,
              },
            ]
          : undefined
      }
      loadedLabel={
        loadState.status === "ready" ? t("sound.loadedVoices", { count: loadState.table.records.length }) : undefined
      }
      notice={
        loadState.status === "ready" ? (
          <LegacyWorkspaceMoveNotice
            workspaceRoot={folderPath}
            workspaceDocument={workspaceDocument}
            contentId="pilot-voice-resource"
            sourceLayout={loadState.sourceLayout}
            configuredPath={loadState.pack.folderPath}
            onMoved={() => void load()}
            className="mt-2"
          />
        ) : null
      }
      addPanel={
        loadState.status === "ready" ? (
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!loadState.writable}
            className="h-8"
          >
            <Plus className="h-4 w-4" />
            {t("common.add")}
          </Button>
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
                {visibleRecords.map(({ record, index }) => {
                  const missing = emptyPilotVoiceFields(record);
                  const selectedRow = index === selectedIndex;
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      className={cn(
                        "block w-full px-3 py-2 text-left text-xs transition-colors",
                        selectedRow ? "bg-accent" : "hover:bg-muted/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{recordLabel(record, t("pilotVoice.newVoice"))}</span>
                        {missing.length > 0 ? (
                          <span className="shrink-0 text-[10px] font-medium text-amber-600">{t("common.warning")}</span>
                        ) : null}
                      </div>
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
            <VoiceStemField
              value={selected.voiceStem ?? ""}
              empty={selectedEmpty.includes("voice")}
              disabled={!loadState.writable}
              onCommit={(voiceStem) => void updateSelected({ voiceStem })}
            />
            <HashField
              label={t("pilotVoice.voiceKey")}
              value={selected.voiceKey}
              empty={selectedEmpty.includes("voiceKey")}
              disabled={!loadState.writable}
              onCommit={(voiceKey) => void updateSelected({ voiceKey })}
            />
            <HashField
              label={t("pilotVoice.streamPathId")}
              value={selected.streamPathId}
              empty={selectedEmpty.includes("streamPathId")}
              disabled={!loadState.writable}
              onCommit={(streamPathId) => void updateSelected({ streamPathId })}
            />
            <HashField
              label={t("pilotVoice.votPackage")}
              value={selected.votPackage}
              empty={selectedEmpty.includes("votPackage")}
              disabled={!loadState.writable}
              onCommit={(votPackage) => void updateSelected({ votPackage })}
            />
            <HashField
              label={t("pilotVoice.dummyPackage")}
              value={selected.dummyPackage}
              empty={selectedEmpty.includes("dummyPackage")}
              disabled={!loadState.writable}
              onCommit={(dummyPackage) => void updateSelected({ dummyPackage })}
            />
            <HashField
              label={t("pilotVoice.bankPackage")}
              value={selected.bankPackage}
              empty={selectedEmpty.includes("bankPackage")}
              disabled={!loadState.writable}
              onCommit={(bankPackage) => void updateSelected({ bankPackage })}
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
