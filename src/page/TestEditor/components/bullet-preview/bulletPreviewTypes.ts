import type { TypedParamEntry } from "../param-editor/typedParamTypes";

export type BulletPreviewPhysicsKey =
  | "initialSpeed"
  | "speedAcceleration"
  | "gravityRate"
  | "homingStrength"
  | "turnRate"
  | "homingDuration"
  | "lifetime"
  | "durationFrame"
  | "maxRange"
  | "effectiveRange"
  | "blastRadius"
  | "initialAngle"
  | "launchAngleHorizontal"
  | "elevationAngle"
  | "hitboxWidth"
  | "hitboxHeight"
  | "hitboxDepth"
  | "maxDistance";

export const BULLET_PREVIEW_PHYSICS_KEYS: BulletPreviewPhysicsKey[] = [
  "initialSpeed",
  "speedAcceleration",
  "gravityRate",
  "homingStrength",
  "turnRate",
  "homingDuration",
  "lifetime",
  "durationFrame",
  "maxRange",
  "effectiveRange",
  "blastRadius",
  "initialAngle",
  "launchAngleHorizontal",
  "elevationAngle",
  "hitboxWidth",
  "hitboxHeight",
  "hitboxDepth",
  "maxDistance",
];

export type BulletPreviewPhysicsOverrides = Partial<Record<BulletPreviewPhysicsKey, number>>;

/**
 * EXVS lock-on state. Determines whether bullet induction (homing) is active.
 * Reverse-engineering note: the unit exposes concentric lock distance bands
 * (sub_1405F8600 LockDistanceGetter: redLock / midLock / farLock / maxLock /
 * greenLock). A bullet only homes ("誘導") when the firing lock is RED (target
 * inside induction range) or BLUE (awakening / special). GREEN (locked but beyond
 * induction range) and YELLOW (forced / non-locked) fire with NO induction — the
 * bullet keeps its launch-direction inertia.
 */
export type BulletLockState = "red" | "green" | "yellow" | "blue";

export const BULLET_LOCK_STATES: BulletLockState[] = ["red", "green", "yellow", "blue"];

export const BULLET_LOCK_STATE_LABELS: Record<BulletLockState, string> = {
  red: "Red lock (induction)",
  green: "Green lock (no induction)",
  yellow: "Yellow lock (no induction)",
  blue: "Blue lock (special)",
};

/** Returns whether bullet induction (homing) is allowed for the given lock state. */
export function isInductionActive(lockState: BulletLockState): boolean {
  return lockState === "red" || lockState === "blue";
}

export interface BulletPreviewScenario {
  targetDistance: number;
  targetHeight: number;
  targetOffsetX: number;
  /**
   * Base launch speed in world units per frame (60fps). This is NOT a bulletparam
   * field: in the game the base velocity is supplied by the firing weapon/action,
   * while bulletparam only carries modifiers (acceleration, gravity, homing, etc.).
   * Exposed here as an explicit scenario input. Defaults to the entry's initial_speed
   * when that field is nonzero, otherwise to DEFAULT_LAUNCH_SPEED.
   */
  launchSpeed: number;
  /** Lock-on state that gates induction (homing). */
  lockState: BulletLockState;
  enemyLateralMotionEnabled: boolean;
  enemyLateralAmplitude: number;
  enemyLateralPeriodFrames: number;
  enemyLateralPhaseDeg: number;
}

/** Fallback base launch speed (world units/frame) when the entry has no initial_speed. */
export const DEFAULT_LAUNCH_SPEED = 4;

export const DEFAULT_BULLET_PREVIEW_SCENARIO: BulletPreviewScenario = {
  targetDistance: 120,
  targetHeight: 0,
  targetOffsetX: 0,
  launchSpeed: DEFAULT_LAUNCH_SPEED,
  lockState: "red",
  enemyLateralMotionEnabled: false,
  enemyLateralAmplitude: 25,
  enemyLateralPeriodFrames: 120,
  enemyLateralPhaseDeg: 0,
};

export interface BulletPreviewVisualization {
  trail: boolean;
  fullPathGhost: boolean;
  hitbox: boolean;
  maxRangeAtTarget: boolean;
  effectiveRangeAtOrigin: boolean;
  blastRadius: boolean;
  playerDummy: boolean;
  enemyDummy: boolean;
  distanceMeasure: boolean;
  axisHelpers: boolean;
}

export const DEFAULT_BULLET_PREVIEW_VISUALIZATION: BulletPreviewVisualization = {
  trail: true,
  fullPathGhost: true,
  hitbox: true,
  maxRangeAtTarget: true,
  effectiveRangeAtOrigin: true,
  blastRadius: true,
  playerDummy: true,
  enemyDummy: true,
  distanceMeasure: true,
  axisHelpers: false,
};

export interface BulletPreviewDataset {
  path: string;
  fileType: string;
  entries: TypedParamEntry[];
  entryIds: number[];
}

export interface BulletPreviewFilter {
  search: string;
  moveType: number | "all";
  series: string | "all";
  unit: string | "all";
  variant: string | "all";
}

export const DEFAULT_BULLET_PREVIEW_FILTER: BulletPreviewFilter = {
  search: "",
  moveType: "all",
  series: "all",
  unit: "all",
  variant: "all",
};

export interface HitEffectHashParts {
  series: string;
  unit: string;
  variant: string;
  weapon: string;
}

export interface BulletPreviewRow {
  sourceIndex: number;
  entryId: number;
  entry: TypedParamEntry;
  moveType: number;
  hitEffectHash: number;
  hitEffectParts: HitEffectHashParts | null;
}

export function readNumericField(entry: TypedParamEntry | null, key: string): number {
  if (!entry) return 0;
  const raw = entry[key];
  return typeof raw === "number" ? raw : 0;
}

export function parseHitEffectHashParts(hash: number): HitEffectHashParts | null {
  if (!Number.isFinite(hash) || hash <= 0 || hash < 1000) return null;
  const packed = String(Math.trunc(hash)).padStart(9, "0");
  if (packed.length < 9) return null;
  return {
    series: packed.slice(0, 3),
    unit: packed.slice(3, 6),
    variant: packed.slice(6, 8),
    weapon: packed.slice(8),
  };
}

export function applyPhysicsOverrides(
  entry: TypedParamEntry,
  overrides: BulletPreviewPhysicsOverrides,
): TypedParamEntry {
  if (Object.keys(overrides).length === 0) return entry;
  const next: TypedParamEntry = { ...entry };
  for (const key of BULLET_PREVIEW_PHYSICS_KEYS) {
    const override = overrides[key];
    if (typeof override === "number" && Number.isFinite(override)) {
      next[key] = override;
    }
  }
  return next;
}

export function computeScenarioTargetPosition(
  scenario: BulletPreviewScenario,
  frame: number,
): [number, number, number] {
  const safeFrame = Number.isFinite(frame) ? frame : 0;
  let x = Number.isFinite(scenario.targetOffsetX) ? scenario.targetOffsetX : 0;
  const y = Number.isFinite(scenario.targetHeight) ? scenario.targetHeight : 0;
  const z = Number.isFinite(scenario.targetDistance) ? scenario.targetDistance : 0;

  if (
    scenario.enemyLateralMotionEnabled &&
    Number.isFinite(scenario.enemyLateralAmplitude) &&
    Number.isFinite(scenario.enemyLateralPeriodFrames) &&
    Math.abs(scenario.enemyLateralAmplitude) > 1e-6 &&
    scenario.enemyLateralPeriodFrames > 1
  ) {
    const phase = (scenario.enemyLateralPhaseDeg * Math.PI) / 180;
    const omega = (Math.PI * 2) / scenario.enemyLateralPeriodFrames;
    x += scenario.enemyLateralAmplitude * Math.sin(safeFrame * omega + phase);
  }

  return [x, y, z];
}

export function computeBulletPhysicsDigest(entry: TypedParamEntry | null): string {
  if (!entry) return "none";
  const parts = BULLET_PREVIEW_PHYSICS_KEYS.map((key) => `${key}:${readNumericField(entry, key)}`);
  return parts.join("|");
}
