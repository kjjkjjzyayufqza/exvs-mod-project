import { AutoPropertyPanel } from "../shared/AutoPropertyPanel";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

interface GrapPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  onFieldChange: (key: string, value: number) => void;
}

const GRAP_GROUPS: Record<string, string[]> = {
  Damage: ["damage", "damage2nd", "damageLast", "correctionPct"],
  Timing: [
    "startupFrame",
    "trackingFrame",
    "grapTotalFrame",
    "cancelFrame",
    "recoveryFrame",
  ],
  Properties: [
    "downValue",
    "downValueLast",
    "stunValue",
    "reach",
    "grapPriority",
    "isMultiHit",
  ],
};

export function GrapPropertyPanel({
  entry,
  fieldSpecs,
  onFieldChange,
}: GrapPropertyPanelProps) {
  return (
    <AutoPropertyPanel
      entry={entry}
      fieldSpecs={fieldSpecs}
      onFieldChange={onFieldChange}
      groupOverrides={GRAP_GROUPS}
    />
  );
}
