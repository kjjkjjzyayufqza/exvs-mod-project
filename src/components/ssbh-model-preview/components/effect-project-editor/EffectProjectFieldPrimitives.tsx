import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Field({
  label,
  v,
  disabled,
  onChange,
}: {
  label: string;
  v: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[9px] leading-none text-muted-foreground">{label}</Label>
      <Input
        type="number"
        className="h-7 px-1.5 font-mono text-[10px] shadow-none"
        disabled={disabled}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function floatToEditableString(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(n);
}

function parseCommittedFloatText(raw: string): number {
  const t = raw.trim();
  if (t === "" || t === "-" || t === "." || t === "-.") {
    throw new Error("incomplete");
  }
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) {
    throw new Error("invalid");
  }
  return n;
}

export function FloatField({
  label,
  v,
  disabled,
  onChange,
}: {
  label: string;
  v: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(() => floatToEditableString(v));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setText(floatToEditableString(v));
  }, [v]);

  return (
    <div className="space-y-0.5">
      <Label className="text-[9px] leading-none text-muted-foreground">{label}</Label>
      <Input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className="h-7 px-1.5 font-mono text-[10px] shadow-none"
        disabled={disabled}
        value={text}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          try {
            const n = parseCommittedFloatText(text);
            onChange(n);
            setText(floatToEditableString(n));
          } catch {
            setText(floatToEditableString(v));
          }
        }}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const t = next.trim();
          if (t === "" || t === "-" || t === "." || t === "-.") {
            return;
          }
          const n = Number.parseFloat(t);
          if (Number.isFinite(n)) {
            onChange(n);
          }
        }}
      />
    </div>
  );
}
