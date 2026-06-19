/**
 * AI decision (2026-06-19): keep parsed values available, but remove reload
 * simulation claims. Delta Plus and RX-78-2 fixtures contradict the previous
 * enum labels: RX type 2 reloads in 180 frames while its overheat field is 0.
 */

import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

function field(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

export type ReloadType = 0 | 1 | 2 | 3;

export const RELOAD_TYPE_LABELS: Record<ReloadType, string> = {
  0: "Type 0 (unverified)",
  1: "Type 1 (unverified)",
  2: "Type 2 (unverified)",
  3: "Type 3 (unverified)",
};

export const RELOAD_TYPE_DESCRIPTIONS: Record<ReloadType, string> = {
  0: "Unverified enum value. Inspect raw fields and MSC reload calls.",
  1: "Unverified enum value. Inspect raw fields and MSC reload calls.",
  2: "Unverified enum value. Inspect raw fields and MSC reload calls.",
  3: "Unverified enum value. Inspect raw fields and MSC reload calls.",
};

export interface ActionTimeline {
  startupFrame: number;
  activeFrame: number;
  recoveryFrame: number;
  totalDurationFrame: number;
  cooldownFrame: number;
  landingRecoveryFrame: number;
}

export interface ReloadTimeline {
  reloadType: ReloadType;
  reloadStartFrame: number;
  reloadTimeTotal: number;
  reloadPerShotFrame: number;
  reloadLockFrame: number;
  overheatFrame: number;
  chargeFrame: number;
  fullChargeFrame: number;
  ammoReloadWaitFrame: number;
}

export function getActionTimeline(entry: TypedParamEntry): ActionTimeline {
  return {
    startupFrame: field(entry, "startupFrame"),
    activeFrame: field(entry, "activeFrame"),
    recoveryFrame: field(entry, "recoveryFrame"),
    totalDurationFrame: field(entry, "totalDurationFrame"),
    cooldownFrame: field(entry, "cooldownFrame"),
    landingRecoveryFrame: field(entry, "landingRecoveryFrame"),
  };
}

export function getReloadTimeline(entry: TypedParamEntry): ReloadTimeline {
  const reloadType = field(entry, "reloadType") as ReloadType;
  return {
    reloadType,
    reloadStartFrame: field(entry, "reloadStartFrame"),
    reloadTimeTotal: field(entry, "reloadTimeTotal"),
    reloadPerShotFrame: field(entry, "reloadPerShotFrame"),
    reloadLockFrame: field(entry, "reloadLockFrame"),
    overheatFrame: field(entry, "overheatFrame"),
    chargeFrame: field(entry, "chargeFrame"),
    fullChargeFrame: field(entry, "fullChargeFrame"),
    ammoReloadWaitFrame: field(entry, "ammoReloadWaitFrame"),
  };
}

export const CHARGE_WEAPON_TYPE_LABELS: Record<number, string> = {
  0: "None",
  1: "Standard charge",
  2: "Rare charge",
  3: "Special charge",
};

export const SHOT_TYPE_LABELS: Record<number, string> = {
  0: "Normal",
  1: "Type A",
  2: "Type B",
  3: "Type C",
};

export const CANCEL_ROUTE_LABELS: Record<number, string> = {
  0: "None",
  1: "Standard cancel",
  2: "Special cancel",
};

export const GUARD_BREAK_TYPE_LABELS: Record<number, string> = {
  0: "None",
  1: "Light",
  2: "Medium",
  3: "Heavy",
  4: "Unblockable",
};

export const LANDING_BEHAVIOR_LABELS: Record<number, string> = {
  1: "Normal landing",
  2: "Slide landing",
  4: "Heavy landing",
  6: "Float landing",
};

export const BULLET_TYPE_LABELS: Record<number, string> = {
  0: "Standard",
  1: "Beam",
  2: "Physical",
  3: "Melee slash",
  4: "Explosive",
  5: "Electric",
  6: "Fire",
  7: "Ice",
  8: "Sonic",
  9: "Special A",
  10: "Special B",
  11: "Special C",
  12: "Special D",
};
