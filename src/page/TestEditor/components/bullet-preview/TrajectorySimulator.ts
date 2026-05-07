/**
 * Trajectory simulator for bullet preview.
 * Dispatches on the real moveType field values (0-7, 255) from bulletparam.bin.
 *
 * Note: sub_14043C200 (IDA) is a command query dispatcher, NOT bullet physics.
 * The 513-595 range are entity command IDs, not move types.
 */

import type { TypedParamEntry } from "../param-editor/typedParamTypes";
import {
  computeScenarioTargetPosition,
  type BulletPreviewScenario,
} from "./bulletPreviewTypes";
import {
  getMoveTypeDefinition,
  getMoveTypeLabel,
  getMoveTypeCategory,
  type MoveTypeCategory,
} from "@/lib/gameAlgorithms/moveTypes";
import {
  ballisticAngleSolver,
  ballisticTrajectoryMidpoint,
} from "@/lib/gameAlgorithms/ballisticSolver";
import { degToRad as gameDegreesToRad } from "@/lib/gameAlgorithms/vec3";
import type { Vec3 } from "@/lib/gameAlgorithms/vec3";

export interface TrajectoryResult {
  positions: Float32Array;
  targetPositions: Float32Array;
  totalFrames: number;
  hitFrame: number;
  maxRange: number;
  effectiveRange: number;
  blastRadius: number;
  hitboxSize: [number, number, number];
  moveType: number;
  moveTypeLabel: string;
  moveTypeCategory: MoveTypeCategory;
  warnings: string[];
}

const MAX_SIM_FRAMES = 600;
const SAFE_MAX_SPEED = 640;
const SAFE_MAX_RANGE = 10000;
const SAFE_MAX_DISTANCE = 10000;

function f(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pushWarningOnce(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function vec3Len(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

function vec3Normalize(x: number, y: number, z: number): [number, number, number] {
  const len = vec3Len(x, y, z);
  if (len < 1e-8) return [0, 0, 1];
  return [x / len, y / len, z / len];
}

function normalizeAngleDeg(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = ((value % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

export const MOVE_TYPE_LABELS: Record<number, string> = {
  0: "Standard missile",
  1: "Throw projectile",
  2: "Funnel flight",
  3: "Funnel approach",
  4: "Anchor / chain",
  5: "Funnel flysword",
  6: "Attach change",
  7: "Funnel throw",
  255: "Generic projectile",
};

// moveType values from bulletparam: 0-7 and 255 are the only known valid values

interface SimState {
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
}

function resolveHorizontalLaunchDeg(entry: TypedParamEntry): number {
  const launchH = f(entry.launchAngleHorizontal);
  if (launchH !== 0 || entry.launchAngleHorizontal === 0) return launchH;
  return f(entry.initialAngle);
}

function computeLaunchDirection(entry: TypedParamEntry): [number, number, number] {
  const launchAngleH = degToRad(normalizeAngleDeg(resolveHorizontalLaunchDeg(entry)));
  const launchAngleV = degToRad(normalizeAngleDeg(f(entry.elevationAngle)));

  const dirX = Math.sin(launchAngleH) * Math.cos(launchAngleV);
  const dirY = Math.sin(launchAngleV);
  const dirZ = Math.cos(launchAngleH) * Math.cos(launchAngleV);
  return vec3Normalize(dirX, dirY, dirZ);
}

function applyHoming(
  state: SimState,
  targetX: number, targetY: number, targetZ: number,
  homingStrength: number,
  turnRate: number,
  turnAccel: number,
  frame: number,
): void {
  const curSpeed = vec3Len(state.vx, state.vy, state.vz);
  if (curSpeed < 1e-6) return;

  const toTargetX = targetX - state.px;
  const toTargetY = targetY - state.py;
  const toTargetZ = targetZ - state.pz;
  const [ttx, tty, ttz] = vec3Normalize(toTargetX, toTargetY, toTargetZ);

  let effectiveTurnRate = turnRate;
  if (turnAccel > 0) {
    effectiveTurnRate = Math.min(turnRate + turnAccel * frame, Math.PI);
  }

  const blend = Math.min(homingStrength, effectiveTurnRate > 0 ? effectiveTurnRate : 0.1);

  state.vx = state.vx * (1 - blend) + ttx * curSpeed * blend;
  state.vy = state.vy * (1 - blend) + tty * curSpeed * blend;
  state.vz = state.vz * (1 - blend) + ttz * curSpeed * blend;

  const newSpeed = vec3Len(state.vx, state.vy, state.vz);
  if (newSpeed > 1e-6) {
    const scale = curSpeed / newSpeed;
    state.vx *= scale;
    state.vy *= scale;
    state.vz *= scale;
  }
}

function applyAcceleration(state: SimState, accel: number): void {
  if (accel === 0) return;
  const spd = vec3Len(state.vx, state.vy, state.vz);
  if (spd < 1e-6) return;
  const newSpeed = Math.max(0, spd + accel);
  const scale = newSpeed / spd;
  state.vx *= scale;
  state.vy *= scale;
  state.vz *= scale;
}

function applyGravity(state: SimState, gravity: number): void {
  state.vy -= gravity;
}

function stepPosition(state: SimState): void {
  state.px += state.vx;
  state.py += state.vy;
  state.pz += state.vz;
}

function checkDivergence(state: SimState): boolean {
  return !Number.isFinite(state.px) || !Number.isFinite(state.py) || !Number.isFinite(state.pz);
}

export function simulateTrajectory(
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
): TrajectoryResult {
  const warnings: string[] = [];
  const moveType = Math.trunc(f(entry.moveType, 255));
  const category = getMoveTypeCategory(moveType);
  const moveTypeLabel = getMoveTypeLabel(moveType);

  const lifetimeRaw = Math.max(Math.abs(f(entry.lifetime)), 1);
  if (lifetimeRaw > MAX_SIM_FRAMES) {
    pushWarningOnce(warnings, `Lifetime ${lifetimeRaw.toFixed(0)}f clamped to ${MAX_SIM_FRAMES}f for preview.`);
  }
  const maxSimFrames = clamp(Math.ceil(lifetimeRaw), 1, MAX_SIM_FRAMES);

  const maxRange = clamp(Math.abs(f(entry.maxRange)), 0, SAFE_MAX_RANGE);
  const effectiveRange = clamp(Math.abs(f(entry.effectiveRange)), 0, SAFE_MAX_DISTANCE);
  const blastRadius = clamp(Math.abs(f(entry.blastRadius)), 0, SAFE_MAX_RANGE);
  const hitboxSize: [number, number, number] = [
    clamp(Math.abs(f(entry.hitboxWidth)), 0, 300),
    clamp(Math.abs(f(entry.hitboxHeight)), 0, 300),
    clamp(Math.abs(f(entry.hitboxDepth)), 0, 300),
  ];

  const speed = clamp(Math.abs(f(entry.initialSpeed)), 0, SAFE_MAX_SPEED);
  const accel = f(entry.accelerationValue);
  const gravity = Math.abs(f(entry.gravityRate));
  const homingStr = clamp(Math.abs(f(entry.homingStrength)), 0, 1);
  const turnRate = f(entry.turnRate);
  const turnAccel = f(entry.turnAcceleration);
  const homingDur = clamp(Math.round(Math.abs(f(entry.homingDuration))), 0, maxSimFrames);
  const delayFrame = Math.max(0, Math.round(f(entry.delayFrame)));

  const positions = new Float32Array(maxSimFrames * 3);
  const targetPositions = new Float32Array(maxSimFrames * 3);
  let hitFrame = maxSimFrames;
  let actualFrames = maxSimFrames;

  switch (moveType) {
    case 0: // Missile
    case 255: // Generic
      if (homingStr > 0 && homingDur > 0) {
        actualFrames = simulateHoming(
          positions, targetPositions, maxSimFrames,
          entry, scenario, speed, accel, homingStr, turnRate, homingDur, delayFrame, warnings,
        );
      } else {
        actualFrames = simulateStraight(
          positions, targetPositions, maxSimFrames,
          entry, scenario, speed, accel, delayFrame, warnings,
        );
      }
      break;

    case 1: // Throw (gravity arc)
      actualFrames = simulateBallistic(
        positions, targetPositions, maxSimFrames,
        entry, scenario, speed, gravity, turnRate, warnings,
      );
      break;

    case 2: // Funnel (orbit)
    case 5: // Funnel Flysword
      actualFrames = simulateFunnel(
        positions, targetPositions, maxSimFrames,
        entry, scenario, moveType, speed, warnings,
      );
      break;

    case 3: // Funnel Approach (attack)
      actualFrames = simulateFunnel(
        positions, targetPositions, maxSimFrames,
        entry, scenario, moveType, speed, warnings,
      );
      break;

    case 4: // Anchor
      actualFrames = simulateAnchor(
        positions, targetPositions, maxSimFrames,
        entry, scenario, speed, warnings,
      );
      break;

    case 6: // Attach Change
      actualFrames = simulateStraight(
        positions, targetPositions, maxSimFrames,
        entry, scenario, speed, accel, delayFrame, warnings,
      );
      break;

    case 7: // Funnel Throw
      actualFrames = simulateMine(
        positions, targetPositions, maxSimFrames,
        entry, scenario, warnings,
      );
      break;

    default:
      actualFrames = simulateStraight(
        positions, targetPositions, maxSimFrames,
        entry, scenario, speed, accel, delayFrame, warnings,
      );
  }

  hitFrame = findHitFrame(positions, targetPositions, actualFrames, maxRange);

  const trimmed = actualFrames < maxSimFrames ? positions.subarray(0, actualFrames * 3) : positions;
  const trimmedTargets = actualFrames < maxSimFrames
    ? targetPositions.subarray(0, actualFrames * 3)
    : targetPositions;

  return {
    positions: new Float32Array(trimmed),
    targetPositions: new Float32Array(trimmedTargets),
    totalFrames: actualFrames,
    hitFrame,
    maxRange,
    effectiveRange,
    blastRadius,
    hitboxSize,
    moveType,
    moveTypeLabel,
    moveTypeCategory: category,
    warnings,
  };
}

function findHitFrame(
  positions: Float32Array,
  targetPositions: Float32Array,
  totalFrames: number,
  maxRange: number,
): number {
  const hitRadius = maxRange > 0 ? maxRange : 2.0;
  for (let frame = 3; frame < totalFrames; frame++) {
    const px = positions[frame * 3]!;
    const py = positions[frame * 3 + 1]!;
    const pz = positions[frame * 3 + 2]!;
    const tx = targetPositions[frame * 3]!;
    const ty = targetPositions[frame * 3 + 1]!;
    const tz = targetPositions[frame * 3 + 2]!;
    if (vec3Len(px - tx, py - ty, pz - tz) < hitRadius) {
      return frame;
    }
  }
  return totalFrames;
}

function simulateStraight(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  speed: number,
  accel: number,
  delayFrame: number,
  warnings: string[],
): number {
  const [ndx, ndy, ndz] = computeLaunchDirection(entry);
  const effectiveRange = clamp(Math.abs(f(entry.effectiveRange)), 0, SAFE_MAX_DISTANCE);
  const state: SimState = { px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0 };

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;
    positions[frame * 3] = state.px;
    positions[frame * 3 + 1] = state.py;
    positions[frame * 3 + 2] = state.pz;

    if (frame < delayFrame) continue;

    if (frame === delayFrame) {
      state.vx = ndx * speed;
      state.vy = ndy * speed;
      state.vz = ndz * speed;
    }

    applyAcceleration(state, accel);
    stepPosition(state);

    if (checkDivergence(state)) return Math.max(1, frame);

    if (effectiveRange > 0 && vec3Len(state.px, state.py, state.pz) >= effectiveRange) {
      return frame + 1;
    }
  }
  return maxFrames;
}

function simulateHoming(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  speed: number,
  accel: number,
  homingStr: number,
  turnRate: number,
  homingDur: number,
  delayFrame: number,
  warnings: string[],
): number {
  const [ndx, ndy, ndz] = computeLaunchDirection(entry);
  const effectiveRange = clamp(Math.abs(f(entry.effectiveRange)), 0, SAFE_MAX_DISTANCE);
  const homingTurnRateRad = degToRad(clamp(turnRate, 0, 180));
  const state: SimState = {
    px: 0, py: 0, pz: 0,
    vx: ndx * speed, vy: ndy * speed, vz: ndz * speed,
  };

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;
    positions[frame * 3] = state.px;
    positions[frame * 3 + 1] = state.py;
    positions[frame * 3 + 2] = state.pz;

    if (frame < delayFrame) continue;

    if (frame >= delayFrame && frame < delayFrame + homingDur) {
      applyHoming(state, tx, ty, tz, homingStr, homingTurnRateRad, 0, frame - delayFrame);
    }

    applyAcceleration(state, accel);
    stepPosition(state);

    if (checkDivergence(state)) return Math.max(1, frame);
    if (effectiveRange > 0 && vec3Len(state.px, state.py, state.pz) >= effectiveRange) {
      return frame + 1;
    }
  }
  return maxFrames;
}

function simulateBallistic(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  speed: number,
  gravity: number,
  turnRate: number,
  warnings: string[],
): number {
  const [targetX, targetY, targetZ] = computeScenarioTargetPosition(scenario, 0);
  const source: Vec3 = [0, 0, 0];
  const target: Vec3 = [targetX, targetY, targetZ];

  const useHighArc = f(entry.elevationAngle) > 30 || f(entry.maxAltitude) > 0;

  const effectiveGravity = gravity > 0 ? gravity : 0.1;
  const effectiveSpeed = speed > 0 ? speed : 5;

  const launchAngle = ballisticAngleSolver(source, target, effectiveSpeed, effectiveGravity, useHighArc);

  const horizDir = vec3Normalize(targetX, 0, targetZ);
  const cosA = Math.cos(launchAngle);
  const sinA = Math.sin(launchAngle);

  const state: SimState = {
    px: 0, py: 0, pz: 0,
    vx: horizDir[0] * effectiveSpeed * cosA,
    vy: effectiveSpeed * sinA,
    vz: horizDir[2] * effectiveSpeed * cosA,
  };

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;
    positions[frame * 3] = state.px;
    positions[frame * 3 + 1] = state.py;
    positions[frame * 3 + 2] = state.pz;

    applyGravity(state, effectiveGravity);
    stepPosition(state);

    if (checkDivergence(state)) return Math.max(1, frame);

    if (state.py < -10 && frame > 5) {
      return frame + 1;
    }
  }
  return maxFrames;
}

function simulateSpread(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  speed: number,
  accel: number,
  warnings: string[],
): number {
  const spreadAngle = degToRad(f(entry.spreadAngle));
  const [ndx, ndy, ndz] = computeLaunchDirection(entry);
  const cosS = Math.cos(spreadAngle);
  const sinS = Math.sin(spreadAngle);
  const launchDirX = ndx * cosS + ndz * sinS;
  const launchDirZ = -ndx * sinS + ndz * cosS;

  const effectiveRange = clamp(Math.abs(f(entry.effectiveRange)), 0, SAFE_MAX_DISTANCE);
  const state: SimState = {
    px: 0, py: 0, pz: 0,
    vx: launchDirX * speed, vy: ndy * speed, vz: launchDirZ * speed,
  };

  warnings.push("Spread preview shows single projectile with spread angle offset applied.");

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;
    positions[frame * 3] = state.px;
    positions[frame * 3 + 1] = state.py;
    positions[frame * 3 + 2] = state.pz;

    applyAcceleration(state, accel);
    stepPosition(state);

    if (checkDivergence(state)) return Math.max(1, frame);
    if (effectiveRange > 0 && vec3Len(state.px, state.py, state.pz) >= effectiveRange) {
      return frame + 1;
    }
  }
  return maxFrames;
}

function simulateSpecial(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  gameMoveType: number,
  speed: number,
  warnings: string[],
): number {
  switch (gameMoveType) {
    case 545:
    case 546:
      return simulateBeam(positions, targetPositions, maxFrames, entry, scenario, gameMoveType, warnings);
    case 547:
    case 548:
      return simulateFunnel(positions, targetPositions, maxFrames, entry, scenario, gameMoveType, speed, warnings);
    case 549:
    case 550:
      return simulateAnchor(positions, targetPositions, maxFrames, entry, scenario, speed, warnings);
    case 551:
      return simulateShield(positions, targetPositions, maxFrames, scenario, warnings);
    case 552:
      return simulateMine(positions, targetPositions, maxFrames, entry, scenario, warnings);
    default:
      return simulateStraight(positions, targetPositions, maxFrames, entry, scenario, speed, 0, 0, warnings);
  }
}

function simulateBeam(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  gameMoveType: number,
  warnings: string[],
): number {
  const [ndx, ndy, ndz] = computeLaunchDirection(entry);
  const beamLength = clamp(Math.abs(f(entry.maxDistance, 100)), 1, SAFE_MAX_DISTANCE);
  const isSweep = gameMoveType === 546;

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;

    let sweepAngle = 0;
    if (isSweep) {
      sweepAngle = Math.sin(frame * 0.05) * degToRad(f(entry.spreadAngle, 30));
    }

    const t = frame / Math.max(maxFrames - 1, 1);
    const reach = beamLength * Math.min(t * 4, 1);
    const cos = Math.cos(sweepAngle);
    const sin = Math.sin(sweepAngle);
    const dirX = ndx * cos + ndz * sin;
    const dirZ = -ndx * sin + ndz * cos;

    positions[frame * 3] = dirX * reach;
    positions[frame * 3 + 1] = ndy * reach;
    positions[frame * 3 + 2] = dirZ * reach;
  }
  return maxFrames;
}

function simulateFunnel(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  gameMoveType: number,
  speed: number,
  warnings: string[],
): number {
  const orbitRadius = clamp(Math.abs(f(entry.effectiveRange, 15)), 1, 200);
  const orbitSpeed = speed > 0 ? speed * 0.02 : 0.05;
  const isAttack = gameMoveType === 3 || gameMoveType === 548;

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;

    if (isAttack && frame > maxFrames * 0.3) {
      const t = (frame - maxFrames * 0.3) / (maxFrames * 0.7);
      const easedT = Math.min(1, t * t);
      positions[frame * 3] = orbitRadius * Math.cos(frame * orbitSpeed) * (1 - easedT) + tx * easedT;
      positions[frame * 3 + 1] = 3 + ty * easedT;
      positions[frame * 3 + 2] = orbitRadius * Math.sin(frame * orbitSpeed) * (1 - easedT) + tz * easedT;
    } else {
      const height = 3 + Math.sin(frame * 0.03) * 1.5;
      positions[frame * 3] = Math.cos(frame * orbitSpeed) * orbitRadius;
      positions[frame * 3 + 1] = height;
      positions[frame * 3 + 2] = Math.sin(frame * orbitSpeed) * orbitRadius;
    }
  }
  return maxFrames;
}

function simulateAnchor(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  speed: number,
  warnings: string[],
): number {
  const [baseX, baseY, baseZ] = computeScenarioTargetPosition(scenario, 0);
  const targetDistance = Math.max(1, vec3Len(baseX, baseY, baseZ));
  const maxDistance = clamp(Math.abs(f(entry.maxDistance)), 0, SAFE_MAX_DISTANCE);
  const reach = Math.min(targetDistance * 0.8, maxDistance || targetDistance * 0.8);
  const effectiveSpeed = clamp(speed, 0.1, SAFE_MAX_SPEED);
  const extendFrames = clamp(Math.ceil(reach / effectiveSpeed), 1, maxFrames);
  const retractStart = Math.min(extendFrames + 30, maxFrames - 1);
  const effectiveRange = clamp(Math.abs(f(entry.effectiveRange)), 0, SAFE_MAX_DISTANCE);

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;

    let t: number;
    if (frame < extendFrames) {
      t = frame / Math.max(extendFrames, 1);
    } else if (frame < retractStart) {
      t = 1.0;
    } else {
      t = 1.0 - (frame - retractStart) / Math.max(maxFrames - retractStart, 1);
    }

    const [dirX, dirY, dirZ] = vec3Normalize(tx, ty, tz);
    positions[frame * 3] = dirX * reach * t;
    positions[frame * 3 + 1] = dirY * reach * t;
    positions[frame * 3 + 2] = dirZ * reach * t;

    if (effectiveRange > 0 && vec3Len(positions[frame * 3]!, positions[frame * 3 + 1]!, positions[frame * 3 + 2]!) >= effectiveRange) {
      return frame + 1;
    }
  }
  return maxFrames;
}

function simulateShield(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  scenario: BulletPreviewScenario,
  warnings: string[],
): number {
  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;
    positions[frame * 3] = 0;
    positions[frame * 3 + 1] = 1.2;
    positions[frame * 3 + 2] = 1.5;
  }
  return maxFrames;
}

function simulateMine(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  warnings: string[],
): number {
  const [ndx, ndy, ndz] = computeLaunchDirection(entry);
  const throwSpeed = clamp(Math.abs(f(entry.initialSpeed, 3)), 0.1, 50);
  const gravity = Math.abs(f(entry.gravityRate, 0.2));
  let settled = false;
  let settledFrame = 0;

  const state: SimState = {
    px: 0, py: 1, pz: 0,
    vx: ndx * throwSpeed, vy: ndy * throwSpeed + 2, vz: ndz * throwSpeed,
  };

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;

    if (settled) {
      positions[frame * 3] = state.px;
      positions[frame * 3 + 1] = 0;
      positions[frame * 3 + 2] = state.pz;
      continue;
    }

    positions[frame * 3] = state.px;
    positions[frame * 3 + 1] = state.py;
    positions[frame * 3 + 2] = state.pz;

    applyGravity(state, gravity);
    stepPosition(state);

    if (state.py <= 0) {
      state.py = 0;
      settled = true;
      settledFrame = frame;
    }
  }
  return maxFrames;
}

function simulateAdvancedHoming(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  gameMoveType: number,
  speed: number,
  accel: number,
  homingStr: number,
  turnRate: number,
  turnAccel: number,
  homingDur: number,
  delayFrame: number,
  warnings: string[],
): number {
  const [ndx, ndy, ndz] = computeLaunchDirection(entry);
  const effectiveRange = clamp(Math.abs(f(entry.effectiveRange)), 0, SAFE_MAX_DISTANCE);
  const homingTurnRateRad = degToRad(clamp(turnRate, 0, 180));
  const turnAccelRad = degToRad(clamp(turnAccel, 0, 15));

  const state: SimState = {
    px: 0, py: 0, pz: 0,
    vx: ndx * speed, vy: ndy * speed, vz: ndz * speed,
  };

  const patternMod = getAdvancedHomingPattern(gameMoveType);

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;
    positions[frame * 3] = state.px;
    positions[frame * 3 + 1] = state.py;
    positions[frame * 3 + 2] = state.pz;

    if (frame < delayFrame) continue;

    const homingFrame = frame - delayFrame;
    if (homingFrame < homingDur) {
      applyHoming(state, tx, ty, tz, homingStr, homingTurnRateRad, turnAccelRad, homingFrame);
    }

    patternMod(state, frame, homingFrame, speed);

    applyAcceleration(state, accel);
    stepPosition(state);

    if (checkDivergence(state)) return Math.max(1, frame);
    if (effectiveRange > 0 && vec3Len(state.px, state.py, state.pz) >= effectiveRange) {
      return frame + 1;
    }
  }
  return maxFrames;
}

type PatternModifier = (state: SimState, frame: number, homingFrame: number, speed: number) => void;

function getAdvancedHomingPattern(gameMoveType: number): PatternModifier {
  switch (gameMoveType) {
    case 555:
      return (state, _frame, homingFrame, speed) => {
        const sway = Math.sin(homingFrame * 0.15) * speed * 0.3;
        const perpX = -state.vz;
        const perpZ = state.vx;
        const perpLen = vec3Len(perpX, 0, perpZ);
        if (perpLen > 1e-6) {
          state.vx += (perpX / perpLen) * sway * 0.01;
          state.vz += (perpZ / perpLen) * sway * 0.01;
        }
      };
    case 560:
      return (state, _frame, homingFrame, speed) => {
        const zigPhase = Math.floor(homingFrame / 10) % 2 === 0 ? 1 : -1;
        const perpX = -state.vz;
        const perpZ = state.vx;
        const perpLen = vec3Len(perpX, 0, perpZ);
        if (perpLen > 1e-6) {
          state.vx += (perpX / perpLen) * speed * 0.15 * zigPhase * 0.01;
          state.vz += (perpZ / perpLen) * speed * 0.15 * zigPhase * 0.01;
        }
      };
    case 561:
      return (state, _frame, homingFrame, speed) => {
        const wave = Math.sin(homingFrame * 0.1) * speed * 0.2;
        const perpX = -state.vz;
        const perpZ = state.vx;
        const perpLen = vec3Len(perpX, 0, perpZ);
        if (perpLen > 1e-6) {
          state.vx += (perpX / perpLen) * wave * 0.01;
          state.vz += (perpZ / perpLen) * wave * 0.01;
        }
      };
    case 564:
      return (state, _frame, homingFrame, speed) => {
        const corkRadius = speed * 0.15;
        const corkAngle = homingFrame * 0.2;
        state.vy += Math.sin(corkAngle) * corkRadius * 0.01;
        const perpX = -state.vz;
        const perpZ = state.vx;
        const perpLen = vec3Len(perpX, 0, perpZ);
        if (perpLen > 1e-6) {
          state.vx += (perpX / perpLen) * Math.cos(corkAngle) * corkRadius * 0.01;
          state.vz += (perpZ / perpLen) * Math.cos(corkAngle) * corkRadius * 0.01;
        }
      };
    default:
      return () => {};
  }
}

function simulateGravityAffected(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  gameMoveType: number,
  speed: number,
  accel: number,
  gravity: number,
  homingStr: number,
  turnRate: number,
  homingDur: number,
  warnings: string[],
): number {
  const [ndx, ndy, ndz] = computeLaunchDirection(entry);
  const effectiveRange = clamp(Math.abs(f(entry.effectiveRange)), 0, SAFE_MAX_DISTANCE);
  const effectiveGravity = gravity > 0 ? gravity : 0.1;
  const homingTurnRateRad = degToRad(clamp(turnRate, 0, 180));

  let launchVy = ndy * speed;
  if (gameMoveType === 570) {
    launchVy = Math.abs(speed) * 0.8;
  } else if (gameMoveType === 569) {
    launchVy = Math.abs(speed) * 0.2;
  } else if (gameMoveType === 575) {
    launchVy = -Math.abs(speed) * 0.6;
  }

  const state: SimState = {
    px: 0, py: 0, pz: 0,
    vx: ndx * speed, vy: launchVy, vz: ndz * speed,
  };

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;
    positions[frame * 3] = state.px;
    positions[frame * 3 + 1] = state.py;
    positions[frame * 3 + 2] = state.pz;

    if (gameMoveType === 571 && frame > maxFrames * 0.5 && frame < homingDur) {
      applyHoming(state, tx, ty, tz, homingStr, homingTurnRateRad, 0, frame);
    }

    let frameGravity = effectiveGravity;
    if (gameMoveType === 569 || gameMoveType === 574) {
      frameGravity = effectiveGravity * 0.3;
    }

    applyGravity(state, frameGravity);
    applyAcceleration(state, accel);
    stepPosition(state);

    if (checkDivergence(state)) return Math.max(1, frame);
    if (state.py < -50 && frame > 5) return frame + 1;
    if (effectiveRange > 0 && vec3Len(state.px, state.py, state.pz) >= effectiveRange) {
      return frame + 1;
    }
  }
  return maxFrames;
}

function simulateUnique(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  gameMoveType: number,
  speed: number,
  warnings: string[],
): number {
  switch (gameMoveType) {
    case 576:
    case 577:
      return simulateBoomerang(positions, targetPositions, maxFrames, entry, scenario, gameMoveType, speed, warnings);
    case 578:
      return simulateTeleport(positions, targetPositions, maxFrames, entry, scenario, speed, warnings);
    case 579:
    case 580:
      return simulateMine(positions, targetPositions, maxFrames, entry, scenario, warnings);
    case 581:
    case 582:
      return simulateFormation(positions, targetPositions, maxFrames, entry, scenario, gameMoveType, speed, warnings);
    case 583:
    case 584:
      return simulateFunnel(positions, targetPositions, maxFrames, entry, scenario, gameMoveType === 584 ? 548 : 547, speed, warnings);
    default:
      return simulateStraight(positions, targetPositions, maxFrames, entry, scenario, speed, 0, 0, warnings);
  }
}

function simulateBoomerang(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  gameMoveType: number,
  speed: number,
  warnings: string[],
): number {
  const [ndx, ndy, ndz] = computeLaunchDirection(entry);
  const maxDistance = clamp(Math.abs(f(entry.maxDistance, 40)), 1, SAFE_MAX_DISTANCE);
  const turnPoint = Math.floor(maxFrames * 0.4);
  const isReturn = gameMoveType === 577;

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;

    let t: number;
    if (isReturn) {
      t = 1 - frame / maxFrames;
    } else if (frame < turnPoint) {
      t = frame / turnPoint;
    } else {
      t = 1 - (frame - turnPoint) / (maxFrames - turnPoint);
    }

    const curveOffset = Math.sin(t * Math.PI) * maxDistance * 0.3;
    positions[frame * 3] = ndx * maxDistance * t + curveOffset;
    positions[frame * 3 + 1] = ndy * maxDistance * t + Math.sin(t * Math.PI) * 3;
    positions[frame * 3 + 2] = ndz * maxDistance * t;
  }
  return maxFrames;
}

function simulateTeleport(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  speed: number,
  warnings: string[],
): number {
  const [tx0, ty0, tz0] = computeScenarioTargetPosition(scenario, 0);
  const teleportFrame = Math.min(Math.floor(maxFrames * 0.3), 30);

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;

    if (frame < teleportFrame) {
      const t = frame / teleportFrame;
      positions[frame * 3] = 0;
      positions[frame * 3 + 1] = t * 5;
      positions[frame * 3 + 2] = t * speed * 0.5;
    } else {
      positions[frame * 3] = tx;
      positions[frame * 3 + 1] = ty;
      positions[frame * 3 + 2] = tz;
    }
  }
  return maxFrames;
}

function simulateFormation(
  positions: Float32Array,
  targetPositions: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  gameMoveType: number,
  speed: number,
  warnings: string[],
): number {
  const isCircle = gameMoveType === 582;
  const [ndx, ndy, ndz] = computeLaunchDirection(entry);
  const formationSpeed = speed > 0 ? speed * 0.5 : 2;

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = tx;
    targetPositions[frame * 3 + 1] = ty;
    targetPositions[frame * 3 + 2] = tz;

    if (isCircle) {
      const radius = 5 + frame * 0.05;
      positions[frame * 3] = Math.cos(frame * 0.08) * radius;
      positions[frame * 3 + 1] = 2;
      positions[frame * 3 + 2] = Math.sin(frame * 0.08) * radius + frame * formationSpeed * 0.1;
    } else {
      positions[frame * 3] = ndx * frame * formationSpeed * 0.1;
      positions[frame * 3 + 1] = ndy * frame * formationSpeed * 0.1 + 1;
      positions[frame * 3 + 2] = ndz * frame * formationSpeed * 0.1;
    }
  }
  return maxFrames;
}
