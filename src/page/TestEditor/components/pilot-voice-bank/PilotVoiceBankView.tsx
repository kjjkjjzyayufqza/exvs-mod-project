import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dirname, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { exists, readDir } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { useConfigStore } from "@/store/configStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  resolveWorkspaceContent,
  type ResolvedWorkspaceContentPack,
} from "@/services/testEditorWorkspace/contentCatalog";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import { inferFhm2dStructurePathFromFolder } from "@/utils/fhm2dFolderPathResolution";
import { LegacyWorkspaceMoveNotice } from "../workspace-layout/LegacyWorkspaceMoveNotice";
import { SoundTableWorkbench } from "../sound-table/SoundTableWorkbench";
import { VoiceChainRail } from "../sound-table/SoundChainRail";
import { planVoiceBankWorkspace, voiceChainTabForStep, type SoundFocus } from "../sound-table/soundChainModel";
import { invalidateSoundChainCache, openSoundChainPath } from "../sound-table/soundChainResolve";
import { useVoiceChain } from "../sound-table/useSoundChain";
import {
  parsePilotVoiceResourcePack,
  type PilotVoiceResourceRecord,
} from "../pilot-voice-resource/pilotVoiceResourceDocument";
import { derivePilotVoiceSource } from "../raw-path-id/rawPathIdDocument";
import {
  applyPilotVoiceBankSamples,
  applySyncReport,
  dirtyCueNames,
  parsePilotVoiceBank,
  secondsFromSamples,
  syncPilotVoiceBankFromAudio,
  type PilotVoiceCue,
  type SyncReport,
} from "./pilotVoiceBankDocument";
import {
  PILOT_VOICE_BANK_PREFIX,
  PILOT_VOICE_BANK_ROUTE_ID,
  formatBankPackage,
  initPilotVoiceBank,
  pilotVoiceAudioFolder,
  planPilotVoiceBankInit,
} from "./initPilotVoiceBank";

type PilotVoiceBankViewProps = {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onRequestFhm2dRepack?: (pack: WorkspacePackIdentity) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
  soundFocus?: SoundFocus | null;
  onConsumeSoundFocus?: () => void;
  onOpenSoundFocus?: (focus: SoundFocus) => void;
};

type VoiceTableState = {
  records: PilotVoiceResourceRecord[];
  sourceLayout: "configured" | "legacy" | "missing";
  configured: ResolvedWorkspaceContentPack;
  packFolderPath: string | null;
};

function IntegerField({
  value,
  disabled,
  dirty,
  min,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  dirty: boolean;
  min: number | null;
  onCommit: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <Input
      value={text}
      disabled={disabled}
      inputMode="numeric"
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        const trimmed = text.trim();
        if (!trimmed || !/^-?\d+$/.test(trimmed)) {
          setText(String(value));
          return;
        }
        const parsed = Number(trimmed);
        if (!Number.isSafeInteger(parsed) || (min !== null && parsed < min)) {
          setText(String(value));
          return;
        }
        onCommit(parsed);
      }}
      className={cn("h-8 font-mono text-xs tabular-nums", dirty && "border-amber-500")}
    />
  );
}

function ClockField({
  label,
  value,
  disabled,
  dirty,
  min,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  dirty: boolean;
  min: number | null;
  onCommit: (next: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <IntegerField value={value} disabled={disabled} dirty={dirty} min={min} onCommit={onCommit} />
    </div>
  );
}

function CueClockForm({
  cue,
  loaded,
  onPatch,
}: {
  cue: PilotVoiceCue;
  loaded: PilotVoiceCue | null;
  onPatch: (patch: Partial<PilotVoiceCue>) => void;
}) {
  const { t } = useTranslation("test-lists");
  const differs = (key: "nSamples" | "loopStart" | "loopEnd" | "loopFlag") =>
    loaded !== null && loaded[key] !== cue[key];
  return (
    <div className="max-h-[46%] shrink-0 space-y-3 overflow-auto rounded-lg bg-muted/20 p-4">
      <div className="truncate font-mono text-xs">{cue.name}</div>
      {cue.hasClock ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{t("pilotVoiceBank.seconds")}</Label>
            <div className="flex h-8 items-center text-sm tabular-nums">{secondsFromSamples(cue.nSamples)}</div>
          </div>
          <ClockField
            label={t("pilotVoiceBank.samples")}
            value={cue.nSamples}
            dirty={differs("nSamples")}
            disabled={false}
            min={1}
            onCommit={(nSamples) => onPatch({ nSamples, seconds: nSamples / 48000 })}
          />
          <ClockField
            label={t("pilotVoiceBank.loopStart")}
            value={cue.loopStart}
            dirty={differs("loopStart")}
            disabled={false}
            min={null}
            onCommit={(loopStart) => onPatch({ loopStart })}
          />
          <ClockField
            label={t("pilotVoiceBank.loopEnd")}
            value={cue.loopEnd}
            dirty={differs("loopEnd")}
            disabled={false}
            min={null}
            onCommit={(loopEnd) => onPatch({ loopEnd })}
          />
          <ClockField
            label={t("pilotVoiceBank.loopFlag")}
            value={cue.loopFlag}
            dirty={differs("loopFlag")}
            disabled={false}
            min={null}
            onCommit={(loopFlag) => onPatch({ loopFlag })}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("pilotVoiceBank.noClock")}</p>
      )}
    </div>
  );
}

async function findNus3bank(folderPath: string): Promise<string | null> {
  if (!(await exists(folderPath))) return null;
  const entries = await readDir(folderPath);
  const match = entries.find((entry) => entry.name?.toLowerCase().endsWith(".nus3bank"));
  if (!match?.name) return null;
  return join(folderPath, match.name);
}

export default function PilotVoiceBankView({
  folderPath,
  isActive,
  onUnsavedChanges,
  onRequestFhm2dRepack,
  workspaceDocument,
  soundFocus = null,
  onConsumeSoundFocus,
  onOpenSoundFocus,
}: PilotVoiceBankViewProps) {
  const { t } = useTranslation("test-lists");
  const obDplCachePath = useConfigStore((state) => state.obDplCachePath);
  const [voiceTable, setVoiceTable] = useState<VoiceTableState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedStem, setSelectedStem] = useState<string | null>(null);
  const [bankFilePath, setBankFilePath] = useState<string | null>(null);
  const [audioRelative, setAudioRelative] = useState("");
  const [cues, setCues] = useState<PilotVoiceCue[]>([]);
  const [loadedCues, setLoadedCues] = useState<PilotVoiceCue[]>([]);
  const [stemQuery, setStemQuery] = useState("");
  const [cueQuery, setCueQuery] = useState("");
  const [selectedCueName, setSelectedCueName] = useState<string | null>(null);
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null);
  const [chainRefresh, setChainRefresh] = useState(0);
  const [isInitializing, setIsInitializing] = useState(false);
  const lastLoadedKeyRef = useRef("");
  const consumedFocus = useRef<SoundFocus | null>(null);

  const prefix = workspaceDocument.assetRoutes[PILOT_VOICE_BANK_ROUTE_ID]?.prefix ?? PILOT_VOICE_BANK_PREFIX;
  const selected = voiceTable?.records.find((record) => record.voiceStem === selectedStem) ?? null;
  const dirty = useMemo(() => new Set(dirtyCueNames(cues, loadedCues)), [cues, loadedCues]);
  const selectedCue = cues.find((cue) => cue.name === selectedCueName) ?? null;
  const audioFolder = pilotVoiceAudioFolder(obDplCachePath ?? "", audioRelative);
  const soundPackFolderPath = voiceTable?.packFolderPath ?? null;

  const loadVoiceTable = useCallback(async () => {
    if (!folderPath) {
      setStatus("error");
      setErrorMessage(t("common.folderPathEmpty"));
      return;
    }
    setStatus("loading");
    invalidateSoundChainCache();
    setChainRefresh((value) => value + 1);
    try {
      const content = await resolveWorkspaceContent(folderPath, workspaceDocument, "pilot-voice-resource");
      if (content.sourceLayout === "missing" || !content.existing) {
        setVoiceTable({
          records: [],
          sourceLayout: content.sourceLayout,
          configured: content.configured,
          packFolderPath: null,
        });
        setStatus("ready");
        return;
      }
      const parsed = await parsePilotVoiceResourcePack(content.existing.folderPath);
      const records = [...parsed.table.records].sort((left, right) =>
        (left.voiceStem ?? "").localeCompare(right.voiceStem ?? ""),
      );
      setVoiceTable({
        records,
        sourceLayout: content.sourceLayout,
        configured: content.configured,
        packFolderPath: content.existing.folderPath,
      });
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, [folderPath, t, workspaceDocument]);

  useEffect(() => {
    if (!isActive) return;
    const key = `${folderPath}::pilot-voice-bank::${prefix}`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void loadVoiceTable();
  }, [folderPath, isActive, loadVoiceTable, prefix]);

  const loadStemBank = useCallback(
    async (record: PilotVoiceResourceRecord) => {
      const stem = record.voiceStem?.trim() ?? "";
      setSelectedStem(stem);
      setCues([]);
      setLoadedCues([]);
      setBankFilePath(null);
      setAudioRelative("");
      setSelectedCueName(null);
      setCueQuery("");
      if (!stem) return;
      try {
        const derived = await derivePilotVoiceSource(stem);
        setAudioRelative(derived.source);
      } catch {
        setAudioRelative("");
      }
      if ((record.bankPackage >>> 0) === 0) return;
      try {
        const packed = planVoiceBankWorkspace(folderPath, record.bankPackage);
        let bankPath = await findNus3bank(packed.folderPath);
        if (!bankPath) {
          const plan = planPilotVoiceBankInit({
            dplCacheDir: obDplCachePath || "dplcache",
            workspaceRoot: folderPath,
            stem,
            bankPackage: record.bankPackage,
            prefix,
          });
          bankPath = await findNus3bank(plan.workspaceFolder);
        }
        if (!bankPath) return;
        const document = await parsePilotVoiceBank(bankPath);
        setBankFilePath(bankPath);
        setCues(document.cues);
        setLoadedCues(document.cues);
        setSelectedCueName(document.cues[0]?.name ?? null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [folderPath, obDplCachePath, prefix],
  );

  useEffect(() => {
    onUnsavedChanges?.(dirty.size > 0);
  }, [dirty, onUnsavedChanges]);

  const patchCue = useCallback((name: string, patch: Partial<PilotVoiceCue>) => {
    setCues((current) => current.map((row) => (row.name === name ? { ...row, ...patch } : row)));
  }, []);

  const handleInit = useCallback(async () => {
    if (!selected?.voiceStem) return;
    const dplCacheDir = obDplCachePath?.trim() ?? "";
    if (!dplCacheDir) {
      toast.error(t("common.setObDplcacheInit"));
      return;
    }
    setIsInitializing(true);
    try {
      await initPilotVoiceBank({
        dplCacheDir,
        workspaceRoot: folderPath,
        stem: selected.voiceStem,
        bankPackage: selected.bankPackage,
        prefix,
      });
      await loadStemBank(selected);
      toast.success(t("pilotVoiceBank.initialized"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsInitializing(false);
    }
  }, [folderPath, loadStemBank, obDplCachePath, prefix, selected, t]);

  const handleGenerate = useCallback(async () => {
    if (!bankFilePath || !selected) return;
    const defaultPath = pilotVoiceAudioFolder(obDplCachePath ?? "", audioRelative);
    const picked = await open({
      title: t("pilotVoiceBank.generate"),
      multiple: false,
      filters: [{ name: "nus3audio", extensions: ["nus3audio"] }],
      defaultPath: defaultPath || undefined,
    });
    if (!picked || Array.isArray(picked)) return;
    try {
      const outcome = await syncPilotVoiceBankFromAudio(bankFilePath, picked);
      setCues((current) => applySyncReport(current, outcome.report));
      setSyncReport(outcome.report);
      const report = outcome.report;
      toast.success(
        t("pilotVoiceBank.generateDone", {
          updated: report.updated.length,
          unchanged: report.unchanged.length,
          bankOnly: report.bankOnly.length,
          audioOnly: report.audioOnly.length,
          skipped: report.skipped.length,
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [audioRelative, bankFilePath, obDplCachePath, selected, t]);

  const handleSave = useCallback(async () => {
    if (!bankFilePath) return;
    const edits = cues
      .filter((cue) => dirty.has(cue.name))
      .map((cue) => ({
        name: cue.name,
        nSamples: cue.nSamples,
        loopStart: cue.loopStart,
        loopEnd: cue.loopEnd,
        loopFlag: cue.loopFlag,
      }));
    try {
      const written = await applyPilotVoiceBankSamples(bankFilePath, edits);
      setCues(written.cues);
      setLoadedCues(written.cues);
      invalidateSoundChainCache();
      setChainRefresh((value) => value + 1);
      toast.success(t("pilotVoiceBank.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [bankFilePath, cues, dirty, t]);

  const handleRepack = useCallback(() => {
    if (!selected?.voiceStem || !folderPath || (selected.bankPackage >>> 0) === 0) return;
    const packed = planVoiceBankWorkspace(folderPath, selected.bankPackage);
    void (async () => {
      const loose = await findNus3bank(packed.folderPath);
      if (loose && (await exists(packed.structurePath))) {
        onRequestFhm2dRepack?.({
          packKey: `${packed.prefix}/${packed.hashHex}`,
          routeId: packed.routeId,
          prefix: packed.prefix,
          hashFolderName: packed.hashHex,
          folderPath: packed.folderPath,
          structureJsonPath: packed.structurePath,
          sourceLayout: "configured",
        });
        return;
      }
      const plan = planPilotVoiceBankInit({
        dplCacheDir: obDplCachePath || "dplcache",
        workspaceRoot: folderPath,
        stem: selected.voiceStem ?? "",
        bankPackage: selected.bankPackage,
        prefix,
      });
      onRequestFhm2dRepack?.({
        packKey: `${prefix}/voice/pilot/${selected.voiceStem}`,
        routeId: PILOT_VOICE_BANK_ROUTE_ID,
        prefix,
        hashFolderName: selected.voiceStem ?? "",
        folderPath: plan.workspaceFolder,
        structureJsonPath: inferFhm2dStructurePathFromFolder(plan.workspaceFolder),
        sourceLayout: "configured",
      });
    })();
  }, [folderPath, obDplCachePath, onRequestFhm2dRepack, prefix, selected]);

  const visibleStems = useMemo(() => {
    const query = stemQuery.trim().toLowerCase();
    return (voiceTable?.records ?? []).filter((record) => {
      if (!query) return true;
      const stem = (record.voiceStem ?? "").toLowerCase();
      const hash = formatBankPackage(record.bankPackage).toLowerCase();
      return stem.includes(query) || hash.includes(query);
    });
  }, [stemQuery, voiceTable]);

  const visibleCues = useMemo(() => {
    const query = cueQuery.trim().toLowerCase();
    return cues.filter((cue) => (query ? cue.name.toLowerCase().includes(query) : true));
  }, [cueQuery, cues]);

  const { snapshot: voiceChain, loading: voiceChainLoading } = useVoiceChain({
    isActive,
    workspaceRoot: folderPath,
    workspaceDocument,
    stem: selectedStem ?? "",
    refreshKey: chainRefresh,
  });

  useEffect(() => {
    if (!isActive || !soundFocus || soundFocus.tab !== "pilot-voice-bank" || !voiceTable) return;
    if (consumedFocus.current === soundFocus) return;
    consumedFocus.current = soundFocus;
    const stem = soundFocus.voiceStem?.trim().toUpperCase() ?? "";
    const record = voiceTable.records.find((row) => {
      if (stem && (row.voiceStem ?? "").toUpperCase() === stem) return true;
      return soundFocus.voiceKey !== undefined && (row.voiceKey >>> 0) === (soundFocus.voiceKey >>> 0);
    });
    if (record) void loadStemBank(record);
    onConsumeSoundFocus?.();
  }, [isActive, loadStemBank, onConsumeSoundFocus, soundFocus, voiceTable]);

  const openChainFile = useCallback((path: string) => {
    void openSoundChainPath(path).then((result) => {
      if (result === "missing") toast.error(t("common.pathMissing"));
    });
  }, [t]);

  const headerMetaLines = useMemo(() => {
    const lines: { label: string; value: string; onOpen?: () => void }[] = [];
    if (soundPackFolderPath) {
      lines.push({
        label: t("pilotVoiceBank.soundPackFolder"),
        value: soundPackFolderPath,
        onOpen: () => {
          void openPath(soundPackFolderPath);
        },
      });
    }
    if (!selected) return lines;
    lines.push(
      {
        label: t("pilotVoiceBank.bankPath"),
        value: bankFilePath ?? t("pilotVoiceBank.notInitialized"),
        onOpen: bankFilePath
          ? () => {
              void dirname(bankFilePath).then((target) => openPath(target));
            }
          : undefined,
      },
      {
        label: t("pilotVoiceBank.audioPath"),
        value: audioRelative,
        onOpen: audioFolder
          ? () => {
              void exists(audioFolder).then((found) => {
                if (found) void openPath(audioFolder);
                else toast.error(t("common.pathMissing"));
              });
            }
          : undefined,
      },
    );
    return lines;
  }, [audioFolder, audioRelative, bankFilePath, selected, soundPackFolderPath, t]);

  return (
    <SoundTableWorkbench
      isActive={isActive}
      title={t("pilotVoiceBank.title")}
      status={status === "loading" ? "loading" : status === "error" ? "error" : "ready"}
      errorMessage={errorMessage}
      onReload={() => {
        lastLoadedKeyRef.current = "";
        void loadVoiceTable();
      }}
      onSave={() => void handleSave()}
      canSave={dirty.size > 0 && Boolean(bankFilePath)}
      writable={Boolean(bankFilePath)}
      loadedLabel={
        voiceTable ? t("sound.loadedVoices", { count: voiceTable.records.length }) : undefined
      }
      notice={
        voiceTable && voiceTable.sourceLayout !== "missing" ? (
          <LegacyWorkspaceMoveNotice
            workspaceRoot={folderPath}
            workspaceDocument={workspaceDocument}
            contentId="pilot-voice-resource"
            sourceLayout={voiceTable.sourceLayout}
            configuredPath={voiceTable.configured.folderPath}
            onMoved={() => {
              lastLoadedKeyRef.current = "";
              void loadVoiceTable();
            }}
            className="mt-2"
          />
        ) : null
      }
      metaLines={headerMetaLines}
      toolbarExtra={
        <Button size="sm" variant="outline" onClick={handleRepack} disabled={!selected || !bankFilePath}>
          {t("common.repack")}
        </Button>
      }
      listPanel={
        <div className="flex h-full min-h-0 flex-col gap-2">
          <Input
            value={stemQuery}
            onChange={(event) => setStemQuery(event.target.value)}
            placeholder={t("common.search")}
            className="h-8 text-xs"
          />
          <ScrollArea className="min-h-0 flex-1 rounded-md bg-muted/20">
            <div className="py-1">
              {voiceTable?.sourceLayout === "missing" ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t("pilotVoiceBank.needVoiceTable")}</p>
              ) : null}
              {visibleStems.length === 0 && voiceTable?.sourceLayout !== "missing" ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t("pilotVoiceBank.noMatch")}</p>
              ) : null}
              {visibleStems.map((record) => {
                const stem = record.voiceStem ?? "";
                const active = stem === selectedStem;
                return (
                  <button
                    key={`${stem}-${record.bankPackage}`}
                    type="button"
                    onClick={() => void loadStemBank(record)}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-xs transition-colors",
                      active ? "bg-accent" : "hover:bg-muted/60",
                    )}
                  >
                    <div className="truncate font-medium">{stem || t("common.empty")}</div>
                    <div className="truncate font-mono text-[10px] tabular-nums text-muted-foreground">
                      {formatBankPackage(record.bankPackage)}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      }
      detailPanel={
        <div className="flex h-full min-h-0 flex-col gap-3">
          <VoiceChainRail
            current="voiceBank"
            snapshot={voiceChain}
            loading={voiceChainLoading}
            draftLabel={selectedStem ?? undefined}
            onOpenStep={(step) => {
              if (!selectedStem || !onOpenSoundFocus) return;
              onOpenSoundFocus({
                tab: voiceChainTabForStep(step),
                voiceStem: selectedStem,
                filePath: step === "vot" && voiceChain?.votPackExists ? voiceChain.votPackPath : undefined,
              });
            }}
            onOpenFile={openChainFile}
          />
          {syncReport && (syncReport.bankOnly.length > 0 || syncReport.audioOnly.length > 0 || syncReport.skipped.length > 0) ? (
            <div className="space-y-2 rounded-lg bg-muted/20 p-3 text-xs">
              <p className="text-muted-foreground text-pretty">{t("pilotVoiceBank.mismatchNote")}</p>
              {syncReport.bankOnly.length > 0 ? (
                <div>
                  <div className="font-medium">{t("pilotVoiceBank.bankOnly")}</div>
                  <div className="font-mono tabular-nums">{syncReport.bankOnly.join(", ")}</div>
                </div>
              ) : null}
              {syncReport.audioOnly.length > 0 ? (
                <div>
                  <div className="font-medium">{t("pilotVoiceBank.audioOnly")}</div>
                  <div className="font-mono tabular-nums">{syncReport.audioOnly.join(", ")}</div>
                </div>
              ) : null}
              {syncReport.skipped.length > 0 ? (
                <div>
                  <div className="font-medium">{t("pilotVoiceBank.skipped")}</div>
                  <div className="font-mono tabular-nums">{syncReport.skipped.map((row) => row.name).join(", ")}</div>
                </div>
              ) : null}
            </div>
          ) : null}
          {selected ? (
          bankFilePath ? (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="flex items-center gap-2">
                <Input
                  value={cueQuery}
                  onChange={(event) => setCueQuery(event.target.value)}
                  placeholder={t("common.search")}
                  className="h-8 text-xs"
                />
                <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => void handleGenerate()}>
                  {t("pilotVoiceBank.generate")}
                </Button>
              </div>
              <ScrollArea className="min-h-0 flex-1 rounded-md bg-muted/20">
                <div className="py-1">
                  {visibleCues.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-muted-foreground">{t("pilotVoiceBank.noMatch")}</p>
                  ) : null}
                  {visibleCues.map((cue) => {
                    const active = cue.name === selectedCueName;
                    return (
                      <button
                        key={cue.name}
                        type="button"
                        onClick={() => setSelectedCueName(cue.name)}
                        className={cn(
                          "block w-full px-3 py-2 text-left text-xs transition-colors",
                          active ? "bg-accent" : "hover:bg-muted/60",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{cue.name}</span>
                          <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                            {cue.hasClock ? secondsFromSamples(cue.nSamples) : t("pilotVoiceBank.noClock")}
                          </span>
                        </div>
                        {dirty.has(cue.name) ? (
                          <div className="text-[10px] font-medium text-amber-600">{t("common.warning")}</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
              {selectedCue ? (
                <CueClockForm
                  cue={selectedCue}
                  loaded={loadedCues.find((cue) => cue.name === selectedCue.name) ?? null}
                  onPatch={(patch) => patchCue(selectedCue.name, patch)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t("pilotVoiceBank.selectCue")}</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("pilotVoiceBank.notInitialized")}</p>
              <Button
                size="sm"
                onClick={() => void handleInit()}
                disabled={isInitializing || selected.bankPackage === 0}
              >
                {isInitializing ? t("sound.unpacking") : t("common.initPack")}
              </Button>
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">{t("pilotVoiceBank.pickStem")}</p>
        )}
        </div>
      }
    />
  );
}
