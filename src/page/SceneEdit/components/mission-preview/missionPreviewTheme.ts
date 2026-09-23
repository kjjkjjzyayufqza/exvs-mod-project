/**
 * One palette for the mission overlay, shared by the viewport gizmos and the
 * details panel so a slot is the same colour in both.
 *
 * Kept out of the marker component on purpose: the panel needs the colours but
 * must not pull three.js and drei in to get them.
 *
 * Tones follow the editor convention rather than flag colours — team tints are
 * pulled off full saturation so they sit on a neutral viewport without
 * vibrating, and selection uses one warm accent that no team owns.
 */

import type { MissionDeployPhase, MissionSpawnMarker } from "@/services/missionPreview/missionPreviewService";

/** Player side. */
export const MISSION_ALLY_COLOR = "#4c8fd6";
/** Player side, CPU partner. */
export const MISSION_PARTNER_COLOR = "#54b3bd";
/** Enemy side, on the field at battle start or deployed by the opening. */
export const MISSION_ENEMY_COLOR = "#cf5a52";
/** Enemy side, one tone per later wave so a wave reads at a glance. */
export const MISSION_WAVE_COLORS = [
  "#d4883f",
  "#c2a02c",
  "#9a6dbd",
  "#bd5f86",
  "#3f9b8a",
] as const;
/** Selection accent. Deliberately not a team colour. */
export const MISSION_SELECTION_COLOR = "#f0a63c";

export function missionPhaseKey(phase: MissionDeployPhase): string {
  return phase.kind === "wave" ? `wave-${phase.waveIndex}` : phase.kind;
}

/**
 * Unit forward vector for a slot's facing angle, in map world space.
 *
 * The bytecode stores whole degrees. A facing of 0 looks down **+Z** and 180
 * looks down **-Z**: the shipped scripts put the player side at 0 on the
 * negative-Z end of the map and the enemy side at 180 on the positive-Z end,
 * so the two sides look at each other across it.
 *
 * The viewport applies this as `rotation.y = degToRad(facing)` on a gizmo
 * whose nose is authored along +Z. Getting that authoring backwards is what
 * made the first build draw every slot facing away.
 */
export function missionFacingForward(facingDegrees: number): [number, number, number] {
  const radians = (facingDegrees * Math.PI) / 180;
  return [Math.sin(radians), 0, Math.cos(radians)];
}

export function missionMarkerColor(marker: MissionSpawnMarker): string {
  if (marker.team === 0) {
    return marker.isCpuPartner ? MISSION_PARTNER_COLOR : MISSION_ALLY_COLOR;
  }
  if (marker.phase.kind === "wave") {
    return MISSION_WAVE_COLORS[marker.phase.waveIndex % MISSION_WAVE_COLORS.length];
  }
  return MISSION_ENEMY_COLOR;
}

/** Colour for a phase group header, taken from the first marker in the group. */
export function missionPhaseColor(
  phase: MissionDeployPhase,
  markers: readonly MissionSpawnMarker[],
): string {
  const first = markers[0];
  if (first) return missionMarkerColor(first);
  return phase.kind === "wave"
    ? MISSION_WAVE_COLORS[phase.waveIndex % MISSION_WAVE_COLORS.length]
    : MISSION_ENEMY_COLOR;
}
