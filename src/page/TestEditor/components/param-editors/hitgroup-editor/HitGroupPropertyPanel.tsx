import { AutoPropertyPanel } from "../shared/AutoPropertyPanel";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

interface HitGroupPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  onFieldChange: (key: string, value: number) => void;
}

const HITGROUP_GROUPS: Record<string, string[]> = {
  "Collision Body": [
    "hitType",
    "radius",
    "offsetX",
    "offsetY",
    "offsetZ",
    "scaleX",
    "scaleY",
    "scaleZ",
    "jointOffset",
    "groupId",
  ],
  Bones: ["boneHash", "parentBoneHash"],
  State: ["enableState", "collisionFlags", "modelHash"],
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
