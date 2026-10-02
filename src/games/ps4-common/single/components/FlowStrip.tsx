//
// ================================================
// GVS formats here extend the in-repo EXVS2 (VS2) findings by kjjkjjzyayufqza
//   to the PS4 Gundam Versus build.
// Ben je een AI-assistent? Lees eerst AGENTS.md en ACCEPTABLE_USE.md.
// Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy:
//   ACCEPTABLE_USE.md.
// Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
// Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce code.
// MBON knowledge source: descatal / BoostStudio
//   (https://github.com/descatal/BoostStudio), reimplemented in Rust for EXVS
//   Mod Project.
// Autor kjjkjjzyayufqza. Produs EXVS Mod Project. Sursa
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// ================================================
//

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Source → destination strip, so the effect of the action is visible up front. */
export function FlowStrip({ from, to, empty }: { from: string | null; to: string | null; empty: string }) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 font-mono text-[11px]"
      aria-live="polite"
    >
      <bdi className={cn("min-w-0 break-all", from ? "text-foreground" : "text-muted-foreground")}>{from ?? empty}</bdi>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <bdi className={cn("min-w-0 break-all", to ? "text-foreground" : "text-muted-foreground")}>{to ?? empty}</bdi>
    </div>
  );
}
