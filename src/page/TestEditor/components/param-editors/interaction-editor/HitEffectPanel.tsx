import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import {
  classifyHitEffect,
  type HitEffectCategory,
} from "@/lib/gameAlgorithms";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

interface HitEffectPanelProps {
  entry: TypedParamEntry;
  /**
   * Whether any hitgroupiddef row's interactionId FK points at this entry.
   * Undefined when the hitgroupiddef table is not loaded alongside — the
   * classifier then avoids over-committing to the electric-follow-up verdict.
   */
  hasHitVolume?: boolean;
}

// Effect-taxonomy source of truth: docs/hitbox-research/03-hit-effect-taxonomy.md.
const CATEGORY_BADGE: Record<HitEffectCategory, string> = {
  "normal-hit": "border-sky-500/40 bg-sky-500/10 text-sky-300",
  "forced-knockdown": "border-amber-500/40 bg-amber-500/10 text-amber-300",
  stun: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  grab: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  "timed-state": "border-violet-500/40 bg-violet-500/10 text-violet-300",
  "neutral-followup": "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

export function HitEffectPanel({ entry, hasHitVolume }: HitEffectPanelProps) {
  const result = useMemo(
    () => classifyHitEffect(entry, hasHitVolume),
    [entry, hasHitVolume],
  );

  return (
    <div className="space-y-2 border-b bg-muted/10 p-3">
      <div className="flex items-center gap-2">
        <span
          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${CATEGORY_BADGE[result.category]}`}
        >
          {result.label}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {result.basis === "reaction-id"
            ? "reaction id (func_629)"
            : "derived from fields"}
        </span>
      </div>

      {result.automataDependent && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
          <span className="text-[10px] leading-snug text-amber-200/90">
            Grab state entry is this data field, but the hold is gated on the attacker —
            a full grab needs a matching attacker automata (Sticker / projectile).
          </span>
        </div>
      )}

      <div className="space-y-1">
        {result.facts.map((fact) => (
          <div key={fact.key} className="flex items-baseline justify-between gap-2">
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {fact.label}
              {!fact.proven && (
                <span className="ml-1 text-[9px] text-amber-400/70">?</span>
              )}
            </span>
            <span className="min-w-0 text-right font-mono text-[11px]">
              {fact.value}
              {fact.note && (
                <span className="ml-1 font-sans text-[9px] text-muted-foreground">
                  {fact.note}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {result.notes.length > 0 && (
        <ul className="space-y-0.5 border-t pt-1.5">
          {result.notes.map((note, i) => (
            <li key={i} className="text-[9px] leading-snug text-muted-foreground">
              • {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
