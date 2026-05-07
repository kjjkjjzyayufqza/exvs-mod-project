/**
 * Game-accurate movement physics system.
 * Derived from speedparam field analysis and movement state machine
 * functions in the 0x14037xxxx range of vsac27_Release.exe.
 *
 * The movement system uses movement_class as a tier selector.
 * Speed values are raw integers used directly as velocity/acceleration/duration
 * parameters in the game's physics loop at 60fps.
 */

import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

function field(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

export interface GroundMovement {
  walkSpeedForward: number;
  walkSpeedBackward: number;
  walkSpeedBase: number;
  groundRunSpeed: number;
  maxGroundSpeed: number;
  rotationSpeed: number;
  turningSpeed: number;
  guardMoveSpeed: number;
  guardSpeedRate: number;
}

export interface AirMovement {
  airSpeedBase: number;
  airSpeedMax: number;
  airDashSpeed: number;
  airDashDistance: number;
  airDashMaxDistance: number;
  airDashDurationFrame: number;
  airDashStartupFrame: number;
  airDashEndSpeed: number;
  airBrakeSpeed: number;
  airSteerSpeed: number;
  airSteerLimit: number;
  airDeceleration: number;
  airEfficiency: number;
  airBoostEfficiency: number;
  aerialCorrection: number;
}

export interface BoostSystem {
  boostGaugeCapacity: number;
  boostConsumptionBase: number;
  boostConsumptionType: number;
  boostRecoveryDelay: number;
  boostRecoverySpeed: number;
  boostStartupFrame: number;
  boostDashInitialSpeed: number;
  boostDashSustainedSpeed: number;
  boostDashMaxSpeed: number;
  boostDashDistance: number;
  boostDashDistanceMax: number;
  boostDashDurationFrame: number;
  boostDashStartupFrame: number;
  boostDashRecoveryFrame: number;
  boostDashCount: number;
  boostDashType: number;
  boostCapRate: number;
  boostExtensionRate: number;
  boostEfficiencyAir: number;
  gaugeRecoveryRate: number;
}

export interface StepSystem {
  stepDistance: number;
  fixedStepDistance: number;
  stepSpeed: number;
  stepStartupFrame: number;
  stepRecoveryFrame: number;
  stepCancelFrame: number;
  stepType: number;
  guardStepType: number;
}

export interface GravitySystem {
  gravityModifier: number;
  fallGravity: number;
  fallSpeed: number;
  fallSpeedRate: number;
  fallType: number;
  airGravity: number;
  gravityAirModifier: number;
  jumpInitialVelocity: number;
  jumpType: number;
  verticalMoveSpeed: number;
}

export interface MovementProfile {
  movementClass: number;
  dashCancelType: number;
  ground: GroundMovement;
  air: AirMovement;
  boost: BoostSystem;
  step: StepSystem;
  gravity: GravitySystem;
}

export function getGroundMovement(entry: TypedParamEntry): GroundMovement {
  return {
    walkSpeedForward: field(entry, "walkSpeedForward"),
    walkSpeedBackward: field(entry, "walkSpeedBackward"),
    walkSpeedBase: field(entry, "walkSpeedBase"),
    groundRunSpeed: field(entry, "groundRunSpeed"),
    maxGroundSpeed: field(entry, "maxGroundSpeed"),
    rotationSpeed: field(entry, "rotationSpeed"),
    turningSpeed: field(entry, "turningSpeed"),
    guardMoveSpeed: field(entry, "guardMoveSpeed"),
    guardSpeedRate: field(entry, "guardSpeedRate"),
  };
}

export function getAirMovement(entry: TypedParamEntry): AirMovement {
  return {
    airSpeedBase: field(entry, "airSpeedBase"),
    airSpeedMax: field(entry, "airSpeedMax"),
    airDashSpeed: field(entry, "airDashSpeed"),
    airDashDistance: field(entry, "airDashDistance"),
    airDashMaxDistance: field(entry, "airDashMaxDistance"),
    airDashDurationFrame: field(entry, "airDashDurationFrame"),
    airDashStartupFrame: field(entry, "airDashStartupFrame"),
    airDashEndSpeed: field(entry, "airDashEndSpeed"),
    airBrakeSpeed: field(entry, "airBrakeSpeed"),
    airSteerSpeed: field(entry, "airSteerSpeed"),
    airSteerLimit: field(entry, "airSteerLimit"),
    airDeceleration: field(entry, "airDeceleration"),
    airEfficiency: field(entry, "airEfficiency"),
    airBoostEfficiency: field(entry, "airBoostEfficiency"),
    aerialCorrection: field(entry, "aerialCorrection"),
  };
}

export function getBoostSystem(entry: TypedParamEntry): BoostSystem {
  return {
    boostGaugeCapacity: field(entry, "boostGaugeCapacity"),
    boostConsumptionBase: field(entry, "boostConsumptionBase"),
    boostConsumptionType: field(entry, "boostConsumptionType"),
    boostRecoveryDelay: field(entry, "boostRecoveryDelayFrame"),
    boostRecoverySpeed: field(entry, "boostRecoverySpeed"),
    boostStartupFrame: field(entry, "boostStartupFrame"),
    boostDashInitialSpeed: field(entry, "boostDashInitialSpeed"),
    boostDashSustainedSpeed: field(entry, "boostDashSustainedSpeed"),
    boostDashMaxSpeed: field(entry, "boostDashMaxSpeed"),
    boostDashDistance: field(entry, "boostDashDistance"),
    boostDashDistanceMax: field(entry, "boostDashDistanceMax"),
    boostDashDurationFrame: field(entry, "boostDashDurationFrame"),
    boostDashStartupFrame: field(entry, "boostDashStartupFrame"),
    boostDashRecoveryFrame: field(entry, "boostDashRecoveryFrame"),
    boostDashCount: field(entry, "boostDashCount"),
    boostDashType: field(entry, "boostDashType"),
    boostCapRate: field(entry, "boostCapRate"),
    boostExtensionRate: field(entry, "boostExtensionRate"),
    boostEfficiencyAir: field(entry, "boostEfficiencyAir"),
    gaugeRecoveryRate: field(entry, "gaugeRecoveryRate"),
  };
}

export function getStepSystem(entry: TypedParamEntry): StepSystem {
  return {
    stepDistance: field(entry, "stepDistance"),
    fixedStepDistance: field(entry, "fixedStepDistance"),
    stepSpeed: field(entry, "stepSpeed"),
    stepStartupFrame: field(entry, "stepStartupFrame"),
    stepRecoveryFrame: field(entry, "stepRecoveryFrame"),
    stepCancelFrame: field(entry, "stepCancelFrame"),
    stepType: field(entry, "stepType"),
    guardStepType: field(entry, "guardStepType"),
  };
}

export function getGravitySystem(entry: TypedParamEntry): GravitySystem {
  return {
    gravityModifier: field(entry, "gravityModifier"),
    fallGravity: field(entry, "fallGravity"),
    fallSpeed: field(entry, "fallSpeed"),
    fallSpeedRate: field(entry, "fallSpeedRate"),
    fallType: field(entry, "fallType"),
    airGravity: field(entry, "airGravity"),
    gravityAirModifier: field(entry, "gravityAirModifier"),
    jumpInitialVelocity: field(entry, "jumpInitialVelocity"),
    jumpType: field(entry, "jumpType"),
    verticalMoveSpeed: field(entry, "verticalMoveSpeed"),
  };
}

export function getMovementProfile(entry: TypedParamEntry): MovementProfile {
  return {
    movementClass: field(entry, "movementClass"),
    dashCancelType: field(entry, "dashCancelType"),
    ground: getGroundMovement(entry),
    air: getAirMovement(entry),
    boost: getBoostSystem(entry),
    step: getStepSystem(entry),
    gravity: getGravitySystem(entry),
  };
}

export const MOVEMENT_CLASS_LABELS: Record<number, string> = {
  0: "Lightweight",
  1: "Standard",
  2: "Heavy",
  3: "Super Heavy",
};

export const DASH_CANCEL_TYPE_LABELS: Record<number, string> = {
  0: "None",
  1: "Standard cancel",
  2: "Step cancel",
};

export const BOOST_DASH_TYPE_LABELS: Record<number, string> = {
  0: "Standard dash",
  1: "Sliding dash",
  2: "Hover dash",
};

export const STEP_TYPE_LABELS: Record<number, string> = {
  0: "Standard step",
  1: "Long step",
  2: "Short step",
};

export const JUMP_TYPE_LABELS: Record<number, string> = {
  0: "Standard jump",
  1: "High jump",
  2: "Float jump",
};

export const FALL_TYPE_LABELS: Record<number, string> = {
  0: "Standard fall",
  1: "Slow fall",
  2: "Fast fall",
};

/**
 * Calculates the boost dash coverage radius.
 * Total distance = dash_distance * dash_count (approximate maximum reach from current position).
 */
export function boostDashRadius(entry: TypedParamEntry): number {
  const boost = getBoostSystem(entry);
  return boost.boostDashDistance * Math.max(1, boost.boostDashCount);
}

/**
 * Calculates how many boost dashes can be performed with a full gauge.
 * Uses boost_gauge_capacity / boost_consumption_base.
 */
export function boostBudgetDashes(entry: TypedParamEntry): number {
  const boost = getBoostSystem(entry);
  if (boost.boostConsumptionBase <= 0) return Infinity;
  return Math.floor(boost.boostGaugeCapacity / boost.boostConsumptionBase);
}

/**
 * Calculates how many steps can be performed with a full gauge.
 * Assumes step consumption equals boost_consumption_base (game approximation).
 */
export function boostBudgetSteps(entry: TypedParamEntry): number {
  const boost = getBoostSystem(entry);
  if (boost.boostConsumptionBase <= 0) return Infinity;
  return Math.floor(boost.boostGaugeCapacity / boost.boostConsumptionBase);
}

/**
 * Calculates the boost gauge recovery timeline.
 * Returns { delaySeconds, fullRecoverySeconds } from empty gauge.
 */
export function boostRecoveryTimeline(entry: TypedParamEntry): {
  delaySeconds: number;
  fullRecoverySeconds: number;
  totalSeconds: number;
} {
  const boost = getBoostSystem(entry);
  const fps = 60;
  const delaySeconds = boost.boostRecoveryDelay / fps;
  const recoveryFrames = boost.boostRecoverySpeed > 0
    ? (boost.boostGaugeCapacity / boost.boostRecoverySpeed) * fps
    : Infinity;
  const fullRecoverySeconds = recoveryFrames / fps;

  return {
    delaySeconds,
    fullRecoverySeconds,
    totalSeconds: delaySeconds + fullRecoverySeconds,
  };
}

/**
 * Simulates a boost dash speed curve over frames.
 * Returns {frame, speed} pairs for visualization.
 */
export function simulateBoostDashCurve(entry: TypedParamEntry): Array<{ frame: number; speed: number }> {
  const boost = getBoostSystem(entry);
  const result: Array<{ frame: number; speed: number }> = [];

  const startupFrames = boost.boostDashStartupFrame;
  const durationFrames = boost.boostDashDurationFrame;
  const recoveryFrames = boost.boostDashRecoveryFrame;

  for (let f = 0; f < startupFrames; f++) {
    const t = startupFrames > 0 ? f / startupFrames : 1;
    result.push({ frame: f, speed: boost.boostDashInitialSpeed * t });
  }

  for (let f = 0; f < durationFrames; f++) {
    const t = durationFrames > 0 ? f / durationFrames : 0;
    const speed = boost.boostDashInitialSpeed + (boost.boostDashSustainedSpeed - boost.boostDashInitialSpeed) * t;
    result.push({ frame: startupFrames + f, speed });
  }

  const endSpeed = field(entry, "dashEndSpeed");
  for (let f = 0; f < recoveryFrames; f++) {
    const t = recoveryFrames > 0 ? f / recoveryFrames : 1;
    const speed = boost.boostDashSustainedSpeed + (endSpeed - boost.boostDashSustainedSpeed) * t;
    result.push({ frame: startupFrames + durationFrames + f, speed });
  }

  return result;
}
