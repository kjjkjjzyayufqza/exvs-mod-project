/**
 * Game-accurate collision volume computation.
 * Derived from hitgroupiddef field analysis and entity position resolver
 * functions sub_1403643B0 and sub_140379EA0 in vsac27_Release.exe.
 *
 * Hit groups define collision volumes (spheres/capsules) attached to bones.
 * The game uses bone_hash to attach volumes to character model bones,
 * and parent_bone_hash for hierarchical collision chains.
 */

import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";
import { type Vec3, vec3Add, vec3Scale } from "./vec3";

function field(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

function fieldFloat(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0.0;
}

export type HitVolumeType = 0 | 1 | 2 | 3;

export const HIT_TYPE_LABELS: Record<HitVolumeType, string> = {
  0: "Sphere",
  1: "Capsule (vertical)",
  2: "Capsule (horizontal)",
  3: "Box",
};

export const COLLISION_FLAG_LABELS: Record<number, string> = {
  0: "Normal",
  1: "Intangible",
  2: "Super armor",
};

export interface HitVolume {
  hitType: HitVolumeType;
  offset: Vec3;
  scale: Vec3;
  radius: number;
  jointOffset: number;
  boneHash: number;
  parentBoneHash: number;
  modelHash: number;
  enableState: boolean;
  collisionFlags: number;
  groupId: number;
}

export interface HitVolumeGeometry {
  type: "sphere" | "capsule" | "box";
  center: Vec3;
  radius: number;
  height: number;
  halfExtents: Vec3;
}

export function getHitVolume(entry: TypedParamEntry): HitVolume {
  return {
    hitType: field(entry, "hitType") as HitVolumeType,
    offset: [
      fieldFloat(entry, "offsetX"),
      fieldFloat(entry, "offsetY"),
      fieldFloat(entry, "offsetZ"),
    ],
    scale: [
      fieldFloat(entry, "scaleX"),
      fieldFloat(entry, "scaleY"),
      fieldFloat(entry, "scaleZ"),
    ],
    radius: fieldFloat(entry, "radius"),
    jointOffset: fieldFloat(entry, "jointOffset"),
    boneHash: field(entry, "boneHash"),
    parentBoneHash: field(entry, "parentBoneHash"),
    modelHash: field(entry, "modelHash"),
    enableState: field(entry, "enableState") !== 0,
    collisionFlags: field(entry, "collisionFlags"),
    groupId: fieldFloat(entry, "groupId"),
  };
}

/**
 * Computes the renderable geometry for a hit volume.
 * The game computes collision shapes from bone position + offset + scale + radius.
 */
export function computeHitVolumeGeometry(volume: HitVolume): HitVolumeGeometry {
  const center: Vec3 = [...volume.offset];

  switch (volume.hitType) {
    case 0:
      return {
        type: "sphere",
        center,
        radius: Math.abs(volume.radius),
        height: 0,
        halfExtents: [0, 0, 0],
      };
    case 1:
      return {
        type: "capsule",
        center,
        radius: Math.abs(volume.radius),
        height: Math.abs(volume.scale[0]),
        halfExtents: [0, 0, 0],
      };
    case 2:
      return {
        type: "capsule",
        center,
        radius: Math.abs(volume.radius),
        height: Math.abs(volume.scale[0]),
        halfExtents: [0, 0, 0],
      };
    case 3:
      return {
        type: "box",
        center,
        radius: 0,
        height: 0,
        halfExtents: [
          Math.abs(volume.scale[0]) * 0.5,
          Math.abs(volume.scale[1]) * 0.5,
          Math.abs(volume.scale[2]) * 0.5,
        ],
      };
    default:
      return {
        type: "sphere",
        center,
        radius: Math.abs(volume.radius),
        height: 0,
        halfExtents: [0, 0, 0],
      };
  }
}

/**
 * Computes the bounding sphere radius that encompasses the entire hit volume.
 * Used for broad-phase collision detection.
 */
export function boundingSphereRadius(volume: HitVolume): number {
  const geo = computeHitVolumeGeometry(volume);

  switch (geo.type) {
    case "sphere":
      return geo.radius;
    case "capsule":
      return geo.radius + geo.height * 0.5;
    case "box": {
      const [hx, hy, hz] = geo.halfExtents;
      return Math.sqrt(hx * hx + hy * hy + hz * hz);
    }
    default:
      return 0;
  }
}

/**
 * Groups hit volume entries by their group_id for organized display.
 */
export function groupHitVolumes(
  entries: TypedParamEntry[],
): Map<number, { groupId: number; volumes: Array<{ index: number; volume: HitVolume }> }> {
  const groups = new Map<number, { groupId: number; volumes: Array<{ index: number; volume: HitVolume }> }>();

  entries.forEach((entry, index) => {
    const volume = getHitVolume(entry);
    const gid = volume.groupId;

    if (!groups.has(gid)) {
      groups.set(gid, { groupId: gid, volumes: [] });
    }
    groups.get(gid)!.volumes.push({ index, volume });
  });

  return groups;
}

/**
 * Returns the bone hierarchy chain for a hit volume.
 * Walks parent_bone_hash references until root (hash = 0) or max depth.
 */
export function getBoneHierarchy(
  entries: TypedParamEntry[],
  startIndex: number,
  maxDepth: number = 16,
): Array<{ index: number; boneHash: number; parentBoneHash: number }> {
  const chain: Array<{ index: number; boneHash: number; parentBoneHash: number }> = [];
  const visited = new Set<number>();
  let currentIndex = startIndex;

  for (let depth = 0; depth < maxDepth; depth++) {
    if (currentIndex < 0 || currentIndex >= entries.length) break;
    if (visited.has(currentIndex)) break;
    visited.add(currentIndex);

    const vol = getHitVolume(entries[currentIndex]!);
    chain.push({
      index: currentIndex,
      boneHash: vol.boneHash,
      parentBoneHash: vol.parentBoneHash,
    });

    if (vol.parentBoneHash === 0) break;

    const parentIndex = entries.findIndex((e) => {
      const parentVol = getHitVolume(e);
      return parentVol.boneHash === vol.parentBoneHash;
    });

    if (parentIndex < 0) break;
    currentIndex = parentIndex;
  }

  return chain;
}
