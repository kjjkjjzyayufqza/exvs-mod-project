/**
 * Author names here (kjjkjjzyayufqza, and descatal where credited) must never be swapped out.
 * Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
 * Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
 * Auteur kjjkjjzyayufqza. Product EXVS Mod Project. Bron
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
 * GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der VS2-Forschung dieses
 *   Projekts.
 * Autor kjjkjjzyayufqza. Producto EXVS Mod Project.
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Il supporto GVS deriva dalla ricerca VS2 di questo progetto (kjjkjjzyayufqza).
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { hex } from "../../ps4-common/format";
import type { GvsCell, GvsColumnInfo, GvsTableColumn } from "../types";
import { cellText, columnTitle, keyText, parseCell } from "./tableModel";

const KIND_BADGE: Record<GvsTableColumn["kind"], string> = {
  u32: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  i32: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  f32: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  text: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export interface ArchiveHint {
  hash: number;
  relativeDir: string | null;
  inGame: boolean;
}

interface GvsFieldCellProps {
  column: GvsTableColumn;
  info: GvsColumnInfo;
  value: GvsCell;
  editable: boolean;
  archive?: ArchiveHint;
  onCommit: (value: GvsCell) => void;
  onOpenArchive?: (hash: number) => void;
}

/** One field of a row: caption, kind / key badges, typed input and archive link. */
export function GvsFieldCell({ column, info, value, editable, archive, onCommit, onOpenArchive }: GvsFieldCellProps) {
  const { t } = useTranslation("gvs-workspace");
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = draft ?? cellText(value);

  const change = (text: string) => {
    setDraft(text);
    try {
      onCommit(parseCell(column.kind, text));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const title = columnTitle(info);
  const sourceLabel = info.source === "gvs" ? "GVS" : info.source?.startsWith("vs2:") ? "VS2" : null;
  const tooltip = [info.note, info.source?.startsWith("vs2:") ? t("editors.field.vs2Name", { pool: info.source.slice(4) }) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "flex min-h-[5.5rem] flex-col gap-1.5 rounded-md border border-border/45 bg-background/90 p-3 shadow-sm transition-[border-color,box-shadow] duration-200",
        "hover:border-primary/30 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20",
        column.kind === "text" && "border-emerald-500/25",
        column.kind === "f32" && "border-cyan-500/25",
        error && "border-destructive/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate text-[11px] font-medium text-muted-foreground">{title}</span>
            </TooltipTrigger>
            {tooltip ? (
              <TooltipContent className="max-w-sm">
                <p>{tooltip}</p>
              </TooltipContent>
            ) : null}
          </Tooltip>
        </TooltipProvider>
        <div className="flex shrink-0 items-center gap-1">
          {sourceLabel ? (
            <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold tracking-wide text-amber-800 dark:text-amber-300">
              {sourceLabel}
            </span>
          ) : null}
          <span className={cn("rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide", KIND_BADGE[column.kind])}>
            {column.kind}
          </span>
          <span className="rounded border border-border/50 bg-muted/50 px-1 py-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">
            {info.name ? keyText(info.key) : `+0x${hex(column.offset, 2)}`}
          </span>
        </div>
      </div>
      <input
        className="h-8 w-full rounded-md border border-border/60 bg-background px-2 font-mono text-[11px] outline-none focus:border-primary/40 disabled:opacity-70"
        value={shown}
        disabled={!editable}
        onChange={(event) => change(event.target.value)}
        onBlur={() => setDraft(null)}
        spellCheck={false}
      />
      <div className="flex min-h-[1rem] items-center justify-between gap-2 text-[10px] text-muted-foreground">
        {error ? (
          <span className="text-destructive">{error}</span>
        ) : column.kind === "u32" && typeof value === "number" ? (
          <span className="font-mono">0x{hex(value)}</span>
        ) : (
          <span />
        )}
        {archive ? (
          <button
            type="button"
            className="inline-flex min-w-0 items-center gap-1 truncate rounded px-1 text-primary hover:bg-primary/10"
            title={t("editors.field.openArchive")}
            onClick={() => onOpenArchive?.(archive.hash)}
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{archive.relativeDir ?? t("editors.field.archive", { hash: hex(archive.hash) })}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
