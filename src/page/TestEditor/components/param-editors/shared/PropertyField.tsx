import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { formatHash } from "@/models/commandTable";
import type { PropertyFieldDef } from "./types";

interface PropertyFieldProps {
  def: PropertyFieldDef;
  value: number | string | boolean | null;
  onChange: (key: string, value: number) => void;
}

export function PropertyField({ def, value, onChange }: PropertyFieldProps) {
  const numValue = typeof value === "number" ? value : 0;

  const handleNumberChange = useCallback(
    (raw: string) => {
      const parsed =
        def.type === "f32" ? parseFloat(raw) : parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return;
      onChange(def.key, parsed);
    },
    [def, onChange],
  );

  if (def.type === "enum" && def.enumOptions) {
    return (
      <div className="flex items-center justify-between gap-2">
        <label className="min-w-0 shrink-0 text-[11px] text-muted-foreground">
          {def.label}
        </label>
        <Select
          value={String(numValue)}
          onValueChange={(v) => onChange(def.key, parseInt(v, 10))}
        >
          <SelectTrigger className="h-7 w-40 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {def.enumOptions.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (def.type === "bool") {
    return (
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-muted-foreground">
          {def.label}
        </label>
        <Checkbox
          checked={numValue !== 0}
          onCheckedChange={(checked) => onChange(def.key, checked ? 1 : 0)}
        />
      </div>
    );
  }

  if (def.type === "hash") {
    return (
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-muted-foreground">
          {def.label}
        </label>
        <span className="font-mono text-[11px]">{formatHash(numValue)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <label className="min-w-0 shrink-0 text-[11px] text-muted-foreground">
        {def.label}
        {def.unit && (
          <span className="ml-1 text-[9px] text-muted-foreground/60">
            ({def.unit})
          </span>
        )}
      </label>
      <Input
        type="number"
        className="h-7 w-28 text-right font-mono text-[11px]"
        value={def.type === "f32" ? numValue.toFixed(4) : numValue}
        step={def.step ?? (def.type === "f32" ? 0.01 : 1)}
        min={def.min}
        max={def.max}
        onChange={(e) => handleNumberChange(e.target.value)}
      />
    </div>
  );
}
