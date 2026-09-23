import type { CSSProperties } from "react";
import type { NodeKind } from "@/services/missionGraph/graph";
import { isNoGoKind, isPlannedKind } from "@/services/missionGraph/planned";

export const MISSION_SCHEMES = ["zinc", "teal", "sky", "ember"] as const;
export type MissionScheme = (typeof MISSION_SCHEMES)[number];
export type SchemeRole = "accent" | "opening" | "phase" | "end" | "action" | "planned" | "nogo";

export interface SchemePalette extends Record<SchemeRole, string> {}

const STORAGE_KEY = "mission-node-editor.scheme";

export const SCHEME_PALETTES: Record<MissionScheme, SchemePalette> = {
  zinc: {
    accent: "#d4d4d8",
    opening: "#e4e4e7",
    phase: "#a1a1aa",
    end: "#71717a",
    action: "#c4c4cc",
    planned: "#c4a35a",
    nogo: "#d07272",
  },
  teal: {
    accent: "#4aa89c",
    opening: "#5bb7ab",
    phase: "#3d9086",
    end: "#7e8c89",
    action: "#4aa89c",
    planned: "#c4a35a",
    nogo: "#d07272",
  },
  sky: {
    accent: "#6b8cbf",
    opening: "#7d9bd0",
    phase: "#5878a8",
    end: "#838a96",
    action: "#6b8cbf",
    planned: "#c4a35a",
    nogo: "#d07272",
  },
  ember: {
    accent: "#c4a36a",
    opening: "#d2b27a",
    phase: "#a88b58",
    end: "#8e877c",
    action: "#c4a36a",
    planned: "#c4a35a",
    nogo: "#d07272",
  },
};

export function isMissionScheme(value: string): value is MissionScheme {
  return (MISSION_SCHEMES as readonly string[]).includes(value);
}

export function readMissionScheme(): MissionScheme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isMissionScheme(stored)) return stored;
  } catch {
    /* localStorage may be unavailable in some test hosts */
  }
  return "zinc";
}

export function writeMissionScheme(scheme: MissionScheme) {
  try { window.localStorage.setItem(STORAGE_KEY, scheme); } catch { /* ignore quota / privacy mode */ }
}

export function schemeCssVars(scheme: MissionScheme): CSSProperties {
  const palette = SCHEME_PALETTES[scheme];
  return {
    "--scheme-accent": palette.accent,
    "--scheme-opening": palette.opening,
    "--scheme-phase": palette.phase,
    "--scheme-end": palette.end,
    "--scheme-action": palette.action,
    "--scheme-planned": palette.planned,
    "--scheme-nogo": palette.nogo,
  } as CSSProperties;
}

export function accentRole(kind: NodeKind): Exclude<SchemeRole, "accent"> {
  if (kind === "start") return "opening";
  if (kind === "condition") return "phase";
  if (kind === "end") return "end";
  if (isNoGoKind(kind)) return "nogo";
  if (isPlannedKind(kind)) return "planned";
  return "action";
}

export function kindAccentStyle(kind: NodeKind): CSSProperties {
  return { "--node-accent": `var(--scheme-${accentRole(kind)})` } as CSSProperties;
}

export function kindColor(kind: NodeKind, scheme: MissionScheme): string {
  return SCHEME_PALETTES[scheme][accentRole(kind)];
}
