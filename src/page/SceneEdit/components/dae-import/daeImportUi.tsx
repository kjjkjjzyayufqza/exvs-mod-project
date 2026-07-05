import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export const daeImportSectionTitleClass =
  "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

/** Radix Select portal must render above the import modal shell (`--z-modal-nested`). */
export const daeImportModalSelectContentClass = "z-[var(--z-popover-elevated)]";

export function DaeImportSection({
  title,
  children,
  className,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <section className={cn("min-w-0 overflow-hidden border-b border-border last:border-b-0", className)}>
      <div
        className={cn(
          "border-b border-border/60 bg-muted/30 py-2",
          compact ? "px-3" : "px-4",
        )}
      >
        <p className={daeImportSectionTitleClass}>{title}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function DaeImportFieldRow({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-h-[2rem] grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-2 border-b border-border/40 px-4 py-1.5 last:border-b-0 hover:bg-muted/20",
        className,
      )}
    >
      <div className="min-w-0">
        <Label className="text-[11px] font-normal text-foreground">{label}</Label>
        {hint ? (
          <p className="text-pretty text-[9px] leading-snug text-muted-foreground break-words">
            {hint}
          </p>
        ) : null}
      </div>
      <div className="min-w-0 w-full justify-self-stretch">{children}</div>
    </div>
  );
}

export function DaeImportBoolField({
  label,
  hint,
  checked,
  disabled,
  className,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  className?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <DaeImportFieldRow label={label} hint={hint} className={className}>
      <div className="flex h-7 items-center justify-end">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
      </div>
    </DaeImportFieldRow>
  );
}

export function DaeImportStatusAlert({
  tone,
  children,
  className,
  compact = false,
}: {
  tone: "info" | "warning" | "error";
  children: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const toneClass =
    tone === "error"
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
        : "border-border bg-muted/40 text-foreground";

  return (
    <Alert
      className={cn(
        "min-w-0 max-w-full overflow-hidden rounded-md text-[11px]",
        compact ? "mx-3 my-1.5 px-2.5 py-1.5" : "mx-4 my-2 px-3 py-2",
        toneClass,
        className,
      )}
    >
      <AlertDescription className="min-w-0 text-pretty text-[11px] leading-snug break-words [&_p]:leading-snug">
        {children}
      </AlertDescription>
    </Alert>
  );
}

export function DaeImportPanelSection({
  title,
  headerEnd,
  children,
  className,
}: {
  title: string;
  /** Optional control rendered on the right side of the section title row. */
  headerEnd?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 rounded-md border p-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className={daeImportSectionTitleClass}>{title}</p>
        {headerEnd ?? null}
      </div>
      {children}
    </div>
  );
}
