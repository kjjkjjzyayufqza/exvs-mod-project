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

export interface BulletPreviewScenario {
  targetDistance: number;
  targetHeight: number;
  targetOffsetX: number;
}

export const DEFAULT_BULLET_PREVIEW_SCENARIO: BulletPreviewScenario = {
  targetDistance: 120,
  targetHeight: 0,
  targetOffsetX: 0,
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

export function computeBulletPhysicsDigest(entry: TypedParamEntry | null): string {
  if (!entry) return "none";
  const parts = BULLET_PREVIEW_PHYSICS_KEYS.map((key) => `${key}:${readNumericField(entry, key)}`);
  return parts.join("|");
}
