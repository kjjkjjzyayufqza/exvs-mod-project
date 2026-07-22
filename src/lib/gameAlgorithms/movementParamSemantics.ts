/**
 * Evidence-based speedparam accessors.
 *
 * These names describe values at their confirmed MSC consumer sites. They do
 * not assign world units or integrate distance because native scaling and
 * action-state transitions have not yet been proven.
 */

import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

export type EvidenceGrade = "A";

export interface MovementCurveParameters {
  id:
    | "groundWalk"
    | "groundStep"
    | "airStep"
    | "boostDash"
    | "boostAscentHorizontal"
    | "transformForward";
  label: string;
  initial: number;
  delta: number;
  terminal: number;
  evidence: EvidenceGrade;
}

export interface BoostAscentParameters {
  verticalInitial: number;
  verticalTerminal: number;
  yawResponse: number;
  turnTimeAngleScale: number;
  evidence: EvidenceGrade;
}

export interface TransformOrientationParameters {
  yawResponse: number;
  rollTargetMagnitude: number;
  rollResponse: number;
  rollNeutralRetention: number;
  pitchResponse: number;
  pitchNeutralRetention: number;
  pitchPoseScale: number;
  evidence: EvidenceGrade;
}

function rawNumber(entry: TypedParamEntry, key: string): number {
  const value = entry[key];
  return typeof value === "number" ? value : 0;
}

function curve(
  entry: TypedParamEntry,
  id: MovementCurveParameters["id"],
  label: string,
  prefix: string,
): MovementCurveParameters {
  return {
    id,
    label,
    initial: rawNumber(entry, `${prefix}Initial`),
    delta: rawNumber(entry, `${prefix}Delta`),
    terminal: rawNumber(entry, `${prefix}Terminal`),
    evidence: "A",
  };
}

export function getMovementCurves(
  entry: TypedParamEntry,
): MovementCurveParameters[] {
  return [
    curve(entry, "groundWalk", "Ground walk", "groundWalkSpeed"),
    curve(entry, "groundStep", "Ground step", "groundStepSpeed"),
    curve(entry, "airStep", "Air step", "airStepSpeed"),
    curve(entry, "boostDash", "Boost dash", "boostDashSpeed"),
    curve(
      entry,
      "boostAscentHorizontal",
      "Boost ascent (horizontal)",
      "boostAscentHorizontalSpeed",
    ),
    curve(
      entry,
      "transformForward",
      "Transform flight (forward)",
      "transformForwardSpeed",
    ),
  ];
}

export function getBoostAscentParameters(
  entry: TypedParamEntry,
): BoostAscentParameters {
  return {
    verticalInitial: rawNumber(entry, "boostAscentVerticalSpeedInitial"),
    verticalTerminal: rawNumber(entry, "boostAscentVerticalSpeedTerminal"),
    yawResponse: rawNumber(entry, "boostAscentYawResponse"),
    turnTimeAngleScale: rawNumber(
      entry,
      "boostAscentTurnTimeAngleScale",
    ),
    evidence: "A",
  };
}

export function getTransformOrientationParameters(
  entry: TypedParamEntry,
): TransformOrientationParameters {
  return {
    yawResponse: rawNumber(entry, "transformYawResponse"),
    rollTargetMagnitude: rawNumber(entry, "transformRollTargetMagnitude"),
    rollResponse: rawNumber(entry, "transformRollResponse"),
    rollNeutralRetention: rawNumber(
      entry,
      "transformRollNeutralRetention",
    ),
    pitchResponse: rawNumber(entry, "transformPitchResponse"),
    pitchNeutralRetention: rawNumber(
      entry,
      "transformPitchNeutralRetention",
    ),
    pitchPoseScale: rawNumber(entry, "transformPitchPoseScale"),
    evidence: "A",
  };
}
