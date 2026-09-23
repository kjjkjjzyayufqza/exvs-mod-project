import type { MissionGraph } from "./graph";
import { derivePhaseProjection } from "./projection";
import type { MissionDeployPhase, MissionSpawnMarker } from "@/services/missionPreview/missionPreviewService";

export interface SpawnTransform {
  x: number;
  y: number;
  z: number;
  facing: number;
}

const SPAWN_X = 34;
const SPAWN_Y = 35;
const SPAWN_Z = 36;
const SPAWN_FACING = 38;

/** Whole degrees stored on a unit slot stay inside a full turn. */
export function clampSpawnFacing(degrees: number): number {
  let facing = Math.round(degrees);
  while (facing > 360) facing -= 360;
  while (facing < -360) facing += 360;
  return facing;
}

export function signedSlotWord(word: number): number {
  return word | 0;
}

export function slotUsesExternalCoordinates(graph: MissionGraph, slot: number): boolean {
  const row = graph.slots.find((entry) => entry.params[0] === slot);
  return !!row && row.params[33] !== 0;
}

function slotSpawn(params: readonly number[]): SpawnTransform {
  return {
    x: signedSlotWord(params[SPAWN_X] ?? 0),
    y: signedSlotWord(params[SPAWN_Y] ?? 0),
    z: signedSlotWord(params[SPAWN_Z] ?? 0),
    facing: signedSlotWord(params[SPAWN_FACING] ?? 0),
  };
}

/**
 * Write a map drag onto this unit's Spawn X/Y/Z and facing words.
 * Returns null when the slot is missing, uses external coordinates, or the
 * rounded values are already stored.
 */
export function commitSpawnTransform(graph: MissionGraph, slot: number, next: SpawnTransform): MissionGraph | null {
  if (slotUsesExternalCoordinates(graph, slot)) return null;
  const row = graph.slots.find((entry) => entry.params[0] === slot);
  if (!row) return null;
  const current = slotSpawn(row.params);
  const x = Math.round(next.x);
  const y = Math.round(next.y);
  const z = Math.round(next.z);
  const facing = clampSpawnFacing(next.facing);
  if (current.x === x && current.y === y && current.z === z && current.facing === facing) return null;
  const params = [...row.params];
  params[SPAWN_X] = x >>> 0;
  params[SPAWN_Y] = y >>> 0;
  params[SPAWN_Z] = z >>> 0;
  params[SPAWN_FACING] = facing >>> 0;
  return {
    ...graph,
    slots: graph.slots.map((entry) => entry.params[0] === slot ? { ...entry, params } : entry),
  };
}

/** Project the authoring graph into the same markers the read-only preview draws. */
export function markersFromGraph(graph: MissionGraph): MissionSpawnMarker[] {
  const projection = derivePhaseProjection(graph);
  const openingSlots = new Set(
    projection.opening?.actions.filter((action) => action.kind === "deploy" && action.slot !== undefined).map((action) => action.slot!) ?? [],
  );
  const waveBySlot = new Map<number, MissionDeployPhase>();
  projection.phases.forEach((phase, waveIndex) => {
    const enemiesAliveAtMost = phase.trigger.kind === "enemies_alive_at_most" ? phase.trigger.value : 0;
    for (const action of phase.actions) {
      if (action.kind !== "deploy" || action.slot === undefined || waveBySlot.has(action.slot)) continue;
      waveBySlot.set(action.slot, {
        kind: "wave",
        waveIndex,
        enemiesAliveAtMost,
        delaySeconds: phase.delaySeconds,
      });
    }
  });
  return graph.slots.map((slot) => {
    const slotId = slot.params[0];
    const point = slotSpawn(slot.params);
    const phase: MissionDeployPhase = waveBySlot.get(slotId) ?? (openingSlots.has(slotId) ? { kind: "opening" } : { kind: "initial" });
    return {
      key: `mission-slot-${slotId}`,
      slot: slotId,
      unitId: slot.params[2] >>> 0,
      team: slot.params[3],
      isCpuPartner: slot.params[5] === 1,
      position: [point.x, point.y, point.z],
      facingDegrees: point.facing,
      introAction: slot.params[37] | 0,
      introActionFrames: slot.params[39] | 0,
      aiLevel: slot.params[20] | 0,
      phase,
    };
  });
}
