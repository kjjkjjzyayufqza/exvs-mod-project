import { AutoPropertyPanel } from "../shared/AutoPropertyPanel";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

interface DepictionPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  onFieldChange: (key: string, value: number) => void;
}

const DEPICTION_GROUPS: Record<string, string[]> = {
  Visual: [
    "depictionType",
    "renderMode",
    "scale",
    "zOffset",
    "trailLength",
  ],
  "Model & Effects": [
    "modelHash",
    "mainEffectHash",
    "subEffectHash",
    "trailEffectHash",
    "spawnEffectHash",
    "destroyEffectHash",
    "materialHash",
    "soundEffectHash",
  ],
  Flags: ["hasHitEffect", "behaviorFlags"],
};

export function DepictionPropertyPanel({
  entry,
  fieldSpecs,
  onFieldChange,
}: DepictionPropertyPanelProps) {
  return (
    <AutoPropertyPanel
      entry={entry}
      fieldSpecs={fieldSpecs}
      onFieldChange={onFieldChange}
      groupOverrides={DEPICTION_GROUPS}
    />
  );
}
