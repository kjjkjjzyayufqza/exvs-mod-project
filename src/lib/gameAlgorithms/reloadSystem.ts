/**
 * Game-accurate weapon reload and action timeline system.
 * Ported from armsparam processing in vsac27_Release.exe.
 *
 * The weapon action system uses reload_type (0-3) to select behavior:
 *   0: Standard clip reload
 *   1: Per-shot reload (like shotguns)
 *   2: Overheat-based
 *   3: Charge-based
 *
 * Frame-based values (startup_frame, active_frame, etc.) define the weapon's
 * action timeline and are used directly as frame counters at 60fps.
 */

import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

function field(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

function fieldFloat(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0.0;
}

export type ReloadType = 0 | 1 | 2 | 3;

export const RELOAD_TYPE_LABELS: Record<ReloadType, string> = {
  0: "Standard clip",
  1: "Per-shot",
  2: "Overheat",
  3: "Charge",
};

export const RELOAD_TYPE_DESCRIPTIONS: Record<ReloadType, string> = {
  0: "Full clip reload after ammo depleted. reload_time_total frames to fully reload.",
  1: "Reload one round at a time. reload_per_shot_frame frames per round.",
  2: "Overheat after continuous fire. overheat_frame cooldown before usable again.",
  3: "Charge-based weapon. charge_frame to reach ready, full_charge_frame for max power.",
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

export interface WeaponDpsInfo {
  damagePerShot: number;
  damagePerSecond: number;
  burstDps: number;
  sustainedDps: number;
  totalBurstDamage: number;
  timeToEmptySeconds: number;
  reloadTimeSeconds: number;
  effectiveCycleSeconds: number;
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

/**
 * Computes the effective reload duration in frames for the given reload type.
 *
 * Type 0 (Standard clip): reload_time_total frames for the full clip.
 * Type 1 (Per-shot): reload_per_shot_frame * ammo_count for all rounds.
 * Type 2 (Overheat): overheat_frame is the cooldown penalty.
 * Type 3 (Charge): charge_frame is the minimum ready time.
 */
export function getEffectiveReloadFrames(entry: TypedParamEntry): number {
  const reload = getReloadTimeline(entry);
  const ammoCount = field(entry, "ammoCount");

  switch (reload.reloadType) {
    case 0:
      return reload.reloadTimeTotal;
    case 1:
      return reload.reloadPerShotFrame * Math.max(1, ammoCount);
    case 2:
      return reload.overheatFrame;
    case 3:
      return reload.chargeFrame;
    default:
      return reload.reloadTimeTotal;
  }
}

/**
 * Simulates ammo state over time for the weapon's reload type.
 * Returns an array of {frame, ammo} pairs representing the ammo curve.
 */
export function simulateAmmoTimeline(
  entry: TypedParamEntry,
  maxFrames: number = 600,
): Array<{ frame: number; ammo: number; state: "ready" | "firing" | "reloading" | "cooldown" }> {
  const ammoCount = Math.max(1, field(entry, "ammoCount"));
  const action = getActionTimeline(entry);
  const reload = getReloadTimeline(entry);
  const firingInterval = field(entry, "firingIntervalFrame");
  const bulletCountPerShot = Math.max(1, field(entry, "bulletCountPerShot"));
  const isContinuousFire = field(entry, "isContinuousFire") !== 0;

  const timeline: Array<{ frame: number; ammo: number; state: "ready" | "firing" | "reloading" | "cooldown" }> = [];
  let currentAmmo = ammoCount;
  let frame = 0;

  const shotCycleFrames = isContinuousFire
    ? Math.max(1, firingInterval)
    : action.startupFrame + action.activeFrame + action.recoveryFrame;

  while (frame < maxFrames) {
    if (currentAmmo > 0) {
      timeline.push({ frame, ammo: currentAmmo, state: "firing" });
      currentAmmo = Math.max(0, currentAmmo - bulletCountPerShot);
      frame += shotCycleFrames;
    } else {
      const reloadFrames = getEffectiveReloadFrames(entry);
      timeline.push({ frame, ammo: 0, state: "reloading" });

      if (reload.reloadType === 1) {
        for (let i = 0; i < ammoCount && frame < maxFrames; i++) {
          frame += reload.reloadPerShotFrame;
          timeline.push({ frame, ammo: i + 1, state: "reloading" });
        }
      } else {
        frame += reloadFrames;
      }

      if (reload.reloadLockFrame > 0) {
        timeline.push({ frame, ammo: ammoCount, state: "cooldown" });
        frame += reload.reloadLockFrame;
      }

      currentAmmo = ammoCount;
      timeline.push({ frame, ammo: currentAmmo, state: "ready" });
    }
  }

  return timeline;
}

/**
 * Calculates DPS metrics for a weapon entry.
 * Combines armsparam (weapon timing/ammo) with damage value.
 */
export function calculateWeaponDps(entry: TypedParamEntry, damagePerHit: number): WeaponDpsInfo {
  const ammoCount = Math.max(1, field(entry, "ammoCount"));
  const action = getActionTimeline(entry);
  const firingInterval = field(entry, "firingIntervalFrame");
  const bulletCountPerShot = Math.max(1, field(entry, "bulletCountPerShot"));
  const isContinuousFire = field(entry, "isContinuousFire") !== 0;

  const damagePerShot = damagePerHit * bulletCountPerShot;
  const totalBurstDamage = damagePerShot * ammoCount;

  const shotCycleFrames = isContinuousFire
    ? Math.max(1, firingInterval)
    : action.startupFrame + action.activeFrame + action.recoveryFrame;

  const burstFrames = shotCycleFrames * ammoCount;
  const reloadFrames = getEffectiveReloadFrames(entry);
  const cycleFrames = burstFrames + reloadFrames;

  const fps = 60;
  const timeToEmptySeconds = burstFrames / fps;
  const reloadTimeSeconds = reloadFrames / fps;
  const effectiveCycleSeconds = cycleFrames / fps;

  const burstDps = timeToEmptySeconds > 0 ? totalBurstDamage / timeToEmptySeconds : 0;
  const sustainedDps = effectiveCycleSeconds > 0 ? totalBurstDamage / effectiveCycleSeconds : 0;
  const damagePerSecond = shotCycleFrames > 0 ? damagePerShot / (shotCycleFrames / fps) : 0;

  return {
    damagePerShot,
    damagePerSecond,
    burstDps,
    sustainedDps,
    totalBurstDamage,
    timeToEmptySeconds,
    reloadTimeSeconds,
    effectiveCycleSeconds,
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
