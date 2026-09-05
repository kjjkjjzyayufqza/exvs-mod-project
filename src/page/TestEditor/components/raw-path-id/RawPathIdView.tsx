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
  displayVoiceStem,
  soundTableMissingMessage,
} from "../sound-table/SoundTableWorkbench";
import {
  RAW_PATH_ID_KINDS,
  RAW_PATH_ID_PACK_HASH,
  buildRawPathIdPack,
  derivePilotVoiceSource,
  finalizeRawPathIdEntry,
  parseRawPathIdPack,
  type RawPathIdEntry,
  type RawPathIdKind,
} from "./rawPathIdDocument";
import { buildRawPathIdSourceFhm2dPath, initRawPathIdPack } from "./initRawPathIdPack";
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
      jsonPath: string;
      vgsht1Path: string;
      entries: RawPathIdEntry[];
      issues: string[];
    };

type RawPathIdViewProps = {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
};

function entryGroup(entry: RawPathIdEntry): "voice" | "bgm" | "other" {
  const hay = `${entry.key} ${entry.source}`.toLowerCase();
  if (hay.includes("voice/pilot") || hay.includes("streampath_st_vo_")) return "voice";
  if (hay.includes("/bgm/") || hay.includes("streampath_bgm_")) return "bgm";
  return "other";
}

function fileNameOf(source: string): string {
  const normalized = source.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? source;
}

function previewAudioPath(stem: string): string | null {
  const match = /^VO_(\d{4})_P(\d{2})_(\d)$/i.exec(stem.trim());
  if (!match) return null;
  const normalized = `VO_${match[1]}_P${match[2]}_${match[3]}`;
  return `091waveform/voice/pilot/vo_${match[1]}/${normalized}_01_ST_01.nus3audio`;
}

export default function RawPathIdView({
  folderPath,
  isActive,
  onUnsavedChanges,
  onPackMutated,
  workspaceDocument,
}: RawPathIdViewProps) {
  const { t } = useTranslation("test-lists");
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [hasChanges, setHasChanges] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<"voice" | "all">("voice");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [voiceStem, setVoiceStem] = useState("VO_1000_P01_0");
  const [isInitializing, setIsInitializing] = useState(false);
  const lastLoadedKeyRef = useRef("");
  const obDplCachePath = useConfigStore((s) => s.obDplCachePath);

  const markChanged = useCallback(
    (entries: RawPathIdEntry[]) => {
      setLoadState((prev) => (prev.status === "ready" ? { ...prev, entries } : prev));
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
        await resolveWorkspaceContent(folderPath, workspaceDocument, "raw-path-id"),
      );
      const pack = content.existing ?? content.configured;
      const parsed = await parseRawPathIdPack(pack.folderPath);
      setLoadState({
        status: "ready",
        pack,
        sourceLayout: content.sourceLayout,
        writable: content.writable,
        jsonPath: parsed.jsonPath,
        vgsht1Path: parsed.vgsht1Path,
        entries: parsed.document.entries,
        issues: parsed.issues.map((issue) => issue.message),
      });
      const firstVoice = parsed.document.entries.find((entry) => entryGroup(entry) === "voice");
      setSelectedKey(firstVoice?.key ?? parsed.document.entries[0]?.key ?? null);
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
    const key = `${folderPath}::raw-path-id::${routePrefix}`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void load();
  }, [folderPath, isActive, load, workspaceDocument]);

  const selected = useMemo(() => {
    if (loadState.status !== "ready" || !selectedKey) return null;
    return loadState.entries.find((entry) => entry.key === selectedKey) ?? null;
  }, [loadState, selectedKey]);

  const visibleEntries = useMemo(() => {
    if (loadState.status !== "ready") return [];
    const query = searchQuery.trim().toLowerCase();
    return loadState.entries.filter((entry) => {
      if (groupFilter === "voice" && entryGroup(entry) !== "voice") return false;
      if (!query) return true;
      return `${displayVoiceStem(entry.key)} ${entry.source}`.toLowerCase().includes(query);
    });
  }, [groupFilter, loadState, searchQuery]);

  const updateSelected = useCallback(
    async (patch: Partial<RawPathIdEntry>) => {
      if (loadState.status !== "ready" || !selected || !loadState.writable) return;
      const nextDraft = { ...selected, ...patch };
      const finalized =
        patch.key !== undefined || patch.source !== undefined
          ? await finalizeRawPathIdEntry(nextDraft)
          : nextDraft;
      const next = loadState.entries.map((entry) => (entry.key === selected.key ? finalized : entry));
      markChanged(next);
      setSelectedKey(finalized.key);
    },
    [loadState, markChanged, selected],
  );

  const handleAddVoice = useCallback(async () => {
    if (loadState.status !== "ready" || !loadState.writable) return;
    try {
      const entry = await derivePilotVoiceSource(voiceStem);
      if (loadState.entries.some((row) => row.key === entry.key)) {
        toast.error(t("rawPath.alreadyInTable", { name: displayVoiceStem(entry.key) }));
        setSelectedKey(entry.key);
        return;
      }
      markChanged([...loadState.entries, entry]);
      setSelectedKey(entry.key);
      toast.success(t("rawPath.added", { name: displayVoiceStem(entry.key) }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [loadState, markChanged, voiceStem]);

  const handleDelete = useCallback(() => {
    if (loadState.status !== "ready" || !selected || !loadState.writable) return;
    const next = loadState.entries.filter((entry) => entry.key !== selected.key);
    markChanged(next);
    setSelectedKey(next[0]?.key ?? null);
  }, [loadState, markChanged, selected]);

  const handleSave = useCallback(async () => {
    if (loadState.status !== "ready") return;
    if (!loadState.writable) {
      toast.error(t("common.legacyReadOnlyShort"));
      return;
    }
    try {
      const written = await buildRawPathIdPack(
        { entries: loadState.entries },
        loadState.jsonPath,
        loadState.vgsht1Path,
      );
      setLoadState({ ...loadState, entries: written.entries, issues: [] });
      setHasChanges(false);
      onUnsavedChanges?.(false);
      onPackMutated?.(workspacePackIdentityFromResolved(loadState.pack, "configured"));
      toast.success(t("sound.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [loadState, onPackMutated, onUnsavedChanges]);

  const handleInitPack = useCallback(async () => {
    const sourceFhm2dPath = buildRawPathIdSourceFhm2dPath(obDplCachePath ?? "");
    if (!sourceFhm2dPath) {
      toast.error(t("common.setObDplcacheInit"));
      return;
    }
    setIsInitializing(true);
    try {
      await initRawPathIdPack({
        sourceFhm2dPath,
        workspaceRoot: folderPath,
        workspaceDocument,
      });
      lastLoadedKeyRef.current = "";
      toast.success(t("rawPath.unpacked"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsInitializing(false);
    }
  }, [folderPath, load, obDplCachePath, workspaceDocument]);

  const openParentFolder = useCallback(async (filePath: string) => {
    await openPath(await dirname(filePath));
  }, []);

  const workbenchStatus =
    loadState.status === "ready"
      ? "ready"
      : loadState.status === "error" && soundTableMissingMessage(loadState.message)
        ? "missing"
        : loadState.status === "error"
          ? "error"
          : "loading";

  const pathPreview = previewAudioPath(voiceStem);

  return (
    <SoundTableWorkbench
      isActive={isActive}
      title={t("rawPath.title")}
      purpose={t("rawPath.purpose")}
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
                onOpen: () => void openParentFolder(loadState.pack.structureJsonPath),
              },
              {
                label: t("common.json"),
                value: loadState.jsonPath,
                onOpen: () => void openParentFolder(loadState.jsonPath),
              },
              {
                label: t("rawPath.index"),
                value: loadState.vgsht1Path,
                onOpen: () => void openParentFolder(loadState.vgsht1Path),
              },
              {
                label: t("common.pack"),
                value: `${RAW_PATH_ID_PACK_HASH}.fhm2d`,
              },
            ]
          : undefined
      }
      loadedLabel={
        loadState.status === "ready" ? t("sound.loadedStreams", { count: loadState.entries.length }) : undefined
      }
      notice={
        loadState.status === "ready" ? (
          <LegacyWorkspaceMoveNotice
            workspaceRoot={folderPath}
            workspaceDocument={workspaceDocument}
            contentId="raw-path-id"
            sourceLayout={loadState.sourceLayout}
            configuredPath={loadState.pack.folderPath}
            onMoved={() => void load()}
            className="mt-2"
          />
        ) : null
      }
      addPanel={
        loadState.status === "ready" ? (
          <div className="rounded-lg bg-muted/40 p-3">
            <div className="text-sm font-medium">{t("rawPath.addVoice")}</div>
            <div className="mt-2 flex gap-2">
              <Input
                value={voiceStem}
                onChange={(event) => setVoiceStem(event.target.value)}
                placeholder={t("rawPath.stemPlaceholder")}
                className="h-8 text-xs"
                disabled={!loadState.writable}
              />
              <Button
                size="sm"
                onClick={() => void handleAddVoice()}
                disabled={!loadState.writable}
                className="h-8"
              >
                <Plus className="h-4 w-4" />
                {t("common.add")}
              </Button>
            </div>
            {pathPreview ? (
              <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">{pathPreview}</p>
            ) : null}
          </div>
        ) : null
      }
      listPanel={
        loadState.status === "ready" ? (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("common.search")}
                className="h-8 text-xs"
              />
              {(["voice", "all"] as const).map((group) => (
                <Button
                  key={group}
                  size="sm"
                  variant={groupFilter === group ? "secondary" : "ghost"}
                  onClick={() => setGroupFilter(group)}
                  className="h-8 capitalize"
                >
                  {group === "voice" ? t("rawPath.voice") : t("rawPath.all")}
                </Button>
              ))}
            </div>
            <ScrollArea className="min-h-0 flex-1 rounded-md bg-muted/20">
              <div className="py-1">
                {visibleEntries.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setSelectedKey(entry.key)}
                    className={`block w-full px-3 py-2 text-left text-xs transition-colors ${
                      entry.key === selectedKey ? "bg-accent" : "hover:bg-muted/60"
                    }`}
                  >
                    <div className="truncate font-medium">{displayVoiceStem(entry.key)}</div>
                    <div className="truncate text-muted-foreground">{fileNameOf(entry.source)}</div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : null
      }
      detailPanel={
        loadState.status === "ready" && selected ? (
          <div className="space-y-4 rounded-lg bg-muted/20 p-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("rawPath.voice")}</Label>
              <Input
                value={displayVoiceStem(selected.key)}
                onChange={(event) =>
                  void updateSelected({
                    key: `STREAMPATH_ST_${event.target.value.replace(/^STREAMPATH_ST_/i, "")}`,
                  })
                }
                className="h-8 font-mono text-xs"
                disabled={!loadState.writable}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("rawPath.audioFile")}</Label>
              <Input
                value={selected.source}
                onChange={(event) => void updateSelected({ source: event.target.value })}
                className="h-8 font-mono text-xs"
                disabled={!loadState.writable}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("rawPath.kind")}</Label>
                <select
                  value={selected.kind}
                  onChange={(event) => void updateSelected({ kind: event.target.value as RawPathIdKind })}
                  disabled={!loadState.writable}
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                >
                  {RAW_PATH_ID_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("rawPath.hash")}</Label>
                <Input
                  value={`0x${selected.hash.toString(16).toUpperCase().padStart(8, "0")}`}
                  readOnly
                  className="h-8 font-mono text-xs tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("rawPath.hashedPath")}</Label>
              <Input value={selected.path} readOnly className="h-8 font-mono text-xs" />
            </div>
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
