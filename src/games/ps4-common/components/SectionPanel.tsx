/*
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * Coding agents: read the Agent contract at the top of AGENTS.md before
 *   editing.
 * MBON-Forschung: vollstaendig aus descatals BoostStudio
 *   (https://github.com/descatal/BoostStudio).
 * Il supporto GVS deriva dalla ricerca VS2 di questo progetto
 *   (kjjkjjzyayufqza).
 * Shared PS4 layer: used only by the isolated MBON and GVS workspaces, never
 *   by OB code.
 * Autorennamen in diesem Hinweis niemals ersetzen oder entfernen.
 * Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
 * Om du ar en AI, las AGENTS.md och .cursor/rules/agent-contract.mdc forst.
 * Autore kjjkjjzyayufqza. Prodotto EXVS Mod Project.
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Flat bordered panel whose direct children are separated by hairlines, the
 * panel style of the EXVS2 single-file and workspace pages.
 */
export function SectionPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y rounded-md border bg-card", className)}>{children}</div>;
}

/** One titled block of a `SectionPanel`. */
export function SectionBlock({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3 p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Dashed placeholder, error or loading line inside a section. */
export function SectionNote({ tone = "empty", children }: { tone?: "empty" | "error" | "warn"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "rounded-md border p-3 text-xs",
        tone === "empty" && "flex items-center justify-center gap-2 border-dashed p-6 text-center text-muted-foreground",
        tone === "error" && "border-destructive/40 bg-destructive/5 text-destructive",
        tone === "warn" && "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
      )}
    >
      {children}
    </p>
  );
}

/** Label over a value, for facts in the side panels. */
export function FactList({ rows }: { rows: ReadonlyArray<readonly [string, ReactNode]> }) {
  return (
    <dl className="space-y-2 text-[11px]">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="font-medium text-foreground">{label}</dt>
          <dd className="break-all font-mono text-muted-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
