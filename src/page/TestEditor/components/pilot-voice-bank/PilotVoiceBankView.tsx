import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { exists, readDir } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import { useConfigStore } from "@/store/configStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";
import {
  resolveWorkspaceContent,
  type ResolvedWorkspaceContentPack,
} from "@/services/testEditorWorkspace/contentCatalog";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import { inferFhm2dStructurePathFromFolder } from "@/utils/fhm2dFolderPathResolution";
import { LegacyWorkspaceMoveNotice } from "../workspace-layout/LegacyWorkspaceMoveNotice";
import { SoundTableWorkbench } from "../sound-table/SoundTableWorkbench";
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
};

type VoiceTableState = {
  records: PilotVoiceResourceRecord[];
  sourceLayout: "configured" | "legacy" | "missing";
  configured: ResolvedWorkspaceContentPack;
};

function summarizeNames(names: string[]): string {
  if (names.length === 0) return "-";
  if (names.length <= 6) return names.join(", ");
  return `${names.slice(0, 6).join(", ")} (+${names.length - 6})`;
}

function SamplesField({
  value,
  disabled,
  dirty,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  dirty: boolean;
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
        if (!trimmed) {
          setText(String(value));
          return;
        }
        if (!/^-?\d+$/.test(trimmed)) {
          setText(String(value));
          return;
        }
        const parsed = Number(trimmed);
        if (!Number.isSafeInteger(parsed)) {
          setText(String(value));
          return;
        }
        onCommit(parsed);
      }}
      className={`h-8 font-mono text-xs ${dirty ? "border-amber-500" : ""}`}
    />
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
  const [report, setReport] = useState<SyncReport | null>(null);
  const [cueQuery, setCueQuery] = useState("");
  const [isInitializing, setIsInitializing] = useState(false);
  const lastLoadedKeyRef = useRef("");

  const prefix = workspaceDocument.assetRoutes[PILOT_VOICE_BANK_ROUTE_ID]?.prefix ?? PILOT_VOICE_BANK_PREFIX;
  const selected = voiceTable?.records.find((record) => record.voiceStem === selectedStem) ?? null;
  const dirty = useMemo(() => new Set(dirtyCueNames(cues, loadedCues)), [cues, loadedCues]);

  const loadVoiceTable = useCallback(async () => {
    if (!folderPath) {
      setStatus("error");
      setErrorMessage(t("common.folderPathEmpty"));
      return;
    }
    setStatus("loading");
    try {
      const content = await resolveWorkspaceContent(folderPath, workspaceDocument, "pilot-voice-resource");
      if (content.sourceLayout === "missing" || !content.existing) {
        setVoiceTable({
          records: [],
          sourceLayout: content.sourceLayout,
          configured: content.configured,
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
      setReport(null);
      setCues([]);
      setLoadedCues([]);
      setBankFilePath(null);
      setAudioRelative("");
      if (!stem) return;
      try {
        const derived = await derivePilotVoiceSource(stem);
        setAudioRelative(derived.source);
      } catch {
        setAudioRelative("");
      }
      if ((record.bankPackage >>> 0) === 0) return;
      try {
        const plan = planPilotVoiceBankInit({
          dplCacheDir: obDplCachePath || "dplcache",
          workspaceRoot: folderPath,
          stem,
          bankPackage: record.bankPackage,
          prefix,
        });
        const bankPath = await findNus3bank(plan.workspaceFolder);
        if (!bankPath) return;
        const document = await parsePilotVoiceBank(bankPath);
        setBankFilePath(bankPath);
        setCues(document.cues);
        setLoadedCues(document.cues);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [folderPath, obDplCachePath, prefix],
  );

  useEffect(() => {
    onUnsavedChanges?.(dirty.size > 0);
  }, [dirty, onUnsavedChanges]);

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
      setReport(outcome.report);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [audioRelative, bankFilePath, obDplCachePath, selected, t]);

  const handleSave = useCallback(async () => {
    if (!bankFilePath) return;
    const edits = cues
      .filter((cue) => dirty.has(cue.name))
      .map((cue) => ({ name: cue.name, nSamples: cue.nSamples }));
    try {
      const written = await applyPilotVoiceBankSamples(bankFilePath, edits);
      setCues(written.cues);
      setLoadedCues(written.cues);
      toast.success(t("pilotVoiceBank.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [bankFilePath, cues, dirty, t]);

  const handleRepack = useCallback(() => {
    if (!selected?.voiceStem || !folderPath || (selected.bankPackage >>> 0) === 0) return;
    const plan = planPilotVoiceBankInit({
      dplCacheDir: obDplCachePath || "dplcache",
      workspaceRoot: folderPath,
      stem: selected.voiceStem,
      bankPackage: selected.bankPackage,
      prefix,
    });
    onRequestFhm2dRepack?.({
      packKey: `${prefix}/voice/pilot/${selected.voiceStem}`,
      routeId: PILOT_VOICE_BANK_ROUTE_ID,
      prefix,
      hashFolderName: selected.voiceStem,
      folderPath: plan.workspaceFolder,
      structureJsonPath: inferFhm2dStructurePathFromFolder(plan.workspaceFolder),
      sourceLayout: "configured",
    });
  }, [folderPath, obDplCachePath, onRequestFhm2dRepack, prefix, selected]);

  const visibleCues = useMemo(() => {
    const query = cueQuery.trim().toLowerCase();
    return cues.filter((cue) => (query ? cue.name.toLowerCase().includes(query) : true));
  }, [cueQuery, cues]);

  const guide = (
    <div className="mt-2 max-w-3xl space-y-1 text-xs leading-5 text-muted-foreground">
      <p>{t("pilotVoiceBank.step1")}</p>
      <p>{t("pilotVoiceBank.step2")}</p>
      <p>
        {t("pilotVoiceBank.step3", {
          hash: selected ? formatBankPackage(selected.bankPackage) : "0x00000000",
        })}
      </p>
      <p>{t("pilotVoiceBank.crash")}</p>
      {voiceTable?.sourceLayout === "missing" ? <p>{t("pilotVoiceBank.needVoiceTable")}</p> : null}
    </div>
  );

  const reportBlock = report ? (
    <div className="mt-2 space-y-1 text-xs">
      <p>
        {t("pilotVoiceBank.updated")} ({report.updated.length}): {summarizeNames(report.updated.map((row) => `${row.name} ${row.oldNSamples} -> ${row.newNSamples}${row.note ? ` (${row.note})` : ""}`))}
      </p>
      <p>
        {t("pilotVoiceBank.unchanged")} ({report.unchanged.length}): {summarizeNames(report.unchanged)}
      </p>
      <p>
        {t("pilotVoiceBank.bankOnly")} ({report.bankOnly.length}): {summarizeNames(report.bankOnly)}
      </p>
      <p>
        {t("pilotVoiceBank.audioOnly")} ({report.audioOnly.length}): {summarizeNames(report.audioOnly)}
      </p>
      <p>
        {t("pilotVoiceBank.skipped")} ({report.skipped.length}): {summarizeNames(report.skipped.map((row) => `${row.name} (${row.reason})`))}
      </p>
    </div>
  ) : null;

  return (
    <SoundTableWorkbench
      isActive={isActive}
      title={t("pilotVoiceBank.title")}
      purpose={t("pilotVoiceBank.purpose")}
      status={status === "loading" ? "loading" : status === "error" ? "error" : "ready"}
      errorMessage={errorMessage}
      onReload={() => {
        lastLoadedKeyRef.current = "";
        void loadVoiceTable();
      }}
      onSave={() => void handleSave()}
      canSave={dirty.size > 0 && Boolean(bankFilePath)}
      writable={Boolean(bankFilePath)}
      notice={
        <>
          {guide}
          {reportBlock}
          {voiceTable && voiceTable.sourceLayout !== "missing" ? (
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
            />
          ) : null}
        </>
      }
      metaLines={
        selected
          ? [
              { label: t("pilotVoiceBank.bankPath"), value: bankFilePath ?? t("pilotVoiceBank.notInitialized") },
              { label: t("pilotVoiceBank.audioPath"), value: audioRelative },
            ]
          : []
      }
      toolbarExtra={
        <Button size="sm" variant="outline" onClick={handleRepack} disabled={!selected || !bankFilePath}>
          {t("common.repack")}
        </Button>
      }
      listPanel={
        <div className="flex h-full min-h-0 flex-col gap-2">
          <div className="min-h-0 flex-1 overflow-auto">
            {(voiceTable?.records ?? []).map((record) => {
              const stem = record.voiceStem ?? "";
              const active = stem === selectedStem;
              return (
                <button
                  key={`${stem}-${record.bankPackage}`}
                  type="button"
                  onClick={() => void loadStemBank(record)}
                  className={`block w-full truncate px-2 py-1 text-left font-mono text-xs ${active ? "bg-accent" : "hover:bg-accent/50"}`}
                >
                  {stem || t("common.empty")} {formatBankPackage(record.bankPackage)}
                </button>
              );
            })}
          </div>
        </div>
      }
      detailPanel={
        selected ? (
          bankFilePath ? (
            <div className="flex h-full min-h-0 flex-col gap-2">
              <div className="flex items-center gap-2">
                <Input
                  value={cueQuery}
                  onChange={(event) => setCueQuery(event.target.value)}
                  placeholder={t("pilotVoiceBank.filterCues")}
                  className="h-8 max-w-xs text-xs"
                />
                <Button size="sm" variant="outline" onClick={() => void handleGenerate()}>
                  {t("pilotVoiceBank.generate")}
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1">{t("pilotVoiceBank.cue")}</th>
                      <th className="px-2 py-1">{t("pilotVoiceBank.seconds")}</th>
                      <th className="px-2 py-1">{t("pilotVoiceBank.samples")}</th>
                      <th className="px-2 py-1">{t("pilotVoiceBank.loopStart")}</th>
                      <th className="px-2 py-1">{t("pilotVoiceBank.loopEnd")}</th>
                      <th className="px-2 py-1">{t("pilotVoiceBank.loopFlag")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCues.map((cue) => (
                      <tr key={cue.name} className={dirty.has(cue.name) ? "bg-amber-500/10" : undefined}>
                        <td className="px-2 py-1 font-mono">{cue.name}</td>
                        <td className="px-2 py-1 tabular-nums">
                          {cue.hasClock ? secondsFromSamples(cue.nSamples) : "-"}
                        </td>
                        <td className="px-2 py-1">
                          {cue.hasClock ? (
                            <SamplesField
                              value={cue.nSamples}
                              dirty={dirty.has(cue.name)}
                              disabled={false}
                              onCommit={(nSamples) => {
                                setCues((current) =>
                                  current.map((row) => (row.name === cue.name ? { ...row, nSamples } : row)),
                                );
                              }}
                            />
                          ) : (
                            <span>{t("pilotVoiceBank.noClock")}</span>
                          )}
                        </td>
                        <td className="px-2 py-1 tabular-nums">{cue.loopStart}</td>
                        <td className="px-2 py-1 tabular-nums">{cue.loopEnd}</td>
                        <td className="px-2 py-1 tabular-nums">{cue.loopFlag}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("pilotVoiceBank.notInitialized")}</p>
              <Button size="sm" onClick={() => void handleInit()} disabled={isInitializing || selected.bankPackage === 0}>
                {isInitializing ? t("sound.unpacking") : t("common.initPack")}
              </Button>
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">{t("pilotVoiceBank.pickStem")}</p>
        )
      }
    />
  );
}
