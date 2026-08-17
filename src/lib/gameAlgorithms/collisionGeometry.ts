/**
 * Game-accurate collision volume computation.
 * Binary-proven schema from docs/hitbox-research/02-hitbox-volume-engine.md
 * (vsac27_Release.exe, sphere constructor sub_14066A8E0, placement sub_140669D30).
 *
 * A hitgroupiddef row defines ONE SPHERE in bone space:
 *   center = (centerX, centerY, centerZ)  -- Z is the forward offset
 *   radius = sphereRadius                 -- untransformed by the bone matrix
 * The sphere is attached to bone `boneId` on the skeleton selected by `modelHash`.
 * When shapeMode === 1 the engine sweeps a capsule between the previous-frame and
 * current-frame centers; the first frame after activation is always a static sphere.
 * `interactionId` is a foreign key to interactionid.entryId: arming an interaction
 * via MSC func_148 activates every class-0 row whose interactionId matches.
 */

import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";
import type { Vec3 } from "./vec3";

function field(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

function fieldFloat(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0.0;
}

/** shapeMode (0x7395D184): 0 = static sphere, 1 = frame-swept capsule. */
export type ShapeMode = 0 | 1;

export const SHAPE_MODE_LABELS: Record<ShapeMode, string> = {
  0: "Static sphere",
  1: "Frame-swept capsule",
};

/** collisionFlags (0xF89A41E1) is the row class (02 §6). */
export const COLLISION_FLAG_LABELS: Record<number, string> = {
  0: "Attack (keyed by interaction FK)",
  1: "Hurtbox (keyed by model hash)",
  2: "Third class",
};

export interface HitVolume {
  /** Sphere center in bone space: (centerX, centerY, centerZ-forward). */
  center: Vec3;
  /** Sphere radius (f32), untransformed by the bone matrix. */
  sphereRadius: number;
  /** FK to interactionid.entryId (class-0 rows); sentinel 1 on hurtbox rows. */
  interactionId: number;
  /** Attachment bone id, resolved through the skeleton bone-id map. */
  boneId: number;
  /** Actor/model selector: decides which skeleton the sphere attaches to. */
  modelHash: number;
  /** 0 = static sphere, 1 = frame-swept capsule. */
  shapeMode: ShapeMode;
  /** Row class: 0 = attack, 1 = hurtbox, 2 = third class. */
  collisionFlags: number;
  /** Not part of volume construction; read from the last row per group (02 §7). */
  hitType: number;
}

export function getHitVolume(entry: TypedParamEntry): HitVolume {
  return {
    center: [
      fieldFloat(entry, "centerX"),
      fieldFloat(entry, "centerY"),
      fieldFloat(entry, "centerZ"),
    ],
    sphereRadius: fieldFloat(entry, "sphereRadius"),
    interactionId: field(entry, "interactionId"),
    boneId: field(entry, "boneId"),
    modelHash: field(entry, "modelHash"),
    shapeMode: field(entry, "shapeMode") === 1 ? 1 : 0,
    collisionFlags: field(entry, "collisionFlags"),
    hitType: field(entry, "hitType"),
  };
}

/**
 * Bounding sphere radius around the bone origin that encloses the volume.
 * The swept-capsule endpoints depend on animation, so the static per-row
 * bound is |center| + radius (the first active frame is always a sphere).
 */
export function boundingSphereRadius(volume: HitVolume): number {
  const [x, y, z] = volume.center;
  return Math.sqrt(x * x + y * y + z * z) + Math.abs(volume.sphereRadius);
}

/**
 * Groups attack rows (collisionFlags === 0) by their interactionid foreign key.
 * Rows sharing an interactionId form the sphere set activated together by one
 * MSC func_148 call; other row classes are returned under their own FK value.
 */
export function groupVolumesByInteraction(
  entries: TypedParamEntry[],
): Map<number, { interactionId: number; volumes: Array<{ index: number; volume: HitVolume }> }> {
  const groups = new Map<
    number,
    { interactionId: number; volumes: Array<{ index: number; volume: HitVolume }> }
  >();

  entries.forEach((entry, index) => {
    const volume = getHitVolume(entry);
    const key = volume.interactionId;

    if (!groups.has(key)) {
      groups.set(key, { interactionId: key, volumes: [] });
    }
    groups.get(key)!.volumes.push({ index, volume });
  });

  return groups;
}

/**
 * Sphere/capsule coverage facts for one row, in the terms an author reasons about.
 *
 * Intersection is `dist² < (r_att + r_def)²` (02 §5): a single sphere reaches
 * `r_att + r_def` in every direction. When shapeMode === 1 the engine sweeps a
 * capsule along the animation between frames, so the blade "volume" is the sweep
 * of this sphere — a horizontal slash covers a wide horizontal arc but its OFF-sweep
 * (e.g. vertical) reach is still just `r_att + r_def`. That is why a horizontal
 * saber does not hit things above/below outside that band; there is no long static
 * capsule pre-placed along the blade.
 */
export interface SweepCoverage {
  radius: number;
  /** Full extent of one static sphere along any axis (2 × radius). */
  diameter: number;
  /** Reach along the bone-forward axis from the bone origin (centerZ + radius). */
  forwardReach: number;
  shapeMode: ShapeMode;
  isSwept: boolean;
  summary: string;
}

/**
 * Off-sweep hit reach against an opponent hurt sphere of the given radius: the
 * band a horizontal slash covers vertically is `r_att + r_def`, independent of sweep.
 */
export function verticalHitReach(volume: HitVolume, opponentHurtRadius: number): number {
  return Math.abs(volume.sphereRadius) + Math.abs(opponentHurtRadius);
}

export function describeSweepCoverage(volume: HitVolume): SweepCoverage {
  const radius = Math.abs(volume.sphereRadius);
  const forwardReach = volume.center[2] + radius;
  const isSwept = volume.shapeMode === 1;
  const summary = isSwept
    ? `Swept capsule (r=${radius}): the hit volume is the animation sweep of this sphere; ` +
      `off-sweep reach (e.g. vertical during a horizontal slash) is only r_att + r_def.`
    : `Static sphere (r=${radius}): covers a ${(radius * 2).toFixed(1)} diameter around bone ` +
      `${volume.boneId}, reaching ${forwardReach.toFixed(1)} forward.`;
  return {
    radius,
    diameter: radius * 2,
    forwardReach,
    shapeMode: volume.shapeMode,
    isSwept,
    summary,
  };
}
