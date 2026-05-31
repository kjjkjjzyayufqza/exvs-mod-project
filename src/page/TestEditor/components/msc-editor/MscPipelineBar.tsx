import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MscSlotStatus } from "./mscPipeline";

interface MscPipelineBarProps {
  slots: MscSlotStatus[];
}

interface StageFlagProps {
  active: boolean;
  label: string;
}

function StageFlag({ active, label }: StageFlagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors",
        active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/60",
      )}
    >
      {active ? <CheckCircle2 className="size-3" /> : <Circle className="size-3" />}
      {label}
    </span>
  );
}

/**
 * Compact, data-driven pipeline state. Each of the three pack slots reports
 * whether its source script and its decompiled C file exist on disk. The
 * status flags are semantic (real file state), not decoration.
 */
export function MscPipelineBar({ slots }: MscPipelineBarProps) {
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
            <StageFlag active={slot.hasSource} label="SRC" />
            <StageFlag active={slot.hasDecompiled} label="C" />
          </div>
        </div>
      ))}
    </div>
  );
}
