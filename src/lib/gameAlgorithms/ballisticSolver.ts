import { type Vec3, vec3Sub, vec3Length, vec3HorizontalDist, degToRad } from "./vec3";

/**
 * Game-accurate ballistic launch angle solver.
 * Ported from sub_1405C42E0 in vsac27_Release.exe.
 *
 * Solves the quadratic equation for projectile launch angle given:
 * - source/target positions
 * - initial speed (muzzle velocity)
 * - gravity constant
 * - high/low arc selection
 *
 * Returns the launch angle in radians, clamped to the game's max per arc type.
 */
export function ballisticAngleSolver(
  source: Vec3,
  target: Vec3,
  initialSpeed: number,
  gravity: number,
  highArc: boolean,
): number {
  const delta = vec3Sub(target, source);
  const dist = Math.max(0.0001, vec3Length(delta));

  const gTerm = (dist * dist * gravity) / (2.0 * initialSpeed * initialSpeed);

  const dy = delta[1];
  const discriminant = Math.max(
    0,
    dist * dist - (dy + gTerm) * (gTerm * 4.0),
  );

  const maxAngle = highArc ? 1.5 : 0.8;
  const sign = highArc ? 1.0 : -1.0;

  let sqrtDisc = 0;
  if (discriminant >= 0) {
    sqrtDisc = Math.sqrt(discriminant);
  }

  return Math.min(maxAngle, Math.atan2(sqrtDisc * sign + dist, gTerm + gTerm));
}

/**
 * Game-accurate gravity target offset.
 * Ported from sub_140606BB0 in vsac27_Release.exe.
 *
 * Modifies target position to account for gravity drop along the projectile path.
 * Uses tan(launchAngle) * horizontalDistance to predict the Y offset.
 */
export function gravityTargetOffset(
  unitPos: Vec3,
  targetPos: Vec3,
  gravityRate: number,
  turnRate: number,
  useHighArc: boolean,
): Vec3 {
  const delta = vec3Sub(targetPos, unitPos);
  const horizDist = vec3HorizontalDist(delta);

  const launchAngle = ballisticAngleSolver(
    unitPos,
    targetPos,
    turnRate,
    gravityRate,
    useHighArc,
  );
  const tanAngle = Math.tan(launchAngle);

  const result: Vec3 = [...targetPos];
  result[1] = tanAngle * horizDist + unitPos[1];
  return result;
}

/**
 * Game-accurate ballistic trajectory step.
 * Ported from sub_1405B5040 in vsac27_Release.exe.
 *
 * Computes the midpoint of a ballistic arc given source, target, gravity, and turn rate.
 * Uses sin²(angle) / (2*gravity) as the peak height formula.
 */
export function ballisticTrajectoryMidpoint(
  source: Vec3,
  target: Vec3,
  gravityRate: number,
  turnRate: number,
): Vec3 {
  const launchAngle = ballisticAngleSolver(source, target, turnRate, gravityRate, true);

  const sinAngle = Math.sin(launchAngle);
  const peakHeight = Math.pow(sinAngle * turnRate, 2.0) / (gravityRate + gravityRate);

  const midY = (source[1] + target[1]) * 0.5;

  const result: Vec3 = [
    (source[0] + target[0]) * 0.5,
    peakHeight + midY,
    (source[2] + target[2]) * 0.5,
  ];
  return result;
}

/**
 * Game-accurate spawn offset calculation.
 * Ported from sub_1405C4400 in vsac27_Release.exe.
 *
 * Reads angular offsets and converts degrees→radians, then applies 3D rotation
 * to compute the bullet spawn position relative to the unit.
 *
 * @param spawnOffsetForward - horizontal angular offset (degrees, converted to radians)
 * @param horizontalAimAngle - horizontal aim angle (degrees, converted to radians)
 * @param verticalLaunchAngle - vertical launch position offset
 * @param offsetAngleHorizontal - horizontal positional offset
 * @param offsetAngleVertical - vertical angular offset (degrees, converted to radians)
 * @param unitForward - unit's facing direction
 */
export function computeSpawnOffset(
  spawnOffsetForward: number,
  horizontalAimAngle: number,
  verticalLaunchAngle: number,
  offsetAngleHorizontal: number,
  offsetAngleVertical: number,
): { angleRadH: number; angleRadV: number; offsets: Vec3 } {
  const angleRadH = degToRad(spawnOffsetForward);
  const angleRadV = degToRad(offsetAngleVertical);

  return {
    angleRadH,
    angleRadV,
    offsets: [offsetAngleHorizontal, verticalLaunchAngle, horizontalAimAngle],
  };
}
