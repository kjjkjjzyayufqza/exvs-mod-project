import { AutoPropertyPanel } from "../shared/AutoPropertyPanel";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

interface InteractionPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  onFieldChange: (key: string, value: number) => void;
}

// Field grouping per the proven semantics in docs/hitbox-research/03-hit-effect-taxonomy.md.
// interactId (0x6A0CCB8A) = victim reaction id dispatched by MSC func_629 (407=stun,
// 500/501=bind); untechableFrame (0xFA03CBDA) = reaction-state duration (×100). These keep
// their pre-proof pool names but their proven roles drive this grouping.
const INTERACTION_GROUPS: Record<string, string[]> = {
  "Victim reaction (interact_id)": ["interactId", "untechableFrame"],
  Damage: [
    "damage",
    "damageRate",
    "correctionPct",
    "damageMultGate",
    "damageMultGate2",
  ],
  Knockback: [
    "knockbackType",
    "knockbackDistance",
    "knockbackDirModeA",
    "knockbackDirModeB",
    "groundBounce",
  ],
  "Hit Resolution": ["maxHitCount", "rehitInterval", "hitstopFrame", "hitLevel"],
  Down: ["downValue", "downAccumQuarter", "canTech"],
  "Screen shake (0x22C412CA/0x3626F732)": ["stunValue", "stunFrame"],
  Classification: [
    "interactionClass",
    "targetFilter",
    "visualEffectClass",
    "hitEffectId",
    "interactCategory",
    "victimGaugeAdd",
  ],
  References: [
    "interactTargetHash",
    "seHash",
    "unkBarrierHash",
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
