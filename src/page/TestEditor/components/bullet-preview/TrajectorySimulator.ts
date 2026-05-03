import type { TypedParamEntry } from "../param-editor/typedParamTypes";

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
  0: "Standard Missile",
  1: "Throw Projectile",
  2: "Funnel Flight",
  3: "Funnel Approach",
  4: "Anchor / Chain",
  5: "FunnelFlysword",
  6: "Attach Change",
  7: "Funnel Throw",
  255: "Generic Projectile",
};

export function simulateTrajectory(
  entry: TypedParamEntry,
  targetDistance: number,
): TrajectoryResult {
  const moveType = f(entry.moveType);
  const lifetime = Math.max(f(entry.lifetime), f(entry.durationFrame), 60);
  const totalFrames = Math.min(lifetime, 600);
  const positions = new Float32Array(totalFrames * 3);

  const maxRange = f(entry.maxRange);
  const effectiveRange = f(entry.effectiveRange);
  const blastRadius = f(entry.blastRadius);
  const hitboxSize: [number, number, number] = [
    f(entry.hitboxWidth),
    f(entry.hitboxHeight),
    f(entry.hitboxDepth),
  ];

  const targetPos: [number, number, number] = [0, 0, targetDistance];
  let hitFrame = totalFrames;

  const launchAngleH = degToRad(f(entry.initialAngle));
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

  let px = 0, py = 0, pz = 0;
  let vx = ndx * speed, vy = ndy * speed, vz = ndz * speed;

  switch (moveType) {
    case 4:
      simulateAnchor(positions, totalFrames, entry, targetDistance);
      break;
    default:
      for (let frame = 0; frame < totalFrames; frame++) {
        positions[frame * 3] = px;
        positions[frame * 3 + 1] = py;
        positions[frame * 3 + 2] = pz;

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

        const distToTarget = vec3Len(
          px - targetPos[0],
          py - targetPos[1],
          pz - targetPos[2],
        );
        if (distToTarget < (maxRange > 0 ? maxRange : 2.0) && frame > 5) {
          hitFrame = Math.min(hitFrame, frame);
        }
      }
      break;
  }

  return {
    positions,
    totalFrames,
    hitFrame,
    maxRange,
    effectiveRange,
    blastRadius,
    hitboxSize,
    moveType,
    moveTypeLabel: MOVE_TYPE_LABELS[moveType] ?? `Unknown (${moveType})`,
  };
}

function simulateAnchor(
  positions: Float32Array,
  totalFrames: number,
  entry: TypedParamEntry,
  targetDistance: number,
): void {
  const reach = Math.min(targetDistance * 0.8, f(entry.maxDistance) || targetDistance * 0.8);
  const speed = f(entry.initialSpeed) || 2.0;
  const extendFrames = Math.ceil(reach / Math.max(speed, 0.1));
  const retractStart = Math.min(extendFrames + 30, totalFrames - 30);

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
    positions[frame * 3] = swing;
    positions[frame * 3 + 1] = Math.sin(t * Math.PI * 0.5) * reach * 0.1;
    positions[frame * 3 + 2] = t * reach;
  }
}
