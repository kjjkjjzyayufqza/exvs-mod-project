import { AutoPropertyPanel } from "../shared/AutoPropertyPanel";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

interface HitGroupPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  onFieldChange: (key: string, value: number) => void;
}

// Field grouping per the binary-proven schema (docs/hitbox-research/02):
// a row is one sphere in bone space, linked to interactionid by a foreign key.
const HITGROUP_GROUPS: Record<string, string[]> = {
  Sphere: [
    "sphereRadius",
    "centerX",
    "centerY",
    "centerZ",
    "shapeMode",
  ],
  Linkage: ["interactionId", "boneId", "modelHash"],
  Classification: ["collisionFlags", "hitType"],
  "Unused (engine never reads)": [
    "unused3284a82d",
    "unused42ee5ca2",
    "unused458398bb",
    "unusedAce03d8e",
    "unusedDbe70d18",
  ],
};

export function HitGroupPropertyPanel({
  entry,
  fieldSpecs,
  onFieldChange,
}: HitGroupPropertyPanelProps) {
  return (
    <AutoPropertyPanel
      entry={entry}
      fieldSpecs={fieldSpecs}
      onFieldChange={onFieldChange}
      groupOverrides={HITGROUP_GROUPS}
    />
  );
}
