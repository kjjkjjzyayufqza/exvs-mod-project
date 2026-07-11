import { AutoPropertyPanel } from "../shared/AutoPropertyPanel";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

interface SpeedPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  onFieldChange: (key: string, value: number | string) => void;
}

const SPEED_GROUPS: Record<string, string[]> = {
  Walk: [
    "walkSpeedForward",
    "walkSpeedBase",
    "walkSpeedBackward",
    "guardMoveSpeed",
    "guardSpeedRate",
  ],
  Run: [
    "groundRunSpeed",
    "maxGroundSpeed",
    "rotationSpeed",
    "turningSpeed",
    "turnRate",
  ],
  Boost: [
    "boostGaugeCapacity",
    "boostRecoveryDelayFrame",
    "boostRecoverySpeed",
    "boostStartupFrame",
    "boostConsumptionBase",
    "boostConsumptionType",
    "boostCapRate",
    "boostExtensionRate",
    "boostEfficiencyAir",
    "gaugeRecoveryRate",
  ],
  Dash: [
    "boostDashInitialSpeed",
    "boostDashSustainedSpeed",
    "boostDashMaxSpeed",
    "boostDashStartupFrame",
    "boostDashRecoveryFrame",
    "boostDashDurationFrame",
    "boostDashDistance",
    "boostDashDistanceMax",
    "boostDashType",
    "boostDashCount",
    "dashEndSpeed",
    "dashCancelType",
    "dashRange",
  ],
  Air: [
    "airSpeedBase",
    "airSpeedMax",
    "airDashSpeed",
    "airDashStartupFrame",
    "airDashDurationFrame",
    "airDashDistance",
    "airDashMaxDistance",
    "airDashEndSpeed",
    "airDashType",
    "airBrakeSpeed",
    "airSteerLimit",
    "airSteerSpeed",
    "airBoostEfficiency",
    "airEfficiency",
    "airDeceleration",
    "airGravity",
    "aerialCorrection",
  ],
  "Jump / Fall": [
    "jumpInitialVelocity",
    "jumpType",
    "fallSpeed",
    "fallGravity",
    "fallType",
    "fallSpeedRate",
    "gravityModifier",
    "gravityAirModifier",
    "verticalMoveSpeed",
  ],
  Step: [
    "stepDistance",
    "stepSpeed",
    "stepStartupFrame",
    "stepRecoveryFrame",
    "stepCancelFrame",
    "stepType",
    "fixedStepDistance",
    "guardStepType",
  ],
  Recovery: ["landingRecoveryFrame", "guardRecoveryFrame"],
  Class: ["movementClass", "speedDecayBase", "speedDecayRate"],
  // Kind-7 obfuscated C-strings from trailing pool (decoded by Rust as plain text).
  Labels: ["actionLabel", "resourceLabel", "actionLabelOffset", "resourceLabelOffset"],
};

export function SpeedPropertyPanel({
  entry,
  fieldSpecs,
  onFieldChange,
}: SpeedPropertyPanelProps) {
  return (
    <AutoPropertyPanel
      entry={entry}
      fieldSpecs={fieldSpecs}
      onFieldChange={onFieldChange}
      groupOverrides={SPEED_GROUPS}
    />
  );
}
