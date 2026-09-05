import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { MscSlotStatus, MscVerifyState } from "./mscPipeline";

interface MscPipelineBarProps {
  slots: MscSlotStatus[];
  /** Per-slot round-trip verify state, keyed by slot index. */
  verifyStates?: Readonly<Record<number, MscVerifyState>>;
}

type FlagTone = "idle" | "ok" | "bad" | "busy";

interface StageFlagProps {
  tone: FlagTone;
  label: string;
  title?: string;
}

const FLAG_TONE_CLASSES: Record<FlagTone, string> = {
  idle: "bg-muted text-muted-foreground/60",
  ok: "bg-primary/15 text-primary",
  bad: "bg-destructive/15 text-destructive",
  busy: "bg-muted text-muted-foreground",
};

function StageFlag({ tone, label, title }: StageFlagProps) {
  const icon =
    tone === "ok" ? (
      <CheckCircle2 className="size-3" />
    ) : tone === "bad" ? (
      <AlertCircle className="size-3" />
    ) : tone === "busy" ? (
      <Loader2 className="size-3 animate-spin" />
    ) : (
      <Circle className="size-3" />
    );
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors",
        FLAG_TONE_CLASSES[tone],
      )}
    >
      {icon}
      {label}
    </span>
  );
}

function verifyFlagProps(state: MscVerifyState | undefined, t: (key: string, options?: Record<string, unknown>) => string): StageFlagProps {
  if (!state) {
    return { tone: "idle", label: "VERIFY", title: t("pipeline.unverified") };
  }
  switch (state.status) {
    case "verifying":
      return { tone: "busy", label: "VERIFY", title: t("pipeline.verifying") };
    case "match":
      return {
        tone: "ok",
        label: "VERIFY",
        title: t("pipeline.match", { bytes: state.totalSize }),
      };
    case "mismatch":
      return {
        tone: "bad",
        label: "VERIFY",
        title: t("pipeline.mismatch", {
          offset: `0x${state.firstDivergenceOffset.toString(16)}`,
          original: state.originalSize,
          recompiled: state.recompiledSize,
        }),
      };
    case "error":
      return { tone: "bad", label: "VERIFY", title: state.message };
  }
}

/**
 * Compact, data-driven pipeline state. Each of the three pack slots reports
 * whether its source script and its decompiled C file exist on disk, plus the
 * latest round-trip verify outcome. The status flags are semantic (real file
 * and verify state), not decoration.
 */
export function MscPipelineBar({ slots, verifyStates }: MscPipelineBarProps) {
  const { t } = useTranslation("test-msc-workspace-ui");
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {slots.map((slot) => (
        <div
          key={slot.index}
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2",
            !slot.hasSource && "opacity-50",
          )}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium leading-tight">
              <span className="font-mono text-xs text-muted-foreground">{slot.index}</span>
              {slot.roleLabel}
            </div>
            <div className="truncate font-mono text-[11px] text-muted-foreground" title={slot.sourceName}>
              {slot.sourceName}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <StageFlag tone={slot.hasSource ? "ok" : "idle"} label="SRC" />
            <StageFlag tone={slot.hasDecompiled ? "ok" : "idle"} label={t("pipeline.c")} />
            <StageFlag {...verifyFlagProps(verifyStates?.[slot.index], t)} />
          </div>
        </div>
      ))}
    </div>
  );
}
