import type { EffectProjectEditorDocument } from "../../effectProjectEditorUtils";
import { cn } from "@/lib/utils";

type Props = {
  draft: EffectProjectEditorDocument;
};

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-baseline gap-1.5 border-r border-border/60 pr-2 last:border-r-0 last:pr-0",
      )}
    >
      <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 truncate text-[10px] leading-tight", mono && "font-mono tabular-nums")}>{value}</span>
    </div>
  );
}

export function EffectProjectDocumentHeader({ draft }: Props) {
  return (
    <div className="rounded border border-border/70 bg-muted/25 px-2 py-1.5" data-i18n-ignore="">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Cell label="Magic" value={draft.magic} mono />
        <Cell label="0x8 size" value={String(draft.fileSize)} mono />
        <Cell label="0x10 rows" value={String(draft.effectProjectCount)} mono />
        <Cell label="0x14 cmds" value={String(draft.commandsCount)} mono />
        <Cell label="0x18 row" value={`0x${draft.eachEffectProjectSize.toString(16)}`} mono />
      </div>
    </div>
  );
}
