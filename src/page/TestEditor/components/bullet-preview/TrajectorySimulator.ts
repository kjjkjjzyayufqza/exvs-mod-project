import type { TypedParamEntry } from "../param-editor/typedParamTypes";
import {
  computeScenarioTargetPosition,
  type BulletPreviewScenario,
} from "./bulletPreviewTypes";

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
  warnings: string[];
}

const MAX_SIM_FRAMES = 600;
const SAFE_MAX_SPEED = 600;
const SAFE_MAX_ACCEL = 20;
const SAFE_MAX_GRAVITY = 8;
const SAFE_MAX_RANGE = 2500;
const SAFE_MAX_DISTANCE = 6000;

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

function normalizeAngleDeg(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const normalized = ((value % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
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

function resolveHorizontalLaunchDeg(entry: TypedParamEntry): number {
  const launchH = f(entry.launchAngleHorizontal);
  if (launchH !== 0 || entry.launchAngleHorizontal === 0) {
    return launchH;
  }
  return f(entry.initialAngle);
}

/**
 * Lightweight ballistic / homing approximation for authoring visualization only.
 * Does not execute UnitTaskAutomata or bullet_action_hash pipelines (see docs under docs/).
 */
export function simulateTrajectory(
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
): TrajectoryResult {
  const warnings: string[] = [
    "Visualization approximates physics only — bullet_action_hash / UnitTaskAutomata paths are not simulated.",
  ];

  const moveType = Math.trunc(f(entry.moveType, 255));
  const lifetimeRaw = Math.max(Math.abs(f(entry.lifetime)), Math.abs(f(entry.durationFrame)), 1);
  if (lifetimeRaw > MAX_SIM_FRAMES) {
    pushWarningOnce(
      warnings,
      `Lifetime too large (${lifetimeRaw.toFixed(0)}). Clamped to ${MAX_SIM_FRAMES} frames for preview stability.`,
    );
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

  let hitFrame = maxSimFrames;

  const launchAngleH = degToRad(normalizeAngleDeg(resolveHorizontalLaunchDeg(entry)));
  const launchAngleV = degToRad(normalizeAngleDeg(f(entry.elevationAngle)));

  const dirX = Math.sin(launchAngleH) * Math.cos(launchAngleV);
  const dirY = Math.sin(launchAngleV);
  const dirZ = Math.cos(launchAngleH) * Math.cos(launchAngleV);
  const [ndx, ndy, ndz] = vec3Normalize(dirX, dirY, dirZ);

  const speed = clamp(Math.abs(f(entry.initialSpeed)), 0, SAFE_MAX_SPEED);
  const accel = clamp(f(entry.speedAcceleration), -SAFE_MAX_ACCEL, SAFE_MAX_ACCEL);
  let gravity = clamp(f(entry.gravityRate), -SAFE_MAX_GRAVITY, SAFE_MAX_GRAVITY);
  if (gravity < 0) {
    pushWarningOnce(
      warnings,
      "Detected negative gravityRate. Flipped to downward gravity for stable preview (avoids inverted parabola).",
    );
    gravity = Math.abs(gravity);
  }
  const homingStr = clamp(Math.abs(f(entry.homingStrength)), 0, 1);
  const turnRate = degToRad(clamp(Math.abs(f(entry.turnRate)), 0, 180));
  const homingDur = clamp(Math.round(Math.abs(f(entry.homingDuration))), 0, maxSimFrames);

  const positions = new Float32Array(maxSimFrames * 3);
  const targetPositions = new Float32Array(maxSimFrames * 3);
  let px = 0,
    py = 0,
    pz = 0;
  let vx = ndx * speed,
    vy = ndy * speed,
    vz = ndz * speed;

  let actualFrames = maxSimFrames;

  switch (moveType) {
    case 4: {
      actualFrames = simulateAnchor(
        positions,
        targetPositions,
        maxSimFrames,
        entry,
        scenario,
        warnings,
      );
      if (f(entry.effectiveRange) > 0 && actualFrames < maxSimFrames) {
        warnings.push(
          "Trajectory clipped at effectiveRange (ShouldCancel-style distance from origin).",
        );
      }
      hitFrame = Math.min(hitFrame, Math.max(0, actualFrames - 1));
      break;
    }
    default:
      for (let frame = 0; frame < maxSimFrames; frame++) {
        const [targetX, targetY, targetZ] = computeScenarioTargetPosition(scenario, frame);
        targetPositions[frame * 3] = targetX;
        targetPositions[frame * 3 + 1] = targetY;
        targetPositions[frame * 3 + 2] = targetZ;

        positions[frame * 3] = px;
        positions[frame * 3 + 1] = py;
        positions[frame * 3 + 2] = pz;

        const distOrigin = vec3Len(px, py, pz);
        if (effectiveRange > 0 && distOrigin >= effectiveRange && frame > 0) {
          actualFrames = frame + 1;
          warnings.push(
            "Trajectory clipped at effectiveRange (ShouldCancel-style distance from origin).",
          );
          break;
        }

        const curSpeed = vec3Len(vx, vy, vz);

        if (homingStr > 0 && frame < homingDur && curSpeed > 1e-6) {
          const toTargetX = targetX - px;
          const toTargetY = targetY - py;
          const toTargetZ = targetZ - pz;
          const [ttx, tty, ttz] = vec3Normalize(toTargetX, toTargetY, toTargetZ);

          const blend = Math.min(homingStr, 1.0);
          const maxTurn = turnRate > 0 ? turnRate : 0.1;
          const effectiveBlend = Math.min(blend, maxTurn);

          vx = vx * (1 - effectiveBlend) + ttx * curSpeed * effectiveBlend;
          vy = vy * (1 - effectiveBlend) + tty * curSpeed * effectiveBlend;
          vz = vz * (1 - effectiveBlend) + ttz * curSpeed * effectiveBlend;

          const newSpeed = vec3Len(vx, vy, vz);
          if (newSpeed > 1e-6) {
            const scale = curSpeed / newSpeed;
            vx *= scale;
            vy *= scale;
            vz *= scale;
          }
        }

        if (accel !== 0) {
          const spd = vec3Len(vx, vy, vz);
          if (spd > 1e-6) {
            const newSpeed = spd + accel;
            if (newSpeed > 0) {
              const scale = newSpeed / spd;
              vx *= scale;
              vy *= scale;
              vz *= scale;
            }
          }
        }

        vy -= gravity;

        px += vx;
        py += vy;
        pz += vz;

        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
          actualFrames = Math.max(1, frame + 1);
          pushWarningOnce(
            warnings,
            "Detected invalid numeric conversion during simulation. Trajectory was truncated to the last valid frame.",
          );
          break;
        }

        const distToTarget = vec3Len(px - targetX, py - targetY, pz - targetZ);
        const hitRadius = maxRange > 0 ? maxRange : 2.0;
        if (distToTarget < hitRadius && frame > 5) {
          hitFrame = Math.min(hitFrame, frame);
        }
      }
      break;
  }

  if (hitFrame >= maxSimFrames) {
    const hitRadius = maxRange > 0 ? maxRange : 2.0;
    for (let frame = 0; frame < actualFrames; frame++) {
      const projectileX = positions[frame * 3];
      const projectileY = positions[frame * 3 + 1];
      const projectileZ = positions[frame * 3 + 2];
      const targetX = targetPositions[frame * 3];
      const targetY = targetPositions[frame * 3 + 1];
      const targetZ = targetPositions[frame * 3 + 2];
      const distToTarget = vec3Len(
        projectileX - targetX,
        projectileY - targetY,
        projectileZ - targetZ,
      );
      if (distToTarget < hitRadius && frame > 2) {
        hitFrame = frame;
        break;
      }
    }
  }

  const trimmed =
    actualFrames < maxSimFrames ? positions.subarray(0, actualFrames * 3) : positions;
  const trimmedTargets =
    actualFrames < maxSimFrames
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
    moveTypeLabel: MOVE_TYPE_LABELS[moveType] ?? `Unknown (${moveType})`,
    warnings,
  };
}

function simulateAnchor(
  positions: Float32Array,
  targetPositions: Float32Array,
  totalFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
  warnings: string[],
): number {
  const [baseX, baseY, baseZ] = computeScenarioTargetPosition(scenario, 0);
  const targetDistance = Math.max(1, vec3Len(baseX, baseY, baseZ));
  const maxDistance = clamp(Math.abs(f(entry.maxDistance)), 0, SAFE_MAX_DISTANCE);
  const reach = Math.min(targetDistance * 0.8, maxDistance || targetDistance * 0.8);
  const speed = clamp(Math.abs(f(entry.initialSpeed, 2)), 0.1, SAFE_MAX_SPEED);
  const extendFrames = clamp(Math.ceil(reach / speed), 1, totalFrames);
  const retractStart = Math.min(extendFrames + 30, totalFrames - 1);

  const effectiveRange = clamp(Math.abs(f(entry.effectiveRange)), 0, SAFE_MAX_DISTANCE);
  let clipFrame = totalFrames;

  for (let frame = 0; frame < totalFrames; frame++) {
    const [targetX, targetY, targetZ] = computeScenarioTargetPosition(scenario, frame);
    targetPositions[frame * 3] = targetX;
    targetPositions[frame * 3 + 1] = targetY;
    targetPositions[frame * 3 + 2] = targetZ;

    let t: number;
    if (frame < extendFrames) {
      t = frame / Math.max(extendFrames, 1);
    } else if (frame < retractStart) {
      t = 1.0;
    } else {
      const retractProgress = (frame - retractStart) / Math.max(totalFrames - retractStart, 1);
      t = 1.0 - retractProgress;
    }

    const anchorX = targetX * 0.82;
    const anchorY = targetY * 0.82;
    const anchorZ = targetZ * 0.82;
    const swing = Math.sin(t * Math.PI) * reach * 0.15;
    const px = anchorX * t + swing;
    const py = anchorY * t + Math.sin(t * Math.PI * 0.5) * reach * 0.1;
    const pz = anchorZ * t;

    positions[frame * 3] = px;
    positions[frame * 3 + 1] = py;
    positions[frame * 3 + 2] = pz;

    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      clipFrame = Math.max(1, frame + 1);
      pushWarningOnce(
        warnings,
        "Detected invalid numeric conversion in anchor motion. Trajectory was truncated to the last valid frame.",
      );
      break;
    }

    if (effectiveRange > 0 && vec3Len(px, py, pz) >= effectiveRange && frame > 0) {
      clipFrame = frame + 1;
      break;
    }
  }

  return clipFrame;
}
