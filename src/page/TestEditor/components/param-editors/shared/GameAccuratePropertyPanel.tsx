import { useMemo } from "react";
import { formatHash } from "@/models/commandTable";
import { PropertyGroup } from "./PropertyGroup";
import { PropertyField } from "./PropertyField";
import type { PropertyFieldDef, PropertyGroupDef } from "./types";
import type {
  TypedParamEntry,
  TypedFieldValue,
} from "../../param-editor/typedParamTypes";

export interface ComputedValue {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  tooltip?: string;
}

export interface ComputedSection {
  label: string;
  values: ComputedValue[];
  defaultOpen?: boolean;
}

interface GameAccuratePropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: Array<Record<string, number>>;
  onFieldChange: (key: string, value: number | string) => void;
  groups: PropertyGroupDef[];
  computedSections?: ComputedSection[];
}

export function GameAccuratePropertyPanel({
  entry,
  fieldSpecs,
  onFieldChange,
  groups,
  computedSections,
}: GameAccuratePropertyPanelProps) {
  const entryId =
    typeof entry.entryId === "number" ? (entry.entryId as number) : 0;

  const visibleGroups = useMemo(
    () => groups.filter((g) => !g.visible || g.visible(entry)),
    [groups, entry],
  );

  // Scroll is owned by the parent panel shell (min-h-0 + overflow-y-auto).
  // Do not put overflow-y-auto here alone — without a height cap it grows and never scrolls.
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/15 px-3 py-1.5">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
          Entry ID
        </span>
        <span className="font-mono text-[11px] tabular-nums font-semibold tracking-tight">
          {formatHash(entryId)}
        </span>
      </div>

      {computedSections && computedSections.length > 0 && (
        <>
          {computedSections.map((section) => (
            <PropertyGroup
              key={section.label}
              label={section.label}
              defaultOpen={section.defaultOpen ?? true}
              className="border-primary/20 bg-primary/[0.04]"
            >
              {section.values.map((cv) => (
                <div
                  key={cv.label}
                  className="flex items-center justify-between gap-2"
                  title={cv.tooltip}
                >
                  <span className="min-w-0 shrink-0 text-[11px] text-muted-foreground">
                    {cv.label}
                    {cv.unit && (
                      <span className="ml-1 text-[9px] text-muted-foreground/60">
                        ({cv.unit})
                      </span>
                    )}
                  </span>
                  <span
                    className="font-mono text-[11px] font-medium tabular-nums"
                    style={cv.color ? { color: cv.color } : undefined}
                  >
                    {typeof cv.value === "number"
                      ? Number.isInteger(cv.value)
                        ? cv.value
                        : cv.value.toFixed(4)
                      : cv.value}
                  </span>
                </div>
              ))}
            </PropertyGroup>
          ))}
        </>
      )}

      {visibleGroups.map((group) => (
        <PropertyGroup key={group.id} label={group.label}>
          {group.fields.map((def) => (
            <PropertyField
              key={def.key}
              def={def}
              value={entry[def.key] ?? 0}
              onChange={(key, value) => {
                onFieldChange(key, value);
              }}
            />
          ))}
        </PropertyGroup>
      ))}
    </div>
  );
}
