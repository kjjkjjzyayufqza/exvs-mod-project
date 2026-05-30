import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export const daeImportSectionTitleClass =
  "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";

export function DaeImportSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-border last:border-b-0", className)}>
      <div className="border-b border-border/60 bg-muted/30 px-4 py-2">
        <p className={daeImportSectionTitleClass}>{title}</p>
      </div>
      <div>{children}</div>
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
          <p className="truncate text-[9px] leading-tight text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <div className="min-w-0 justify-self-stretch">{children}</div>
    </div>
  );
}

export function DaeImportBoolField({
  label,
  hint,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <DaeImportFieldRow label={label} hint={hint}>
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
}: {
  tone: "info" | "warning" | "error";
  children: ReactNode;
  className?: string;
}) {
  const toneClass =
    tone === "error"
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
        : "border-border bg-muted/40 text-foreground";

  return (
    <Alert className={cn("mx-4 my-2 rounded-md px-3 py-2 text-[11px]", toneClass, className)}>
      <AlertDescription className="text-[11px] leading-snug [&_p]:leading-snug">
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
