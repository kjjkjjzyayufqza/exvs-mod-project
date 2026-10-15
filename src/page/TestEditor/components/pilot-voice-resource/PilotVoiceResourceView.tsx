import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dirname, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfigStore } from "@/store/configStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { VoiceChainRail } from "../sound-table/SoundChainRail";
import {
  audioFileStem,
  createVoiceDraft,
  formatPackageHash,
  missingVoicePackages,
  planNewVoiceBankPack,
  planNewVoiceOrderPack,
  votPackageForStem,
  voiceChainTabForStep,
  voiceSaveRepackHashes,
  type PlannedVoicePack,
  type SoundFocus,
  type VoiceDraft,
} from "../sound-table/soundChainModel";
import {
  invalidateSoundChainCache,
  openSoundChainPath,
  pilotAudioAbsolutePath,
} from "../sound-table/soundChainResolve";
import {
  buildRawPathIdPack,
  derivePilotVoiceSource,
  parseRawPathIdPack,
  type RawPathIdEntry,
} from "../raw-path-id/rawPathIdDocument";
import { useVoiceChain } from "../sound-table/useSoundChain";
import { findNus3bankFile } from "../bgm-table/bgmTableDocument";
import { planPilotVoiceBankInit } from "../pilot-voice-bank/initPilotVoiceBank";
import {
  clonePilotVoiceBankFromDonor,
  listNus3audioTrackNames,
  parsePilotVoiceBank,
  writeClonedPilotVoiceBank,
} from "../pilot-voice-bank/pilotVoiceBankDocument";
import { writeRemappedVoiceOrderPack } from "../voice-order-table/voiceOrderTableDocument";
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

type PlannedWrite = {
  label: string;
  path: string;
  action: "new" | "overwrite";
};

type GeneratedVotWrite = {
  stem: string;
  donorPath: string;
  donorStem: string;
  donorCueNames: string[];
  newCueNames: string[];
  votPackage: number;
  votPath: string;
  structurePath: string;
  identity: WorkspacePackIdentity;
};

type GeneratedBankWrite = {
  donorBankPath: string;
  donorPackPath: string;
  newCueNames: string[];
  savePath: string;
  structurePath: string;
  hashName: string;
  innerName: string;
  identity: WorkspacePackIdentity;
};

type PendingVoiceSave = {
  writes: PlannedWrite[];
  audioCopies: { source: string; dest: string }[];
  pathWrite: {
    entries: RawPathIdEntry[];
    jsonPath: string;
    vgsht1Path: string;
    pack: ResolvedWorkspaceContentPack;
  } | null;
  draftStems: string[];
  generatedVots: GeneratedVotWrite[];
  generatedBanks: GeneratedBankWrite[];
};

function voicePackIdentity(plan: PlannedVoicePack): WorkspacePackIdentity {
  const folderName = plan.folderPath.split(/[\\/]/).pop() || plan.hashHex;
  return {
    packKey: `${plan.prefix}/${folderName}`,
    routeId: plan.routeId,
    prefix: plan.prefix,
    hashFolderName: folderName,
    folderPath: plan.folderPath,
    structureJsonPath: plan.structurePath,
    sourceLayout: "configured",
  };
}

async function cueNamesAt(path: string): Promise<string[]> {
  if (!path || !(await exists(path))) return [];
  try {
    return await listNus3audioTrackNames(path);
  } catch {
    return [];
  }
}

type PilotVoiceResourceViewProps = {
  folderPath: string;
  isActive: boolean;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  onPackMutated?: (pack: WorkspacePackIdentity) => void;
  workspaceDocument: TestEditorWorkspaceDocument;
  soundFocus?: SoundFocus | null;
  onConsumeSoundFocus?: () => void;
  onOpenSoundFocus?: (focus: SoundFocus) => void;
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
  soundFocus = null,
  onConsumeSoundFocus,
  onOpenSoundFocus,
}: PilotVoiceResourceViewProps) {
  const { t } = useTranslation("test-lists");
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [hasChanges, setHasChanges] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [donorIndex, setDonorIndex] = useState("");
  const [drafts, setDrafts] = useState<Record<string, VoiceDraft>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState<PendingVoiceSave | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [chainRefresh, setChainRefresh] = useState(0);
  const consumedFocus = useRef<SoundFocus | null>(null);
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
    invalidateSoundChainCache();
    setChainRefresh((value) => value + 1);
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
      setDrafts({});
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
    async (
      patch: Partial<PilotVoiceResourceRecord>,
      donor?: { donorVotPackage: number; donorBankPackage: number; donorStem: string },
    ) => {
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
        const oldStem = (current.voiceStem ?? "").trim().toUpperCase();
        const renaming = drafts[oldStem];
        const newStem = (nextRecord.voiceStem ?? "").trim().toUpperCase();
        if (renaming && !renaming.saved && newStem) {
          nextRecord = { ...nextRecord, votPackage: votPackageForStem(newStem) };
        }
      }
      const records = loadState.table.records.map((record, index) =>
        index === selectedIndex ? nextRecord : record,
      );
      markChanged({ ...loadState.table, records });
      setDrafts((prev) => {
        let next = prev;
        if (patch.voiceStem !== undefined) {
          const oldStem = (current.voiceStem ?? "").trim().toUpperCase();
          const newStem = (nextRecord.voiceStem ?? "").trim().toUpperCase();
          const draft = prev[oldStem];
          if (draft && !draft.saved && oldStem !== newStem) {
            next = { ...prev };
            delete next[oldStem];
            if (newStem) {
              const fresh = createVoiceDraft(newStem, draft.sourceAudioPath);
              next[newStem] = {
                ...fresh,
                votPackage: nextRecord.votPackage,
                dummyPackage: nextRecord.dummyPackage,
                bankPackage: nextRecord.bankPackage || fresh.bankPackage,
                donorVotPackage: draft.donorVotPackage,
                donorBankPackage: draft.donorBankPackage,
                donorStem: draft.donorStem,
              };
            }
          }
        }
        const stem = (nextRecord.voiceStem ?? "").trim().toUpperCase();
        const draft = next[stem];
        const packagesChanged =
          patch.votPackage !== undefined ||
          patch.dummyPackage !== undefined ||
          patch.bankPackage !== undefined;
        if (draft && !draft.saved && (packagesChanged || donor)) {
          if (next === prev) next = { ...prev };
          next[stem] = {
            ...draft,
            votPackage: nextRecord.votPackage,
            dummyPackage: nextRecord.dummyPackage,
            bankPackage:
              patch.bankPackage === undefined ? draft.bankPackage : nextRecord.bankPackage,
            ...(donor ?? {}),
          };
        }
        return next;
      });
    },
    [drafts, loadState, markChanged, selectedIndex],
  );

  const pickAudio = useCallback(async () => {
    if (loadState.status !== "ready" || !loadState.writable) return;
    const picked = await open({
      multiple: false,
      filters: [{ name: "nus3audio", extensions: ["nus3audio"] }],
    });
    const sourceAudioPath = Array.isArray(picked) ? picked[0] : picked;
    if (!sourceAudioPath) return;
    const stem = audioFileStem(sourceAudioPath);
    if (!stem) {
      toast.error(t("pilotVoice.badAudioName"));
      return;
    }
    const existing = loadState.table.records.findIndex(
      (record) => (record.voiceStem ?? "").trim().toUpperCase() === stem,
    );
    if (existing >= 0) {
      setSelectedIndex(existing);
      toast.message(t("pilotVoice.alreadyInTable", { name: stem }));
      return;
    }
    try {
      const draft = createVoiceDraft(stem, sourceAudioPath);
      const record = await finalizePilotVoiceResourceEntry({
        ...emptyPilotVoiceResourceRecord(),
        voiceStem: stem,
        votPackage: draft.votPackage,
        bankPackage: draft.bankPackage,
      });
      const records = [...loadState.table.records, record];
      markChanged({ ...loadState.table, records });
      setSelectedIndex(records.length - 1);
      setDrafts((prev) => ({ ...prev, [stem]: draft }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [loadState, markChanged, t]);

  // Remove only drops this Slot row and its unsaved draft. Path, the copied
  // .nus3audio, the voice bank, and the character-list hash stay where they are.
  // TODO: finish Remove for the rest of this voice chain. A donor bank is shared;
  // do not delete that bank file just because one Slot row was removed.
  const handleDelete = useCallback(() => {
    if (loadState.status !== "ready" || selectedIndex == null || !loadState.writable) return;
    const stem = (loadState.table.records[selectedIndex]?.voiceStem ?? "").trim().toUpperCase();
    const records = loadState.table.records.filter((_, index) => index !== selectedIndex);
    markChanged({ ...loadState.table, records });
    setSelectedIndex(records.length ? Math.min(selectedIndex, records.length - 1) : null);
    if (stem) {
      setDrafts((prev) => {
        if (!prev[stem]) return prev;
        const next = { ...prev };
        delete next[stem];
        return next;
      });
    }
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
    const present = new Set(
      loadState.table.records
        .map((record) => (record.voiceStem ?? "").trim().toUpperCase())
        .filter(Boolean),
    );
    const unsaved = Object.values(drafts).filter((draft) => !draft.saved && present.has(draft.stem));
    if (unsaved.some((draft) => (draft.donorVotPackage >>> 0) === 0 || !draft.donorStem)) {
      toast.error(t("pilotVoice.votDonorMissing"));
      return;
    }
    const writes: PlannedWrite[] = [
      {
        label: "pilotvoiceresourcetable.vrtbl",
        path: loadState.filePath,
        action: (await exists(loadState.filePath)) ? "overwrite" : "new",
      },
    ];
    const audioCopies: PendingVoiceSave["audioCopies"] = [];
    if (unsaved.length > 0 && !obDplCachePath) {
      toast.error(t("common.setObDplcacheInit"));
      return;
    }
    for (const draft of unsaved) {
      const dest = await pilotAudioAbsolutePath(obDplCachePath ?? "", draft.source);
      if (!dest) {
        toast.error(t("common.setObDplcacheInit"));
        return;
      }
      writes.push({
        label: draft.source,
        path: dest,
        action: (await exists(dest)) ? "overwrite" : "new",
      });
      audioCopies.push({ source: draft.sourceAudioPath, dest });
    }
    let pathWrite: PendingVoiceSave["pathWrite"] = null;
    let pathEntries: RawPathIdEntry[] = [];
    if (unsaved.length > 0) {
      const content = await resolveWorkspaceContent(folderPath, workspaceDocument, "raw-path-id");
      if (!content.existing || content.sourceLayout === "missing") {
        toast.error(t("pilotVoice.pathTableMissing"));
        return;
      }
      const parsed = await parseRawPathIdPack(content.existing.folderPath);
      const entries = [...parsed.document.entries];
      let added = false;
      for (const draft of unsaved) {
        const entry = await derivePilotVoiceSource(draft.stem);
        if (!entries.some((row) => row.key === entry.key)) {
          entries.push(entry);
          added = true;
        }
      }
      pathEntries = entries;
      if (added) {
        writes.push(
          {
            label: "raw_path_id_release.json",
            path: parsed.jsonPath,
            action: (await exists(parsed.jsonPath)) ? "overwrite" : "new",
          },
          {
            label: "raw_path_id_release.vgsht1",
            path: parsed.vgsht1Path,
            action: (await exists(parsed.vgsht1Path)) ? "overwrite" : "new",
          },
        );
        pathWrite = {
          entries,
          jsonPath: parsed.jsonPath,
          vgsht1Path: parsed.vgsht1Path,
          pack: content.existing,
        };
      }
    }
    const generatedVots: GeneratedVotWrite[] = [];
    const generatedBanks: GeneratedBankWrite[] = [];
    for (const draft of unsaved) {
      if ((draft.donorVotPackage >>> 0) === 0 || !draft.donorStem) continue;
      const donorPath = await join(obDplCachePath ?? "", `${formatPackageHash(draft.donorVotPackage)}.fhm2d`);
      if (!(await exists(donorPath))) {
        toast.error(t("pilotVoice.votDonorMissing"));
        return;
      }
      const newCueNames = await cueNamesAt(draft.sourceAudioPath);
      const donorNames = new Set<string>();
      const donorEntry = await derivePilotVoiceSource(draft.donorStem);
      const listed = pathEntries.find((row) => row.key === donorEntry.key);
      const donorAudio = await pilotAudioAbsolutePath(
        obDplCachePath ?? "",
        listed?.source || donorEntry.source,
      );
      for (const name of await cueNamesAt(donorAudio)) donorNames.add(name);
      let donorBankFile = "";
      let donorPackPath = "";
      if ((draft.donorBankPackage >>> 0) !== 0) {
        const bankPlan = planPilotVoiceBankInit({
          dplCacheDir: obDplCachePath ?? "",
          workspaceRoot: folderPath,
          stem: draft.donorStem,
          bankPackage: draft.donorBankPackage,
        });
        donorPackPath = bankPlan.sourceFhm2dPath;
        donorBankFile = (await findNus3bankFile(bankPlan.workspaceFolder)) ?? "";
        if (donorBankFile) {
          try {
            const bank = await parsePilotVoiceBank(donorBankFile);
            for (const cue of bank.cues) donorNames.add(cue.name);
          } catch {
            donorBankFile = "";
          }
        }
      }
      if (newCueNames.length === 0 || donorNames.size === 0) {
        toast.error(t("pilotVoice.votCueNamesMissing", { name: draft.stem }));
        return;
      }
      const vot = planNewVoiceOrderPack(folderPath, draft.stem);
      generatedVots.push({
        stem: draft.stem,
        donorPath,
        donorStem: draft.donorStem,
        donorCueNames: [...donorNames],
        newCueNames,
        votPackage: vot.packageId,
        votPath: vot.filePath,
        structurePath: vot.structurePath,
        identity: voicePackIdentity(vot),
      });
      writes.push(
        {
          label: vot.innerName,
          path: vot.filePath,
          action: (await exists(vot.filePath)) ? "overwrite" : "new",
        },
        {
          label: `${vot.hashHex}_structure.json`,
          path: vot.structurePath,
          action: (await exists(vot.structurePath)) ? "overwrite" : "new",
        },
      );
      if (donorBankFile && donorPackPath) {
        try {
          await clonePilotVoiceBankFromDonor(donorBankFile, newCueNames);
          const bank = planNewVoiceBankPack(folderPath, draft.originName);
          generatedBanks.push({
            donorBankPath: donorBankFile,
            donorPackPath,
            newCueNames,
            savePath: bank.filePath,
            structurePath: bank.structurePath,
            hashName: bank.hashHex,
            innerName: bank.innerName,
            identity: voicePackIdentity(bank),
          });
          writes.push(
            {
              label: bank.innerName,
              path: bank.filePath,
              action: (await exists(bank.filePath)) ? "overwrite" : "new",
            },
            {
              label: `${bank.hashHex}_structure.json`,
              path: bank.structurePath,
              action: (await exists(bank.structurePath)) ? "overwrite" : "new",
            },
          );
        } catch {
          // The TONE template is not proven. Leave the bank file unwritten.
        }
      }
    }
    setPendingSave({
      writes,
      audioCopies,
      pathWrite,
      draftStems: unsaved.map((draft) => draft.stem),
      generatedVots,
      generatedBanks,
    });
  }, [drafts, folderPath, loadState, obDplCachePath, t, workspaceDocument]);

  const commitSave = useCallback(
    async (plan: PendingVoiceSave) => {
      if (loadState.status !== "ready") return;
      const written: string[] = [];
      try {
        for (const copy of plan.audioCopies) {
          await mkdir(await dirname(copy.dest), { recursive: true });
          await copyFile(copy.source, copy.dest);
          written.push(copy.dest);
        }
        const writtenVotPackages = new Map<string, number>();
        for (const vot of plan.generatedVots) {
          await writeRemappedVoiceOrderPack({
            donorPath: vot.donorPath,
            donorStem: vot.donorStem,
            newStem: vot.stem,
            donorCueNames: vot.donorCueNames,
            newCueNames: vot.newCueNames,
            votPath: vot.votPath,
            structurePath: vot.structurePath,
          });
          written.push(vot.votPath, vot.structurePath);
          writtenVotPackages.set(vot.stem, vot.votPackage);
        }
        const writtenBankIdentities: WorkspacePackIdentity[] = [];
        for (const bank of plan.generatedBanks) {
          try {
            await writeClonedPilotVoiceBank({
              donorBankPath: bank.donorBankPath,
              donorPackPath: bank.donorPackPath,
              newCueNames: bank.newCueNames,
              savePath: bank.savePath,
              structurePath: bank.structurePath,
              hashName: bank.hashName,
              innerName: bank.innerName,
            });
            written.push(bank.savePath, bank.structurePath);
            writtenBankIdentities.push(bank.identity);
          } catch {
            // Refused template: do not write the bank and do not mark it dirty.
          }
        }
        let table = loadState.table;
        if (writtenVotPackages.size > 0) {
          table = {
            ...table,
            records: table.records.map((record) => {
              const stem = (record.voiceStem ?? "").trim().toUpperCase();
              const votPackage = writtenVotPackages.get(stem);
              return votPackage === undefined ? record : { ...record, votPackage };
            }),
          };
        }
        const writtenTable = await buildPilotVoiceResourcePack(table, loadState.filePath);
        written.push(loadState.filePath);
        if (plan.pathWrite) {
          await buildRawPathIdPack(
            { entries: plan.pathWrite.entries },
            plan.pathWrite.jsonPath,
            plan.pathWrite.vgsht1Path,
          );
          written.push(plan.pathWrite.jsonPath, plan.pathWrite.vgsht1Path);
        }
        setLoadState({ ...loadState, table: writtenTable });
        setHasChanges(false);
        onUnsavedChanges?.(false);
        setDrafts((prev) => {
          const next = { ...prev };
          for (const stem of plan.draftStems) {
            const draft = next[stem];
            if (!draft) continue;
            const votPackage = writtenVotPackages.get(stem);
            next[stem] = {
              ...draft,
              saved: true,
              votPackage: votPackage === undefined ? draft.votPackage : votPackage,
            };
          }
          return next;
        });
        invalidateSoundChainCache();
        setChainRefresh((value) => value + 1);
        const dirtyHashes = new Set(
          voiceSaveRepackHashes(
            plan.pathWrite !== null,
            [
              ...plan.generatedVots.map((vot) => vot.identity.hashFolderName),
              ...writtenBankIdentities.map((pack) => pack.hashFolderName),
            ],
          ).map((hash) => hash.toUpperCase()),
        );
        if (
          dirtyHashes.has(loadState.pack.hashHex.toUpperCase()) &&
          (await exists(loadState.pack.structureJsonPath))
        ) {
          onPackMutated?.(workspacePackIdentityFromResolved(loadState.pack, "configured"));
        }
        if (
          plan.pathWrite &&
          dirtyHashes.has(plan.pathWrite.pack.hashHex.toUpperCase()) &&
          (await exists(plan.pathWrite.pack.structureJsonPath))
        ) {
          onPackMutated?.(workspacePackIdentityFromResolved(plan.pathWrite.pack, "configured"));
        }
        for (const vot of plan.generatedVots) {
          if (
            dirtyHashes.has(vot.identity.hashFolderName.toUpperCase()) &&
            (await exists(vot.structurePath))
          ) {
            onPackMutated?.(vot.identity);
          }
        }
        for (const pack of writtenBankIdentities) {
          if (
            dirtyHashes.has(pack.hashFolderName.toUpperCase()) &&
            (await exists(pack.structureJsonPath))
          ) {
            onPackMutated?.(pack);
          }
        }
        toast.success(t("sound.saved"));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(
          t("pilotVoice.partialWrite", {
            paths: written.length > 0 ? written.join("\n") : t("pilotVoice.nothingWritten"),
            message,
          }),
        );
      }
    },
    [loadState, onPackMutated, onUnsavedChanges, t],
  );

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

  const selectedStem = selected?.voiceStem?.trim().toUpperCase() ?? "";
  const selectedDraft = selectedStem ? drafts[selectedStem] ?? null : null;
  const selectedEmpty = selected ? emptyPilotVoiceFields(selected) : [];
  const chainStem = selected?.voiceStem?.trim() ?? "";
  const { snapshot: voiceChain, loading: voiceChainLoading } = useVoiceChain({
    isActive,
    workspaceRoot: folderPath,
    workspaceDocument,
    stem: chainStem,
    refreshKey: chainRefresh,
  });

  useEffect(() => {
    if (!isActive || !soundFocus || soundFocus.tab !== "pilot-voice-resource") return;
    if (loadState.status !== "ready") return;
    if (consumedFocus.current === soundFocus) return;
    consumedFocus.current = soundFocus;
    const stem = soundFocus.voiceStem?.trim().toUpperCase() ?? "";
    const voiceKey = soundFocus.voiceKey;
    const index = loadState.table.records.findIndex((record) => {
      if (stem && (record.voiceStem ?? "").toUpperCase() === stem) return true;
      return voiceKey !== undefined && (record.voiceKey >>> 0) === (voiceKey >>> 0);
    });
    if (index >= 0) setSelectedIndex(index);
    onConsumeSoundFocus?.();
  }, [isActive, loadState, onConsumeSoundFocus, soundFocus]);

  const openChainFile = useCallback((path: string) => {
    void openSoundChainPath(path).then((result) => {
      if (result === "missing") toast.error(t("common.pathMissing"));
    });
  }, [t]);

  return (
    <>
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
            onClick={() => setAddOpen(true)}
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
                  const rowStem = (record.voiceStem ?? "").trim().toUpperCase();
                  const rowDraft = rowStem ? drafts[rowStem] : undefined;
                  const rowUnsaved = Boolean(rowDraft && !rowDraft.saved);
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
                        {rowUnsaved ? (
                          <span className="shrink-0 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            {t("soundChain.draftUnsaved")}
                          </span>
                        ) : missing.length > 0 ? (
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
            <VoiceChainRail
              current="slot"
              snapshot={voiceChain}
              loading={voiceChainLoading}
              draft={selectedDraft}
              draftLabel={selected.voiceStem?.trim() || t("pilotVoice.newVoice")}
              draftMissingPackages={missingVoicePackages(selected)}
              onOpenStep={(step) => {
                const stem = selected.voiceStem?.trim();
                if (!stem || !onOpenSoundFocus) return;
                onOpenSoundFocus({
                  tab: voiceChainTabForStep(step),
                  voiceStem: stem,
                  voiceKey: selected.voiceKey,
                  filePath: step === "vot" && voiceChain?.votPackExists ? voiceChain.votPackPath : undefined,
                });
              }}
              onOpenFile={openChainFile}
            />
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
            <p className="text-xs text-muted-foreground text-pretty">{t("pilotVoice.keysFromStem")}</p>
            <HashField
              label={t("pilotVoice.voiceKey")}
              value={selected.voiceKey}
              empty={selectedEmpty.includes("voiceKey")}
              disabled
              onCommit={() => undefined}
            />
            <HashField
              label={t("pilotVoice.streamPathId")}
              value={selected.streamPathId}
              empty={selectedEmpty.includes("streamPathId")}
              disabled
              onCommit={() => undefined}
            />
            <p className="text-xs text-muted-foreground text-pretty">{t("pilotVoice.packagesHint")}</p>
            <div className="flex items-center gap-2">
              <select
                value={donorIndex}
                onChange={(event) => setDonorIndex(event.target.value)}
                disabled={!loadState.writable}
                className="h-10 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
              >
                <option value="">{t("pilotVoice.copyPackages")}</option>
                {loadState.table.records.map((record, index) =>
                  index === selectedIndex ? null : (
                    <option key={`${record.voiceStem ?? "row"}-${index}`} value={String(index)}>
                      {recordLabel(record, t("pilotVoice.newVoice"))}
                    </option>
                  ),
                )}
              </select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 transition-[transform,background-color] duration-150 ease-out active:scale-[0.98]"
                disabled={!loadState.writable || donorIndex === ""}
                onClick={() => {
                  const donor = loadState.table.records[Number(donorIndex)];
                  if (!donor) return;
                  const donorPatch = {
                    donorVotPackage: donor.votPackage >>> 0,
                    donorBankPackage: donor.bankPackage >>> 0,
                    donorStem: (donor.voiceStem ?? "").trim().toUpperCase(),
                  };
                  const stem = (selected.voiceStem ?? "").trim().toUpperCase();
                  const draft = stem ? drafts[stem] : null;
                  if (draft && !draft.saved) {
                    void updateSelected({}, donorPatch);
                    toast.message(t("pilotVoice.donorRemembered"));
                    return;
                  }
                  void updateSelected({ votPackage: donor.votPackage }, donorPatch);
                }}
              >
                {t("pilotVoice.copyPackages")}
              </Button>
            </div>
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
    <AlertDialog open={addOpen} onOpenChange={setAddOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("pilotVoice.addTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("pilotVoice.addBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Button
            type="button"
            className="h-10 w-full transition-[transform,background-color] duration-150 ease-out active:scale-[0.98]"
            onClick={() => {
              setAddOpen(false);
              void pickAudio();
            }}
          >
            {t("pilotVoice.useDonorBank")}
          </Button>
          <p className="text-xs text-muted-foreground text-pretty">{t("pilotVoice.bankNotWritten")}</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog
      open={pendingSave !== null}
      onOpenChange={(open) => {
        if (!open) setPendingSave(null);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("pilotVoice.saveConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("pilotVoice.saveConfirmBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-64 space-y-2 overflow-auto">
          {pendingSave && pendingSave.draftStems.length > 0 && pendingSave.generatedBanks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-pretty">{t("pilotVoice.bankNotWritten")}</p>
          ) : null}
          {pendingSave?.writes.map((write) => (
            <div key={write.path} className="rounded-lg bg-muted/40 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium">{write.label}</span>
                <span className="shrink-0 font-medium text-amber-700 tabular-nums dark:text-amber-400">
                  {write.action === "overwrite" ? t("pilotVoice.writeOverwrite") : t("pilotVoice.writeNew")}
                </span>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] tabular-nums text-muted-foreground">{write.path}</p>
            </div>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingSave) void commitSave(pendingSave);
            }}
          >
            {t("common.save")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
