import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SsbhDaeUpAxis } from "../dae-import/daeImportTypes";
import {
  DaeImportFieldRow,
  DaeImportSection,
  daeImportModalSelectContentClass,
} from "../dae-import/daeImportUi";
import { cn } from "@/lib/utils";

export interface HktCollisionTransformValue {
  scaleFactor: number;
  upAxis: SsbhDaeUpAxis;
}

interface HktCollisionTransformFieldsProps {
  value: HktCollisionTransformValue;
  onChange: (next: HktCollisionTransformValue) => void;
  compact?: boolean;
  disabled?: boolean;
}

/** Returns a positive scale when the text is a complete number; null while empty or mid-edit. */
export function parseCommittedScaleFactor(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === "." || trimmed === "-" || trimmed === "+") {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function HktCollisionTransformFields({
  value,
  onChange,
  compact = false,
  disabled = false,
}: HktCollisionTransformFieldsProps) {
  const [scaleFactorText, setScaleFactorText] = useState(() => String(value.scaleFactor));

  useEffect(() => {
    setScaleFactorText(String(value.scaleFactor));
  }, [value.scaleFactor]);

  const compactFieldRowClass = compact
    ? "grid-cols-1 items-start gap-1.5 py-2 [&>div:last-child]:w-full"
    : undefined;

  const commitScaleOnBlur = () => {
    const committed = parseCommittedScaleFactor(scaleFactorText);
    if (committed !== null) {
      setScaleFactorText(String(committed));
      if (committed !== value.scaleFactor) {
        onChange({ ...value, scaleFactor: committed });
      }
      return;
    }
    const fallback = value.scaleFactor > 0 ? value.scaleFactor : 1;
    setScaleFactorText(String(fallback));
    if (fallback !== value.scaleFactor) {
      onChange({ ...value, scaleFactor: fallback });
    }
  };

  return (
    <DaeImportSection title={compact ? "Transform" : "Collision Transform"} compact={compact}>
      <DaeImportFieldRow
        label="Scale Factor"
        hint="Uniform scale applied to source geometry before building collision"
        className={compactFieldRowClass}
      >
        <Input
          className="h-8 text-[11px]"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          value={scaleFactorText}
          onChange={(e) => {
            const nextText = e.target.value;
            setScaleFactorText(nextText);
            const committed = parseCommittedScaleFactor(nextText);
            if (committed !== null && committed !== value.scaleFactor) {
              onChange({ ...value, scaleFactor: committed });
            }
          }}
          onBlur={commitScaleOnBlur}
        />
      </DaeImportFieldRow>
      <DaeImportFieldRow
        label="Up Axis"
        hint="Axis conversion from the source model into collision space"
        className={compactFieldRowClass}
      >
        <Select
          value={value.upAxis}
          disabled={disabled}
          onValueChange={(next) => onChange({ ...value, upAxis: next as SsbhDaeUpAxis })}
        >
          <SelectTrigger className={cn("h-8 text-[11px]", compact && "w-full")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={daeImportModalSelectContentClass}>
            <SelectItem value="y_up" className="text-[11px]">
              Y-Up
            </SelectItem>
            <SelectItem value="z_up" className="text-[11px]">
              Z-Up
            </SelectItem>
            <SelectItem value="none" className="text-[11px]">
              No Conversion
            </SelectItem>
          </SelectContent>
        </Select>
      </DaeImportFieldRow>
    </DaeImportSection>
  );
}
