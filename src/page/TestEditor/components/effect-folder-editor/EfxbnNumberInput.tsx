import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function formatEfxbnNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6)));
}

/** Commits on blur or Enter, so a half-typed "-" or "0." never reaches the document. */
export function EfxbnNumberInput({
  value,
  integral,
  disabled,
  onCommit,
  className,
  ariaLabel,
}: {
  value: number;
  integral: boolean;
  disabled?: boolean;
  onCommit: (next: number) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? formatEfxbnNumber(value);

  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) return;
    const next = integral ? Math.round(parsed) : parsed;
    if (next !== value) onCommit(next);
  };

  return (
    <Input
      value={text}
      disabled={disabled}
      aria-label={ariaLabel}
      inputMode={integral ? "numeric" : "decimal"}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
      className={cn("h-6 px-1.5 text-right font-mono text-[10px]", className)}
    />
  );
}
