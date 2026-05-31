/**
 * Bullet trajectory simulator for the Bullet Editor preview.
 *
 * Reverse-engineering-grounded model (see
 * docs/agent-sessions/bullet-editor-physics-redesign/process.md):
 *
 * - The projectile is a CUnitTaskAutomata entity. Its per-frame update integrates a
 *   PhysicsBody (pos += vel at 60fps) while an ActionController (MSC action script)
 *   applies steering/induction. bulletparam does NOT store the base launch velocity —
 *   that is supplied by the firing weapon/action — so the base launch speed is an
 *   explicit scenario input (`scenario.launchSpeed`). bulletparam carries MODIFIERS:
 *   acceleration, gravity, homing, lifetime, ranges, hitbox, blast.
 * - Induction (homing) only applies under RED/BLUE lock (see `isInductionActive`).
 * - Ballistic arc (moveType 1 / gravity_rate > 0) uses the exact game solver
 *   (`ballisticAngleSolver`, ported from sub_1405C42E0).
 *
 * Field names are the verified bulletparam command-pool names (src-tauri bulletparam.rs).
 * Calibration constants that are not yet bit-exactly extracted from the action VM are
 * centralized in CALIBRATION below and documented; they are NOT scattered magic numbers.
 */

import type { TypedParamEntry } from "../param-editor/typedParamTypes";
import {
  computeScenarioTargetPosition,
  isInductionActive,
  DEFAULT_LAUNCH_SPEED,
  type BulletPreviewScenario,
} from "./bulletPreviewTypes";
import {
  getMoveTypeLabel,
  getMoveTypeCategory,
  type MoveTypeCategory,
} from "@/lib/gameAlgorithms/moveTypes";
import { ballisticAngleSolver } from "@/lib/gameAlgorithms/ballisticSolver";

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
  inductionActive: boolean;
  /** Induction (homing) range radius for visualization; 0 when no induction band applies. */
  inductionRange: number;
  warnings: string[];
}

/**
 * Calibration constants. Defaults are RE-grounded but the exact action-VM scaling for
 * turn_rate and the acceleration units are not bit-exactly extracted; refine via in-game
 * capture or deeper action-VM RE. Keep ALL such tunables here, never inline.
 */
const CALIBRATION = {
  fps: 60,
  maxSimFrames: 600,
  /** Hard clamp on base launch speed (game initial_speed range is 0..640). */
  maxLaunchSpeed: 640,
  /** turn_rate (bulletparam, range 0..1000) is treated as degrees/frame directly. */
  turnRateToDegPerFrame: 1,
  /** Safety clamp so outlier turn_rate values cannot produce instant snapping. */
  maxTurnDegPerFrame: 30,
  /** Distance cutoffs are clamped to this to keep the preview bounded. */
  safeMaxDistance: 12000,
} as const;

const RAD = Math.PI / 180;

function f(entry: TypedParamEntry, key: string, fallback = 0): number {
  const v = entry[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pushWarningOnce(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function vlen(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

function normalize(x: number, y: number, z: number): [number, number, number] {
  const len = vlen(x, y, z);
  if (len < 1e-8) return [0, 0, 1];
  return [x / len, y / len, z / len];
}

function normalizeAngleDeg(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const n = ((value % 360) + 360) % 360;
  return n > 180 ? n - 360 : n;
}

interface SimState {
  px: number; py: number; pz: number;
  vx: number; vy: number; vz: number;
}

/**
 * Launch direction from the horizontal launch angle (yaw about +Y) and the elevation
 * angle (pitch). Coordinate frame matches the viewport: +Z forward, +Y up, +X lateral.
 */
function launchDirection(entry: TypedParamEntry): [number, number, number] {
  const yaw = normalizeAngleDeg(f(entry, "launchAngleHorizontal") || f(entry, "initialAngle")) * RAD;
  const pitch = normalizeAngleDeg(f(entry, "elevationAngle")) * RAD;
  const cp = Math.cos(pitch);
  return normalize(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
}

/**
 * Resolves the base launch speed (units/frame). Prefers the explicit scenario value;
 * falls back to the entry's initial_speed when set, else the documented default.
 */
function resolveLaunchSpeed(entry: TypedParamEntry, scenario: BulletPreviewScenario): number {
  const fromScenario = Number.isFinite(scenario.launchSpeed) ? scenario.launchSpeed : 0;
  if (fromScenario > 0) return clamp(fromScenario, 0, CALIBRATION.maxLaunchSpeed);
  const initial = Math.abs(f(entry, "initialSpeed"));
  if (initial > 0) return clamp(initial, 0, CALIBRATION.maxLaunchSpeed);
  return DEFAULT_LAUNCH_SPEED;
}

/**
 * Per-frame speed-magnitude delta applied to the velocity. speed_acceleration is treated
 * as units/frame^2; acceleration_value as units/second^2 (divided by fps). Both ranges
 * (speed_acceleration -2..30, acceleration_value -360..3000) reduce to compatible
 * per-frame magnitudes under this interpretation.
 */
function speedDeltaPerFrame(entry: TypedParamEntry): number {
  return f(entry, "speedAcceleration") + f(entry, "accelerationValue") / CALIBRATION.fps;
}

function applySpeedDelta(state: SimState, delta: number): void {
  if (delta === 0) return;
  const spd = vlen(state.vx, state.vy, state.vz);
  if (spd < 1e-6) return;
  const next = Math.max(0, spd + delta);
  const scale = next / spd;
  state.vx *= scale;
  state.vy *= scale;
  state.vz *= scale;
}

interface HomingConfig {
  active: boolean;
  turnDegPerFrame: number;
  trackingAngleDeg: number;
  startFrame: number;
  endFrame: number;
  minDistance: number;
  maxDistance: number;
}

function resolveHoming(
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  maxSimFrames: number,
): HomingConfig {
  const homingType = Math.trunc(f(entry, "homingType"));
  const turnRate = Math.abs(f(entry, "turnRate"));
  const inductionAllowed = isInductionActive(scenario.lockState);
  const active = inductionAllowed && homingType > 0 && turnRate > 0;

  const turnDegPerFrame = clamp(
    turnRate * CALIBRATION.turnRateToDegPerFrame,
    0,
    CALIBRATION.maxTurnDegPerFrame,
  );

  // tracking_angle is the induction cone half-angle in degrees; 0 -> treat as omni.
  const trackingAngleRaw = Math.abs(f(entry, "trackingAngle"));
  const trackingAngleDeg = trackingAngleRaw > 0 ? Math.min(trackingAngleRaw, 180) : 180;

  const startFrame = Math.max(0, Math.round(f(entry, "homingStartDistance") > 0 ? 0 : 0));
  const duration = Math.round(Math.abs(f(entry, "homingDuration")));
  const endFrame = duration > 0 ? Math.min(duration, maxSimFrames) : maxSimFrames;

  const minDistance = Math.max(0, f(entry, "minHomingDistance"));
  const homingRange = Math.abs(f(entry, "homingRange"));
  const trackingStart = Math.abs(f(entry, "trackingStartDistance"));
  const maxDistance = clamp(
    Math.max(homingRange, trackingStart) || CALIBRATION.safeMaxDistance,
    0,
    CALIBRATION.safeMaxDistance,
  );

  return { active, turnDegPerFrame, trackingAngleDeg, startFrame, endFrame, minDistance, maxDistance };
}

/**
 * Rotates the velocity toward the target by at most `turnDegPerFrame`, but only when the
 * target is inside the induction cone and within the homing distance band.
 */
function applyInduction(
  state: SimState,
  tx: number, ty: number, tz: number,
  homing: HomingConfig,
  frame: number,
): void {
  if (!homing.active) return;
  if (frame < homing.startFrame || frame >= homing.endFrame) return;

  const dx = tx - state.px;
  const dy = ty - state.py;
  const dz = tz - state.pz;
  const dist = vlen(dx, dy, dz);
  if (dist < 1e-4) return;
  if (dist < homing.minDistance || dist > homing.maxDistance) return;

  const speed = vlen(state.vx, state.vy, state.vz);
  if (speed < 1e-6) return;

  const [cdx, cdy, cdz] = normalize(state.vx, state.vy, state.vz);
  const [tdx, tdy, tdz] = normalize(dx, dy, dz);

  const dot = clamp(cdx * tdx + cdy * tdy + cdz * tdz, -1, 1);
  const angleToTargetDeg = Math.acos(dot) / RAD;

  // Outside the induction cone -> no steering this frame.
  if (angleToTargetDeg > homing.trackingAngleDeg) return;

  const maxStep = Math.min(homing.turnDegPerFrame, angleToTargetDeg);
  if (maxStep <= 1e-4) return;
  const t = maxStep / angleToTargetDeg; // fraction of the way to the target direction

  const nx = cdx + (tdx - cdx) * t;
  const ny = cdy + (tdy - cdy) * t;
  const nz = cdz + (tdz - cdz) * t;
  const [ndx, ndy, ndz] = normalize(nx, ny, nz);

  state.vx = ndx * speed;
  state.vy = ndy * speed;
  state.vz = ndz * speed;
}

function diverged(state: SimState): boolean {
  return !Number.isFinite(state.px) || !Number.isFinite(state.py) || !Number.isFinite(state.pz);
}

function writeFrame(
  positions: Float32Array,
  targets: Float32Array,
  frame: number,
  state: SimState,
  tx: number, ty: number, tz: number,
): void {
  const i = frame * 3;
  positions[i] = state.px;
  positions[i + 1] = state.py;
  positions[i + 2] = state.pz;
  targets[i] = tx;
  targets[i + 1] = ty;
  targets[i + 2] = tz;
}

/** Standard projectile integrator (moveType 0 / 6 / 255 and any homing bullet). */
function simulateProjectile(
  positions: Float32Array,
  targets: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  homing: HomingConfig,
): number {
  const [dx, dy, dz] = launchDirection(entry);
  const speed = resolveLaunchSpeed(entry, scenario);
  const accel = speedDeltaPerFrame(entry);
  const gravity = Math.abs(f(entry, "gravityRate"));
  const delay = Math.max(0, Math.round(f(entry, "delayFrame")));
  const maxDistance = clamp(Math.abs(f(entry, "maxDistance")), 0, CALIBRATION.safeMaxDistance);

  const state: SimState = { px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0 };

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    writeFrame(positions, targets, frame, state, tx, ty, tz);

    if (frame < delay) continue;
    if (frame === delay) {
      state.vx = dx * speed;
      state.vy = dy * speed;
      state.vz = dz * speed;
    }

    applyInduction(state, tx, ty, tz, homing, frame - delay);
    applySpeedDelta(state, accel);
    if (gravity > 0) state.vy -= gravity;

    state.px += state.vx;
    state.py += state.vy;
    state.pz += state.vz;

    if (diverged(state)) return Math.max(1, frame);
    if (maxDistance > 0 && vlen(state.px, state.py, state.pz) >= maxDistance) return frame + 1;
  }
  return maxFrames;
}

/** Ballistic arc (moveType 1): exact launch-angle solver + gravity integration. */
function simulateBallistic(
  positions: Float32Array,
  targets: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
): number {
  const [tx0, ty0, tz0] = computeScenarioTargetPosition(scenario, 0);
  const speed = resolveLaunchSpeed(entry, scenario);
  const gravity = Math.max(Math.abs(f(entry, "gravityRate")), 1e-3);
  const useHighArc = f(entry, "elevationAngle") > 30 || f(entry, "maxAltitude") > 0;

  const launchAngle = ballisticAngleSolver([0, 0, 0], [tx0, ty0, tz0], speed, gravity, useHighArc);
  const [hdx, , hdz] = normalize(tx0, 0, tz0);
  const cosA = Math.cos(launchAngle);
  const sinA = Math.sin(launchAngle);

  const state: SimState = {
    px: 0, py: 0, pz: 0,
    vx: hdx * speed * cosA, vy: speed * sinA, vz: hdz * speed * cosA,
  };

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    writeFrame(positions, targets, frame, state, tx, ty, tz);

    state.vy -= gravity;
    state.px += state.vx;
    state.py += state.vy;
    state.pz += state.vz;

    if (diverged(state)) return Math.max(1, frame);
    if (state.py < -10 && frame > 5) return frame + 1;
  }
  return maxFrames;
}

/**
 * Funnel / bit (moveType 2, 3, 5). Real motion is action-script driven; this is a
 * documented preview approximation: hold an orbit offset, then (for the approach types)
 * accelerate toward the target. Induction gating still applies to the approach.
 */
function simulateFunnel(
  positions: Float32Array,
  targets: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  moveType: number,
  homing: HomingConfig,
): number {
  const orbitRadius = clamp(Math.max(f(entry, "effectiveRange"), 12), 1, 200);
  const speed = resolveLaunchSpeed(entry, scenario);
  const orbitOmega = clamp(speed * 0.05, 0.02, 0.4);
  const isApproach = moveType === 3 && homing.active;
  const approachStart = Math.floor(maxFrames * 0.3);

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    const ox = Math.cos(frame * orbitOmega) * orbitRadius;
    const oy = 3 + Math.sin(frame * 0.03) * 1.5;
    const oz = Math.sin(frame * orbitOmega) * orbitRadius;

    if (isApproach && frame > approachStart) {
      const t = Math.min(1, (frame - approachStart) / Math.max(maxFrames - approachStart, 1));
      const eased = t * t;
      positions[frame * 3] = ox * (1 - eased) + tx * eased;
      positions[frame * 3 + 1] = oy * (1 - eased) + ty * eased;
      positions[frame * 3 + 2] = oz * (1 - eased) + tz * eased;
    } else {
      positions[frame * 3] = ox;
      positions[frame * 3 + 1] = oy;
      positions[frame * 3 + 2] = oz;
    }
    targets[frame * 3] = tx;
    targets[frame * 3 + 1] = ty;
    targets[frame * 3 + 2] = tz;
  }
  return maxFrames;
}

/**
 * Anchor / chain (moveType 4, 7). Extends toward the target then retracts. Action-script
 * driven in game; documented preview approximation.
 */
function simulateAnchor(
  positions: Float32Array,
  targets: Float32Array,
  maxFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
): number {
  const [bx, by, bz] = computeScenarioTargetPosition(scenario, 0);
  const targetDist = Math.max(1, vlen(bx, by, bz));
  const maxDistance = clamp(Math.abs(f(entry, "maxDistance")), 0, CALIBRATION.safeMaxDistance);
  const reach = Math.min(targetDist * 0.85, maxDistance || targetDist * 0.85);
  const speed = Math.max(resolveLaunchSpeed(entry, scenario), 0.5);
  const extendFrames = clamp(Math.ceil(reach / speed), 1, maxFrames);
  const retractStart = Math.min(extendFrames + 30, maxFrames - 1);

  for (let frame = 0; frame < maxFrames; frame++) {
    const [tx, ty, tz] = computeScenarioTargetPosition(scenario, frame);
    let t: number;
    if (frame < extendFrames) t = frame / Math.max(extendFrames, 1);
    else if (frame < retractStart) t = 1;
    else t = 1 - (frame - retractStart) / Math.max(maxFrames - retractStart, 1);

    const [dx, dy, dz] = normalize(tx, ty, tz);
    positions[frame * 3] = dx * reach * t;
    positions[frame * 3 + 1] = dy * reach * t;
    positions[frame * 3 + 2] = dz * reach * t;
    targets[frame * 3] = tx;
    targets[frame * 3 + 1] = ty;
    targets[frame * 3 + 2] = tz;
  }
  return maxFrames;
}

function findHitFrame(
  positions: Float32Array,
  targets: Float32Array,
  totalFrames: number,
  hitboxRadius: number,
): number {
  const radius = hitboxRadius > 0 ? hitboxRadius : 2;
  for (let frame = 3; frame < totalFrames; frame++) {
    const i = frame * 3;
    const d = vlen(
      positions[i]! - targets[i]!,
      positions[i + 1]! - targets[i + 1]!,
      positions[i + 2]! - targets[i + 2]!,
    );
    if (d < radius) return frame;
  }
  return totalFrames;
}

export function simulateTrajectory(
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
): TrajectoryResult {
  const warnings: string[] = [];
  const moveType = Math.trunc(f(entry, "moveType", 255));
  const category = getMoveTypeCategory(moveType);
  const moveTypeLabel = getMoveTypeLabel(moveType);

  const lifetimeRaw = Math.max(Math.abs(f(entry, "lifetime")), 1);
  if (lifetimeRaw > CALIBRATION.maxSimFrames) {
    pushWarningOnce(
      warnings,
      `Lifetime ${lifetimeRaw.toFixed(0)}f clamped to ${CALIBRATION.maxSimFrames}f for preview.`,
    );
  }
  const maxSimFrames = clamp(Math.ceil(lifetimeRaw), 1, CALIBRATION.maxSimFrames);

  const maxRange = clamp(Math.abs(f(entry, "maxRange")), 0, CALIBRATION.safeMaxDistance);
  const effectiveRange = clamp(Math.abs(f(entry, "effectiveRange")), 0, CALIBRATION.safeMaxDistance);
  const blastRadius = clamp(Math.abs(f(entry, "blastRadius")), 0, CALIBRATION.safeMaxDistance);
  const hitboxSize: [number, number, number] = [
    clamp(Math.abs(f(entry, "hitboxWidth")), 0, 300),
    clamp(Math.abs(f(entry, "hitboxHeight")), 0, 300),
    clamp(Math.abs(f(entry, "hitboxDepth")), 0, 300),
  ];

  const homing = resolveHoming(entry, scenario, maxSimFrames);
  const homingRangeRaw = Math.max(
    Math.abs(f(entry, "homingRange")),
    Math.abs(f(entry, "trackingStartDistance")),
  );
  const inductionRange = homing.active && homingRangeRaw > 0
    ? clamp(homingRangeRaw, 0, CALIBRATION.safeMaxDistance)
    : 0;
  if (Math.trunc(f(entry, "homingType")) > 0 && !isInductionActive(scenario.lockState)) {
    pushWarningOnce(warnings, "Induction disabled by lock state (green/yellow lock).");
  }

  const positions = new Float32Array(maxSimFrames * 3);
  const targetPositions = new Float32Array(maxSimFrames * 3);

  let actualFrames: number;
  switch (moveType) {
    case 1:
      actualFrames = simulateBallistic(positions, targetPositions, maxSimFrames, entry, scenario);
      break;
    case 2:
    case 3:
    case 5:
      actualFrames = simulateFunnel(positions, targetPositions, maxSimFrames, entry, scenario, moveType, homing);
      break;
    case 4:
    case 7:
      actualFrames = simulateAnchor(positions, targetPositions, maxSimFrames, entry, scenario);
      break;
    case 0:
    case 6:
    case 255:
    default:
      actualFrames = simulateProjectile(positions, targetPositions, maxSimFrames, entry, scenario, homing);
      break;
  }

  const hitboxRadius = Math.max(hitboxSize[0], hitboxSize[1], hitboxSize[2]) * 0.5;
  const hitFrame = findHitFrame(positions, targetPositions, actualFrames, hitboxRadius || maxRange);

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
    inductionActive: homing.active,
    inductionRange,
    warnings,
  };
}
