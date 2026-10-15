import { FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatHash } from "@/models/commandTable";
import { cn } from "@/lib/utils";
import {
  missingVoicePackages,
  voicePathKeyForStem,
  votStepStatus,
  type BgmChainSnapshot,
  type BgmChainStepId,
  type VoiceChainSnapshot,
  type VoiceChainStepId,
  type VoiceDraft,
} from "./soundChainModel";

function fileNameOf(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? path;
}

function StepButton({
  label,
  status,
  current,
  disabled,
  onClick,
}: {
  label: string;
  status: string;
  current: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!current) onClick();
      }}
      className={cn(
        "min-h-10 min-w-10 rounded-lg px-3 py-2 text-left transition-[transform,background-color] duration-150 ease-out active:scale-[0.98] disabled:cursor-default disabled:active:scale-100",
        current ? "bg-accent" : "hover:bg-muted/70",
      )}
    >
      <div className="text-xs font-medium text-balance">{label}</div>
      <div className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">{status}</div>
    </button>
  );
}

function ChainFrame({
  savedNote,
  noteWarning,
  loading,
  steps,
  capability,
  warnings,
  filePath,
  onOpenFile,
}: {
  savedNote: string;
  noteWarning?: boolean;
  loading: boolean;
  steps: { id: string; label: string; status: string; current: boolean; disabled?: boolean; onClick: () => void }[];
  capability: string;
  warnings: string[];
  filePath: string | null;
  onOpenFile?: () => void;
}) {
  const { t } = useTranslation("test-lists");
  return (
    <div className="mb-3 rounded-2xl bg-muted/30 p-2">
      <p
        className={cn(
          "px-1 pb-2 text-[11px] text-pretty",
          noteWarning ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        {loading && !noteWarning ? t("soundChain.loading") : savedNote}
      </p>
      <div
        className={cn(
          "grid grid-cols-2 gap-2",
          steps.length > 4 ? "md:grid-cols-5" : "md:grid-cols-4",
        )}
      >
        {steps.map((step) => (
          <StepButton key={step.id} {...step} />
        ))}
      </div>
      <p className="px-1 pt-2 text-xs text-muted-foreground text-pretty">{capability}</p>
      {warnings.map((warning) => (
        <p key={warning} className="px-1 pt-1 text-xs font-medium text-amber-700 text-pretty dark:text-amber-400">
          {warning}
        </p>
      ))}
      {filePath ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-background/70 px-2 py-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums">{filePath}</span>
          {onOpenFile ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-10 shrink-0 px-2 transition-[transform,background-color] duration-150 ease-out active:scale-[0.98]"
              onClick={onOpenFile}
            >
              <FolderOpen className="h-4 w-4" />
              <span className="sr-only">{t("soundChain.openFile")}</span>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function VoiceChainRail({
  current,
  snapshot,
  loading,
  draft,
  draftLabel,
  draftMissingPackages,
  onOpenStep,
  onOpenFile,
}: {
  current: VoiceChainStepId;
  snapshot: VoiceChainSnapshot | null;
  loading: boolean;
  draft?: VoiceDraft | null;
  draftLabel?: string;
  draftMissingPackages?: string[];
  onOpenStep: (step: Exclude<VoiceChainStepId, "audio">) => void;
  onOpenFile: (path: string) => void;
}) {
  const { t } = useTranslation("test-lists");
  const unregistered = t("soundChain.unregistered");
  const preview = draft && !draft.saved ? draft : null;
  const slotStatus = preview
    ? preview.stem
    : current === "slot" && draftLabel
      ? draftLabel
      : snapshot?.slotTableMissing
        ? t("soundChain.tableMissing")
        : snapshot?.slot.found
          ? snapshot.slot.voiceStem || snapshot.stem
          : unregistered;
  const pathStatus = preview
    ? voicePathKeyForStem(preview.stem)
    : snapshot?.pathTableMissing
      ? t("soundChain.tableMissing")
      : snapshot?.path.found
        ? fileNameOf(snapshot.path.source || snapshot.path.key)
        : unregistered;
  const audioStatus = preview
    ? preview.source
    : !snapshot || !snapshot.audioRelative
      ? t("soundChain.noAudioPath")
      : snapshot.audioExists === false
        ? t("soundChain.fileMissing")
        : fileNameOf(snapshot.audioAbsolute || snapshot.audioRelative);
  const votDescribed = votStepStatus(
    preview
      ? { previewPackage: preview.votPackage }
      : {
          slotTableMissing: snapshot?.slotTableMissing,
          slotFound: snapshot?.slot.found,
          votPackage: snapshot?.slot.votPackage,
          votPackExists: snapshot?.votPackExists,
          votPackPath: snapshot?.votPackPath,
        },
  );
  const votStatus =
    votDescribed.kind === "needPackage"
      ? t("soundChain.needVotPackage")
      : votDescribed.kind === "tableMissing"
        ? t("soundChain.tableMissing")
        : votDescribed.kind === "unregistered"
          ? unregistered
          : votDescribed.kind === "fileMissing"
            ? t("soundChain.fileMissing")
            : votDescribed.kind === "packFile"
              ? votDescribed.fileName
              : formatHash(votDescribed.hash);
  const bankStatus = preview
    ? preview.bankPackage === 0
      ? t("soundChain.needBankPackage")
      : formatHash(preview.bankPackage)
    : !snapshot
      ? unregistered
      : snapshot.bankPackage === 0
        ? t("soundChain.needBankPackage")
        : snapshot.bankFilePath
          ? fileNameOf(snapshot.bankFilePath)
          : t("soundChain.bankNotInitialized");

  const capabilityKey = {
    slot: "soundChain.capSlot",
    vot: "soundChain.capVot",
    path: "soundChain.capPath",
    audio: "soundChain.capAudio",
    voiceBank: "soundChain.capVoiceBank",
  }[current];

  const warnings: string[] = [];
  if (preview) {
    warnings.push(t("soundChain.draftUnsaved"));
    warnings.push(t("soundChain.audioNotCopied"));
    if (preview.bankMode === "new") warnings.push(t("soundChain.bankInMemory"));
  }
  const missingPackages = preview
    ? missingVoicePackages(preview)
    : current === "slot"
      ? (draftMissingPackages ?? snapshot?.slot.missingPackages ?? [])
      : snapshot?.slot.found
        ? snapshot.slot.missingPackages
        : [];
  if (missingPackages.length > 0) {
    warnings.push(t("soundChain.missingPackages", { fields: missingPackages.join(", ") }));
  }

  const filePath = preview
    ? current === "path"
      ? voicePathKeyForStem(preview.stem)
      : current === "audio"
        ? preview.source
        : current === "voiceBank"
          ? preview.bankPackage === 0
            ? null
            : formatHash(preview.bankPackage)
          : null
    : current === "path"
      ? snapshot?.path.source || null
      : current === "audio"
        ? snapshot?.audioAbsolute || snapshot?.audioRelative || null
        : current === "voiceBank"
          ? snapshot?.bankFilePath ?? null
          : current === "vot"
            ? snapshot?.votPackPath || null
            : null;

  const openTarget = preview
    ? current === "audio"
      ? preview.sourceAudioPath
      : ""
    : current === "voiceBank"
      ? snapshot?.bankFilePath ?? ""
      : snapshot?.audioAbsolute || "";

  return (
    <ChainFrame
      savedNote={preview ? t("soundChain.draftUnsaved") : t("soundChain.savedFile")}
      noteWarning={preview !== null}
      loading={loading}
      capability={t(capabilityKey)}
      warnings={warnings}
      filePath={filePath}
      onOpenFile={openTarget ? () => onOpenFile(openTarget) : undefined}
      steps={[
        { id: "slot", label: t("soundChain.slot"), status: slotStatus, current: current === "slot", onClick: () => onOpenStep("slot") },
        { id: "vot", label: t("soundChain.vot"), status: votStatus, current: current === "vot", onClick: () => onOpenStep("vot") },
        { id: "path", label: t("soundChain.path"), status: pathStatus, current: current === "path", onClick: () => onOpenStep("path") },
        {
          id: "audio",
          label: t("soundChain.audio"),
          status: audioStatus,
          current: current === "audio",
          onClick: () => {
            if (preview?.sourceAudioPath) onOpenFile(preview.sourceAudioPath);
            else if (snapshot?.audioAbsolute) onOpenFile(snapshot.audioAbsolute);
          },
        },
        { id: "voiceBank", label: t("soundChain.voiceBank"), status: bankStatus, current: current === "voiceBank", onClick: () => onOpenStep("voiceBank") },
      ]}
    />
  );
}

export function BgmChainRail({
  current,
  snapshot,
  loading,
  draftLabel,
  onOpenStep,
  onOpenFile,
}: {
  current: BgmChainStepId;
  snapshot: BgmChainSnapshot | null;
  loading: boolean;
  draftLabel?: string;
  onOpenStep: (step: Exclude<BgmChainStepId, "audio">) => void;
  onOpenFile: (path: string) => void;
}) {
  const { t } = useTranslation("test-lists");
  const unregistered = t("soundChain.unregistered");
  const groupNote = t("soundChain.group6Only");
  const bgmStatus = current === "bgm" && draftLabel
    ? draftLabel
    : snapshot?.bgmTableMissing
      ? t("soundChain.tableMissing")
      : snapshot?.bgm.found
        ? snapshot.bgm.cueName || `0x${snapshot.cueHash.toString(16).toUpperCase().padStart(8, "0")}`
        : unregistered;
  const hudStatus = snapshot?.hudTableMissing
    ? t("soundChain.tableMissing")
    : !snapshot || snapshot.cueHash === 0
      ? unregistered
      : snapshot.hudCount === 0
        ? t("soundChain.hudMissing")
        : snapshot.hudTitles[0] || String(snapshot.hudCount);
  const bankStatus = snapshot && !snapshot.groupInWorkspace
    ? groupNote
    : snapshot?.bankFilePath
      ? fileNameOf(snapshot.bankFilePath)
      : t("soundChain.bankNotInitialized");
  const audioStatus = snapshot && !snapshot.groupInWorkspace
    ? groupNote
    : !snapshot?.audioRelative && !snapshot?.audioAbsolute
      ? t("soundChain.noAudioPath")
      : snapshot.audioExists === false
        ? t("soundChain.fileMissing")
        : fileNameOf(snapshot.audioAbsolute || snapshot.audioRelative);

  const capabilityKey = {
    bgm: "soundChain.capBgm",
    hud: "soundChain.capHud",
    bank: "soundChain.capBank",
    audio: "soundChain.capBgmAudio",
  }[current];

  const warnings: string[] = [];
  if (snapshot && !snapshot.hudTableMissing && snapshot.cueHash !== 0 && snapshot.hudCount === 0) {
    warnings.push(t("soundChain.hudCrash"));
  }

  const filePath = current === "bank"
    ? snapshot?.bankFilePath ?? null
    : current === "audio"
      ? snapshot?.audioAbsolute || snapshot?.audioRelative || null
      : current === "bgm" && snapshot?.bgm.found
        ? snapshot.bgm.cueName || null
        : null;
  const openTarget = current === "bank"
    ? snapshot?.bankFilePath ?? ""
    : current === "audio"
      ? snapshot?.audioAbsolute || ""
      : "";

  return (
    <ChainFrame
      savedNote={t("soundChain.savedFile")}
      loading={loading}
      capability={t(capabilityKey)}
      warnings={warnings}
      filePath={filePath}
      onOpenFile={openTarget ? () => onOpenFile(openTarget) : undefined}
      steps={[
        { id: "bgm", label: t("soundChain.bgm"), status: bgmStatus, current: current === "bgm", onClick: () => onOpenStep("bgm") },
        { id: "hud", label: t("soundChain.hud"), status: hudStatus, current: current === "hud", onClick: () => onOpenStep("hud") },
        {
          id: "bank",
          label: t("soundChain.bank"),
          status: bankStatus,
          current: current === "bank",
          disabled: snapshot ? !snapshot.groupInWorkspace : false,
          onClick: () => onOpenStep("bank"),
        },
        {
          id: "audio",
          label: t("soundChain.audio"),
          status: audioStatus,
          current: current === "audio",
          disabled: snapshot ? !snapshot.groupInWorkspace : false,
          onClick: () => {
            if (snapshot?.audioAbsolute) onOpenFile(snapshot.audioAbsolute);
          },
        },
      ]}
    />
  );
}
