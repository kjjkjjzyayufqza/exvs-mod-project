import type { TypedParamEntry } from "../param-editor/typedParamTypes";
import type { BulletPreviewScenario } from "./bulletPreviewTypes";

export interface TrajectoryResult {
  positions: Float32Array;
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

function f(v: unknown): number {
  if (typeof v === "number") return v;
  return 0;
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

  const moveType = f(entry.moveType);
  const lifetimeRaw = Math.max(f(entry.lifetime), f(entry.durationFrame), 1);
  const maxSimFrames = Math.min(Math.ceil(lifetimeRaw), 600);

  const maxRange = f(entry.maxRange);
  const effectiveRange = f(entry.effectiveRange);
  const blastRadius = f(entry.blastRadius);
  const hitboxSize: [number, number, number] = [
    f(entry.hitboxWidth),
    f(entry.hitboxHeight),
    f(entry.hitboxDepth),
  ];

  const targetPos: [number, number, number] = [
    scenario.targetOffsetX,
    scenario.targetHeight,
    scenario.targetDistance,
  ];
  let hitFrame = maxSimFrames;

  const launchAngleH = degToRad(resolveHorizontalLaunchDeg(entry));
  const launchAngleV = degToRad(f(entry.elevationAngle));

  const dirX = Math.sin(launchAngleH) * Math.cos(launchAngleV);
  const dirY = Math.sin(launchAngleV);
  const dirZ = Math.cos(launchAngleH) * Math.cos(launchAngleV);
  const [ndx, ndy, ndz] = vec3Normalize(dirX, dirY, dirZ);

  const speed = f(entry.initialSpeed);
  const accel = f(entry.speedAcceleration);
  const gravity = f(entry.gravityRate);
  const homingStr = f(entry.homingStrength);
  const turnRate = degToRad(f(entry.turnRate));
  const homingDur = f(entry.homingDuration);

  const positions = new Float32Array(maxSimFrames * 3);
  let px = 0,
    py = 0,
    pz = 0;
  let vx = ndx * speed,
    vy = ndy * speed,
    vz = ndz * speed;

  let actualFrames = maxSimFrames;

  switch (moveType) {
    case 4: {
      actualFrames = simulateAnchor(positions, maxSimFrames, entry, scenario);
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
          const toTargetX = targetPos[0] - px;
          const toTargetY = targetPos[1] - py;
          const toTargetZ = targetPos[2] - pz;
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

        const distToTarget = vec3Len(px - targetPos[0], py - targetPos[1], pz - targetPos[2]);
        const hitRadius = maxRange > 0 ? maxRange : 2.0;
        if (distToTarget < hitRadius && frame > 5) {
          hitFrame = Math.min(hitFrame, frame);
        }
      }
      break;
  }

  const trimmed =
    actualFrames < maxSimFrames ? positions.subarray(0, actualFrames * 3) : positions;

  return {
    positions: new Float32Array(trimmed),
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
  totalFrames: number,
  entry: TypedParamEntry,
  scenario: BulletPreviewScenario,
): number {
  const targetDistance = Math.max(1, vec3Len(scenario.targetOffsetX, scenario.targetHeight, scenario.targetDistance));
  const reach = Math.min(targetDistance * 0.8, f(entry.maxDistance) || targetDistance * 0.8);
  const speed = f(entry.initialSpeed) || 2.0;
  const extendFrames = Math.ceil(reach / Math.max(speed, 0.1));
  const retractStart = Math.min(extendFrames + 30, totalFrames - 30);
  const anchorX = scenario.targetOffsetX * 0.82;
  const anchorY = scenario.targetHeight * 0.82;
  const anchorZ = scenario.targetDistance * 0.82;

  const effectiveRange = f(entry.effectiveRange);
  let clipFrame = totalFrames;

  for (let frame = 0; frame < totalFrames; frame++) {
    let t: number;
    if (frame < extendFrames) {
      t = frame / Math.max(extendFrames, 1);
    } else if (frame < retractStart) {
      t = 1.0;
    } else {
      const retractProgress = (frame - retractStart) / Math.max(totalFrames - retractStart, 1);
      t = 1.0 - retractProgress;
    }

    const swing = Math.sin(t * Math.PI) * reach * 0.15;
    const px = anchorX * t + swing;
    const py = anchorY * t + Math.sin(t * Math.PI * 0.5) * reach * 0.1;
    const pz = anchorZ * t;

    positions[frame * 3] = px;
    positions[frame * 3 + 1] = py;
    positions[frame * 3 + 2] = pz;

    if (effectiveRange > 0 && vec3Len(px, py, pz) >= effectiveRange && frame > 0) {
      clipFrame = frame + 1;
      break;
    }
  }

  return clipFrame;
}
