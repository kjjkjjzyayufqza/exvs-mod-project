import { AutoPropertyPanel } from "../shared/AutoPropertyPanel";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

interface InteractionPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  onFieldChange: (key: string, value: number) => void;
}

const INTERACTION_GROUPS: Record<string, string[]> = {
  Damage: ["damage", "damageRate", "correctionPct"],
  Knockback: [
    "knockbackForce",
    "knockbackDistance",
    "knockbackType",
    "groundBounce",
  ],
  Stun: ["stunValue", "stunFrame", "hitstopFrame"],
  Down: ["downValue", "hitLevel", "canTech", "untechableFrame"],
  Guard: ["guardType", "guardBreakLevel", "blockLevel"],
  Properties: [
    "interactType",
    "interactId",
    "interactCategory",
    "interactRange",
    "priority",
    "attackProperty",
    "hitEffectId",
  ],
  References: [
    "interactTargetHash",
    "seHash",
    "unkBarrierHash",
    "guardInteractHash",
    "receiveMode",
    "slideType",
    "wallBounceType",
  ],
};

export function InteractionPropertyPanel({
  entry,
  fieldSpecs,
  onFieldChange,
}: InteractionPropertyPanelProps) {
  return (
    <AutoPropertyPanel
      entry={entry}
      fieldSpecs={fieldSpecs}
      onFieldChange={onFieldChange}
      groupOverrides={INTERACTION_GROUPS}
    />
  );
}
