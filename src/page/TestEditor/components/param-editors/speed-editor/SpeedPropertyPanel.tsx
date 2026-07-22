import { AutoPropertyPanel } from "../shared/AutoPropertyPanel";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

interface SpeedPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  onFieldChange: (key: string, value: number | string) => void;
}

const SPEED_GROUPS: Record<string, string[]> = {
  "Ground Walk": [
    "groundWalkEntrySpeed",
    "groundWalkSpeedInitial",
    "groundWalkSpeedDelta",
    "groundWalkSpeedTerminal",
    "groundWalkEntryTurnTimeBase",
    "groundWalkEntryTurnTimeAngleScale",
    "groundWalkYawResponse",
    "walkStopMotionRetention",
  ],
  "Boost Ascent": [
    "boostAscentVerticalSpeedInitial",
    "boostAscentVerticalSpeedTerminal",
    "boostAscentHorizontalSpeedInitial",
    "boostAscentHorizontalSpeedDelta",
    "boostAscentHorizontalSpeedTerminal",
    "boostAscentYawResponse",
    "boostAscentTurnTimeAngleScale",
  ],
  "Ground Step": [
    "groundStepSpeedInitial",
    "groundStepSpeedDelta",
    "groundStepSpeedTerminal",
    "groundStepPrimaryTimer",
    "groundStepSecondaryTimer",
  ],
  "Air Step": [
    "airStepSpeedInitial",
    "airStepSpeedDelta",
    "airStepSpeedTerminal",
    "airStepPrimaryTimer",
    "airStepSecondaryTimer",
  ],
  "Step Turning": [
    "stepTurnMidSpeedThreshold",
    "stepTurnMidSpeedAdjustment",
    "stepTurnHighSpeedThreshold",
    "stepTurnHighSpeedAdjustment",
  ],
  "Boost Dash": [
    "boostDashSpeedInitial",
    "boostDashSpeedDelta",
    "boostDashSpeedTerminal",
    "boostDashEntryTurnTimer",
    "boostDashLoopTimer",
    "boostDashYawResponse",
  ],
  "Transform Flight": [
    "transformForwardSpeedInitial",
    "transformForwardSpeedDelta",
    "transformForwardSpeedTerminal",
    "transformYawResponse",
    "transformRollTargetMagnitude",
    "transformRollResponse",
    "transformRollNeutralRetention",
    "transformPitchResponse",
    "transformPitchNeutralRetention",
    "transformPitchPoseScale",
  ],
  "Residual Air Drift": [
    "residualAirDriftSpeedDelta",
    "residualAirDriftSpeedCap",
  ],
  "Alternate Free Flight": [
    "alternateFreeFlightSpeedInitial",
    "alternateFreeFlightSpeedDelta",
  ],
  "Provisional / Unverified": [
    "walkSpeedForward",
    "walkSpeedBackward",
    "boostGaugeCapacity",
    "boostRecoverySpeed",
    "gravityModifier",
    "movementClass",
    "boostDashSustainedSpeed",
    "maxGroundSpeed",
    "airDashEndSpeed",
    "airDashDistance",
    "speedDecayBase",
    "boostConsumptionBase",
    "jumpType",
    "airGravity",
    "airDashMaxDistance",
    "guardRecoveryFrame",
    "dashEndSpeed",
    "fixedStepDistance",
    "airBoostEfficiency",
    "guardSpeedRate",
    "speedDecayRate",
    "airDeceleration",
    "boostDashCount",
  ],
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
