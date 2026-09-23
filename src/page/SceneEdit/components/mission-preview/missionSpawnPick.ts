import type * as THREE from "three";

/** Set on the spawn-marker group. Child meshes inherit it by walking parents. */
export const MISSION_SPAWN_SLOT_KEY = "missionSpawnSlot";
export const MISSION_SPAWN_SELECTED_KEY = "missionSpawnSelected";

export interface MissionPickHit {
  object: THREE.Object3D;
  distance: number;
}

export interface MissionSpawnTag {
  slot: number;
  selected: boolean;
}

export function tagMissionSpawn(object: THREE.Object3D, slot: number, selected: boolean): void {
  object.userData[MISSION_SPAWN_SLOT_KEY] = slot;
  object.userData[MISSION_SPAWN_SELECTED_KEY] = selected;
}

export function readMissionSpawnTag(object: THREE.Object3D): MissionSpawnTag | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const slot = current.userData?.[MISSION_SPAWN_SLOT_KEY];
    if (typeof slot === "number") {
      return {
        slot,
        selected: current.userData[MISSION_SPAWN_SELECTED_KEY] === true,
      };
    }
    current = current.parent;
  }
  return null;
}

/**
 * Which spawn, if any, owns this click.
 *
 * The nearest spawn in front of other geometry wins. A spawn that is already
 * selected also wins when the ray continues into the map: its silhouette is
 * drawn on top, so the map triangle behind it must not become the selection.
 * A spawn that is only geometrically behind the map does not steal the click.
 */
export function frontMissionSpawnSlot(
  intersections: readonly MissionPickHit[],
): number | null {
  let nearestSpawn: { slot: number; distance: number } | null = null;
  let selectedHit: { slot: number; distance: number } | null = null;
  let nearestOther = Number.POSITIVE_INFINITY;

  for (const hit of intersections) {
    const tag = readMissionSpawnTag(hit.object);
    if (!tag) {
      if (hit.distance < nearestOther) nearestOther = hit.distance;
      continue;
    }
    if (tag.selected && (!selectedHit || hit.distance < selectedHit.distance)) {
      selectedHit = { slot: tag.slot, distance: hit.distance };
    }
    if (!nearestSpawn || hit.distance < nearestSpawn.distance) {
      nearestSpawn = { slot: tag.slot, distance: hit.distance };
    }
  }

  if (nearestSpawn && nearestSpawn.distance <= nearestOther) return nearestSpawn.slot;
  if (selectedHit) return selectedHit.slot;
  return null;
}
