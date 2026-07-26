import type { ReactNode } from "react";

type MotionReportCardProps = {
  title: string;
  rows?: string[];
  warnings?: string[];
  children?: ReactNode;
};

/**
 * Shared result card for motion panel operations (export/import/clip tools).
 * One container shape so every report reads the same way.
 */
export function MotionReportCard({
  title,
  rows = [],
  warnings = [],
  children,
}: MotionReportCardProps) {
  return (
    <div className="rounded-sm border border-border/60 bg-muted/30 px-2 py-1.5">
      <div className="font-medium tabular-nums">{title}</div>
      {rows.map((row) => (
        <div key={row} className="font-mono text-muted-foreground wrap-anywhere">
          {row}
        </div>
      ))}
      {children}
      {warnings.map((warning) => (
        <div key={warning} className="mt-1 text-amber-700 dark:text-amber-400 wrap-anywhere">
          {warning}
        </div>
      ))}
    </div>
  );
}
