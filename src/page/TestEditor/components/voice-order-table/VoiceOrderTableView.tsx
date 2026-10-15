import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dirname } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { useConfigStore } from "@/store/configStore";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatHash } from "@/models/commandTable";
import {
  resolveWorkspaceContent,
  type ResolvedWorkspaceContentPack,
} from "@/services/testEditorWorkspace/contentCatalog";
import type { TestEditorWorkspaceDocument, WorkspacePackIdentity } from "@/services/testEditorWorkspace/types";
import { LegacyWorkspaceMoveNotice } from "../workspace-layout/LegacyWorkspaceMoveNotice";
import { SoundTableWorkbench } from "../sound-table/SoundTableWorkbench";
import { VoiceChainRail } from "../sound-table/SoundChainRail";
import { planVoiceOrderWorkspace, voiceChainTabForStep, type SoundFocus } from "../sound-table/soundChainModel";
import { ensureVoiceOrderExtracted } from "./initVoiceOrderPack";
import { invalidateSoundChainCache, openSoundChainPath } from "../sound-table/soundChainResolve";
import { useVoiceChain } from "../sound-table/useSoundChain";
import {
  parsePilotVoiceResourcePack,
  type PilotVoiceResourceRecord,
} from "../pilot-voice-resource/pilotVoiceResourceDocument";
import {
  appendCue,
  buildVoiceOrderTable,
  cueIdFromCueName,
  parseVoiceOrderTable,
  removeCue,
  replaceCueId,
  type VoiceOrderDocument,
  type VoiceOrderSituation,
} from "./voiceOrderTableDocument";

type VoiceOrderTableViewProps = {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
  soundFocus?: SoundFocus | null;
  onConsumeSoundFocus?: () => void;
  onOpenSoundFocus?: (focus: SoundFocus) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
};

type SlotListState = {
  records: PilotVoiceResourceRecord[];
  sourceLayout: "configured" | "legacy" | "missing";
  configured: ResolvedWorkspaceContentPack;
  packFolderPath: string | null;
};

function cloneDocument(document: VoiceOrderDocument): VoiceOrderDocument {
  return structuredClone(document);
}

export default function VoiceOrderTableView({
  folderPath,
  isActive,
  onUnsavedChanges,
  workspaceDocument,
  soundFocus = null,
  onConsumeSoundFocus,
  onOpenSoundFocus,
  onPackMutated,
}: VoiceOrderTableViewProps) {
  const { t } = useTranslation("test-lists");
  const obDplCachePath = useConfigStore((s) => s.obDplCachePath);
  const [slotList, setSlotList] = useState<SlotListState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stemQuery, setStemQuery] = useState("");
  const [selectedStem, setSelectedStem] = useState<string | null>(null);
  const [document, setDocument] = useState<VoiceOrderDocument | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [cueNames, setCueNames] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [chainRefresh, setChainRefresh] = useState(0);
  const [votError, setVotError] = useState<string | null>(null);
  const lastLoadedKeyRef = useRef("");
  const loadedVotPathRef = useRef("");
  const votLoadGeneration = useRef(0);
  const consumedFocus = useRef<SoundFocus | null>(null);

  const loadSlotList = useCallback(async () => {
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
        setSlotList({
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
      setSlotList({
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
    const key = `${folderPath}::voice-order-table`;
    if (key === lastLoadedKeyRef.current) return;
    lastLoadedKeyRef.current = key;
    void loadSlotList();
  }, [folderPath, isActive, loadSlotList]);

  const { snapshot: voiceChain, loading: voiceChainLoading } = useVoiceChain({
    isActive,
    workspaceRoot: folderPath,
    workspaceDocument,
    stem: selectedStem ?? "",
    refreshKey: chainRefresh,
  });

  const loadPath = useCallback(
    async (path: string, generation: number) => {
      const parsed = await parseVoiceOrderTable(path);
      if (generation !== votLoadGeneration.current) return;
      loadedVotPathRef.current = path;
      setDocument(parsed);
      setSelectedIndex(parsed.table.situations.length ? 0 : null);
      setCueNames({});
      setDirty(false);
      onUnsavedChanges?.(false);
    },
    [onUnsavedChanges],
  );

  useEffect(() => {
    if (!isActive || !selectedStem || !slotList) {
      if (!selectedStem) {
        votLoadGeneration.current += 1;
        loadedVotPathRef.current = "";
        setDocument(null);
        setSelectedIndex(null);
        setDirty(false);
        setVotError(null);
        onUnsavedChanges?.(false);
      }
      return;
    }
    const record = slotList.records.find(
      (row) => (row.voiceStem ?? "").toUpperCase() === selectedStem.toUpperCase(),
    );
    const votPackage = record ? record.votPackage >>> 0 : 0;
    if (votPackage === 0) {
      votLoadGeneration.current += 1;
      loadedVotPathRef.current = "";
      setDocument(null);
      setSelectedIndex(null);
      setDirty(false);
      setVotError(null);
      onUnsavedChanges?.(false);
      return;
    }
    const plan = planVoiceOrderWorkspace(folderPath, votPackage);
    const attemptKey = `${plan.filePath}|${obDplCachePath ?? ""}`;
    if (attemptKey === loadedVotPathRef.current) return;
    const generation = votLoadGeneration.current + 1;
    votLoadGeneration.current = generation;
    loadedVotPathRef.current = attemptKey;
    setVotError(null);
    void ensureVoiceOrderExtracted({
      dplCacheDir: obDplCachePath ?? "",
      workspaceRoot: folderPath,
      votPackage,
    })
      .then(async (extracted) => {
        if (generation !== votLoadGeneration.current) return;
        await loadPath(extracted.filePath, generation);
        if (generation !== votLoadGeneration.current) return;
        setVotError(null);
        invalidateSoundChainCache();
        setChainRefresh((value) => value + 1);
      })
      .catch((error: unknown) => {
        if (generation !== votLoadGeneration.current) return;
        const message = error instanceof Error ? error.message : String(error);
        setDocument(null);
        setSelectedIndex(null);
        setVotError(message);
      });
  }, [
    folderPath,
    isActive,
    loadPath,
    obDplCachePath,
    onUnsavedChanges,
    selectedStem,
    slotList,
  ]);

  useEffect(() => {
    if (!isActive || !soundFocus || soundFocus.tab !== "voice-order-table" || !slotList) return;
    if (consumedFocus.current === soundFocus) return;
    consumedFocus.current = soundFocus;
    const stem = soundFocus.voiceStem?.trim().toUpperCase() ?? "";
    const record = slotList.records.find((row) => {
      if (stem && (row.voiceStem ?? "").toUpperCase() === stem) return true;
      return soundFocus.voiceKey !== undefined && (row.voiceKey >>> 0) === (soundFocus.voiceKey >>> 0);
    });
    const nextStem = (record?.voiceStem ?? stem).trim();
    if (nextStem) setSelectedStem(nextStem);
    onConsumeSoundFocus?.();
  }, [isActive, onConsumeSoundFocus, slotList, soundFocus]);

  const mark = useCallback(
    (next: VoiceOrderDocument) => {
      setDocument(next);
      setDirty(true);
      onUnsavedChanges?.(true);
    },
    [onUnsavedChanges],
  );

  const updateSituation = useCallback(
    (index: number, patch: Partial<VoiceOrderSituation>) => {
      if (!document) return;
      const next = cloneDocument(document);
      next.table.situations[index] = { ...next.table.situations[index], ...patch };
      mark(next);
    },
    [document, mark],
  );

  const handleSave = useCallback(async () => {
    if (!document) return;
    try {
      await buildVoiceOrderTable(document.table, document.savePath);
      const record = slotList?.records.find(
        (row) => (row.voiceStem ?? "").toUpperCase() === (selectedStem ?? "").toUpperCase(),
      );
      if (record && (record.votPackage >>> 0) !== 0) {
        const plan = planVoiceOrderWorkspace(folderPath, record.votPackage);
        if (await exists(plan.structurePath)) {
          onPackMutated?.({
            packKey: `${plan.prefix}/${plan.hashHex}`,
            routeId: plan.routeId,
            prefix: plan.prefix,
            hashFolderName: plan.hashHex,
            folderPath: plan.folderPath,
            structureJsonPath: plan.structurePath,
            sourceLayout: "configured",
          });
        }
      }
      setDirty(false);
      onUnsavedChanges?.(false);
      toast.success(t("voiceOrder.saved"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [document, folderPath, onPackMutated, onUnsavedChanges, selectedStem, slotList, t]);

  const openChainFile = useCallback(
    (path: string) => {
      void openSoundChainPath(path).then((result) => {
        if (result === "missing") toast.error(t("common.pathMissing"));
      });
    },
    [t],
  );

  const visibleRecords = useMemo(() => {
    const query = stemQuery.trim().toLowerCase();
    return (slotList?.records ?? []).filter((record) => {
      if (!query) return true;
      const stem = (record.voiceStem ?? "").toLowerCase();
      return stem.includes(query) || formatHash(record.voiceKey).toLowerCase().includes(query);
    });
  }, [slotList, stemQuery]);

  const selected = document && selectedIndex != null ? document.table.situations[selectedIndex] : null;

  return (
    <SoundTableWorkbench
      isActive={isActive}
      title={t("voiceOrder.title")}
      status={status === "loading" ? "loading" : status === "error" ? "error" : "ready"}
      errorMessage={errorMessage}
      onReload={() => {
        lastLoadedKeyRef.current = "";
        loadedVotPathRef.current = "";
        void loadSlotList();
      }}
      onSave={() => void handleSave()}
      canSave={dirty && Boolean(document)}
      writable={Boolean(document)}
      loadedLabel={
        slotList && slotList.sourceLayout !== "missing"
          ? t("sound.loadedVoices", { count: slotList.records.length })
          : undefined
      }
      notice={
        slotList && slotList.sourceLayout !== "missing" ? (
          <LegacyWorkspaceMoveNotice
            workspaceRoot={folderPath}
            workspaceDocument={workspaceDocument}
            contentId="pilot-voice-resource"
            sourceLayout={slotList.sourceLayout}
            configuredPath={slotList.configured.folderPath}
            onMoved={() => {
              lastLoadedKeyRef.current = "";
              void loadSlotList();
            }}
            className="mt-2"
          />
        ) : null
      }
      metaLines={
        document
          ? [
              {
                label: t("common.file"),
                value: document.savePath,
                onOpen: () => {
                  void dirname(document.savePath).then((target) => openPath(target));
                },
              },
            ]
          : undefined
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
              {slotList?.sourceLayout === "missing" ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t("sound.tableMissing")}</p>
              ) : null}
              {visibleRecords.length === 0 && slotList?.sourceLayout !== "missing" ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{t("voiceOrder.noMatch")}</p>
              ) : null}
              {visibleRecords.map((record) => {
                const stem = record.voiceStem ?? "";
                const active = stem.toUpperCase() === (selectedStem ?? "").toUpperCase();
                return (
                  <button
                    key={`${stem}-${record.voiceKey}`}
                    type="button"
                    onClick={() => setSelectedStem(stem)}
                    className={cn(
                      "block min-h-10 w-full px-3 py-2 text-left text-xs transition-colors duration-150",
                      active ? "bg-accent" : "hover:bg-muted/60",
                    )}
                  >
                    <div className="truncate font-medium">{stem || t("common.empty")}</div>
                    <div className="truncate font-mono text-[10px] tabular-nums text-muted-foreground">
                      {formatHash(record.votPackage)}
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
            current="vot"
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
          {votError ? (
            <div className="space-y-1 rounded-lg bg-destructive/10 px-3 py-2">
              <p className="text-xs font-medium text-destructive">{t("voiceOrder.unpackFailed")}</p>
              <p className="break-all font-mono text-[11px] text-destructive text-pretty">{votError}</p>
            </div>
          ) : null}
          {document ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {document.innerName} · selfId {formatHash(document.table.selfId)} · {document.table.situations.length}
              </p>
              {document.insidePack ? (
                <p className="text-xs font-medium text-amber-700 text-pretty dark:text-amber-400">
                  {t("voiceOrder.insidePack", { path: document.savePath })}
                </p>
              ) : null}
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[240px_1fr]">
                <ScrollArea className="h-80 rounded-lg bg-muted/20 md:h-full">
                  <div className="py-1">
                    {document.table.situations.map((situation, index) => (
                      <button
                        key={`${situation.situationId}-${index}`}
                        type="button"
                        onClick={() => setSelectedIndex(index)}
                        className={cn(
                          "block min-h-10 w-full px-3 py-2 text-left text-xs transition-colors duration-150",
                          index === selectedIndex ? "bg-accent" : "hover:bg-muted/60",
                        )}
                      >
                        <span className="font-mono tabular-nums">{formatHash(situation.situationId)}</span>
                        <span className="ml-2 text-muted-foreground">{situation.cues.length}</span>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
                {selected && selectedIndex != null ? (
                  <div className="space-y-3 rounded-lg bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground text-pretty">{t("voiceOrder.situationLocked")}</p>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 transition-[transform,background-color] duration-150 ease-out active:scale-[0.98]"
                        onClick={() => {
                          const next = cloneDocument(document);
                          const copy = structuredClone(next.table.situations[selectedIndex]);
                          next.table.situations.splice(selectedIndex + 1, 0, copy);
                          mark(next);
                          setSelectedIndex(selectedIndex + 1);
                        }}
                      >
                        {t("voiceOrder.duplicate")}
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <NumberField
                        label={t("voiceOrder.volume")}
                        value={selected.volumePercent}
                        onCommit={(volumePercent) => updateSituation(selectedIndex, { volumePercent })}
                      />
                      <NumberField
                        label="param50"
                        value={selected.param50}
                        onCommit={(param50) => updateSituation(selectedIndex, { param50 })}
                      />
                      <NumberField
                        label="param100"
                        value={selected.param100}
                        onCommit={(param100) => updateSituation(selectedIndex, { param100 })}
                      />
                    </div>
                    <div className="space-y-2">
                      {selected.cues.map((cue, cueIndex) => {
                        const nameKey = `${selectedIndex}:${cueIndex}`;
                        return (
                          <div key={nameKey} className="grid grid-cols-[1fr_120px_1fr_auto] gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">cueId</Label>
                              <p className="font-mono text-xs tabular-nums">{formatHash(cue.cueId)}</p>
                            </div>
                            <NumberField
                              label={t("voiceOrder.flags")}
                              value={cue.flags}
                              onCommit={(flags) => {
                                const cues = selected.cues.map((row, index) =>
                                  index === cueIndex ? { ...row, flags } : row,
                                );
                                updateSituation(selectedIndex, { cues });
                              }}
                            />
                            <div className="space-y-1">
                              <Label className="text-xs">{t("voiceOrder.cueName")}</Label>
                              <Input
                                value={cueNames[nameKey] ?? ""}
                                placeholder="VO_01_P01_CHARA_SELECT_01"
                                className="h-8 font-mono text-xs"
                                onChange={(event) =>
                                  setCueNames((prev) => ({ ...prev, [nameKey]: event.target.value }))
                                }
                                onBlur={(event) => {
                                  const cueId = cueIdFromCueName(event.currentTarget.value);
                                  if (cueId == null) return;
                                  updateSituation(selectedIndex, {
                                    cues: replaceCueId(selected.cues, cueIndex, cueId),
                                  });
                                }}
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="mt-5 h-10 transition-[transform,background-color] duration-150 ease-out active:scale-[0.98]"
                              onClick={() => updateSituation(selectedIndex, removeCue(selected, cueIndex))}
                            >
                              {t("voiceOrder.removeCue")}
                            </Button>
                          </div>
                        );
                      })}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 transition-[transform,background-color] duration-150 ease-out active:scale-[0.98]"
                        onClick={() => updateSituation(selectedIndex, appendCue(selected))}
                      >
                        {t("voiceOrder.addCue")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      }
    />
  );
}

function NumberField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={text}
        className="h-8 font-mono text-xs tabular-nums"
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const parsed = Number(text);
          if (!Number.isInteger(parsed) || parsed < 0) {
            setText(String(value));
            return;
          }
          onCommit(parsed);
        }}
      />
    </div>
  );
}
