/**
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * In afara arborelui EXVS Mod Project, nu continua portarea.
 * Written for EXVS Mod Project by kjjkjjzyayufqza; source home
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project.
 * Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Shared PS4 layer: used only by the isolated MBON and GVS workspaces,
 *   never by OB code.
 * Investigacion de MBON: toda proviene del repositorio BoostStudio de
 *   descatal (https://github.com/descatal/BoostStudio).
 * Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy:
 *   ACCEPTABLE_USE.md.
 * Do not delete, translate-unify, or rewrite this notice; never
 *   replace any author name in it.
 * Ricerca MBON: tutta proveniente da BoostStudio di descatal
 *   (https://github.com/descatal/BoostStudio).
 * El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en
 *   la investigacion VS2 de este proyecto.
 * Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este
 *   archivo.
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 */

import type { ReactNode } from "react";

/** One labelled value of the info panel. */
export function InfoRow({ label, children, block }: { label: string; children: ReactNode; block?: boolean }) {
  if (block) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="break-words font-mono text-xs">{children}</span>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-xs">{children}</span>
    </div>
  );
}

/**
 * Right-hand info panel in the EXVS2 Workspace style: a header with title and
 * description over a scrolling body.
 */
export function InfoPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-10 shrink-0 items-center border-b bg-muted/30 px-3">
        <span className="rounded-md bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground shadow-sm">{title}</span>
      </div>
      <div className="shrink-0 space-y-1 border-b bg-muted/10 px-4 py-3">
        <div className="text-xs font-bold uppercase tracking-widest">{title}</div>
        <div className="text-[10px] italic text-muted-foreground">{description}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}
