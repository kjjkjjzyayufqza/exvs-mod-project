import {
  ATTACK_TYPE_LABELS,
  getDamageForAttackType,
  getCostForAttackType,
  getDamageFieldInfo,
  getCostFieldInfo,
  lowDurabilityIncomingDamageTable,
  LOCK_DISTANCE_TYPES,
  getLockDistance,
} from "@/lib/gameAlgorithms/damageCalculation";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

/**
 * Pure view-model helpers for the character-editor visualizers.
 * Every computed value is null when its source field is absent from the
 * parsed entry, so components can render an explicit "field unavailable"
 * state instead of a silent zero.
 */

export function hasNumericField(entry: TypedParamEntry, key: string): boolean {
  return typeof entry[key] === "number";
}

export function formatGameNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

// --- Phase 3.1: attack-type damage/cost table ---

export interface AttackTypeRow {
  attackType: number;
  label: string;
  damageKey: string | null;
  damageUsesCorrection: boolean;
  /** Computed damage; null when the source field is absent or unmapped. */
  damage: number | null;
  costKey: string | null;
  costUsesFactor: boolean;
  /** Computed cost; null when the source field is absent or unmapped. */
  cost: number | null;
}

export function buildAttackTypeRows(
  entry: TypedParamEntry,
  correctionRate: number,
  baseUnitCostFactor: number,
): AttackTypeRow[] {
  const attackTypes = Object.keys(ATTACK_TYPE_LABELS)
    .map(Number)
    .sort((a, b) => a - b);

  const rows: AttackTypeRow[] = [];
  for (const attackType of attackTypes) {
    const damageInfo = getDamageFieldInfo(attackType);
    const costInfo = getCostFieldInfo(attackType);
    if (!damageInfo && !costInfo) continue;

    const damageAvailable =
      damageInfo !== null && hasNumericField(entry, damageInfo.key);
    const costAvailable =
      costInfo !== null && hasNumericField(entry, costInfo.key);

    rows.push({
      attackType,
      label: ATTACK_TYPE_LABELS[attackType] ?? `Type ${attackType}`,
      damageKey: damageInfo?.key ?? null,
      damageUsesCorrection: damageInfo?.usesCorrection ?? false,
      damage: damageAvailable
        ? getDamageForAttackType(entry, attackType, correctionRate)
        : null,
      costKey: costInfo?.key ?? null,
      costUsesFactor: costInfo?.usesFactor ?? false,
      cost: costAvailable
        ? getCostForAttackType(entry, attackType, baseUnitCostFactor)
        : null,
    });
  }
  return rows;
}

// --- Phase 3.2: HP-band guts multiplier chart ---

export interface GutsBandView {
  /** Inclusive-exclusive band bounds as whole HP percentages. */
  minHpPct: number;
  maxHpPct: number;
  /** Source field key; "(none)" for the engine-constant >50% band. */
  key: string;
  /** Band multiplier; null when the band field is absent from the entry. */
  multiplier: number | null;
  /** True for the >50% band whose 1.0 multiplier is hardcoded in the game. */
  isEngineConstant: boolean;
}

export function buildGutsBandViews(entry: TypedParamEntry): GutsBandView[] {
  return lowDurabilityIncomingDamageTable(entry).map((band) => {
    const isEngineConstant = band.key === "(none)";
    const available = isEngineConstant || hasNumericField(entry, band.key);
    return {
      minHpPct: Math.round(band.minHp * 100),
      maxHpPct: Math.round(band.maxHp * 100),
      key: band.key,
      multiplier: available ? band.multiplier : null,
      isEngineConstant,
    };
  });
}

/**
 * Selects the band index for a HP percentage, mirroring the strict
 * greater-than comparisons of sub_1405F8E70: HP > 50% hits the engine
 * constant band; otherwise the first band whose lower bound is exceeded;
 * HP <= 5% falls through to the lowest band.
 */
export function findActiveGutsBandIndex(
  bands: GutsBandView[],
  hpPct: number,
): number {
  if (bands.length === 0) return -1;
  if (hpPct > 50) return 0;
  for (let i = 1; i < bands.length; i++) {
    if (hpPct > bands[i]!.minHpPct) return i;
  }
  return bands.length - 1;
}

// --- Phase 3.3: lock-range concentric rings ---

export interface LockRingView {
  id: number;
  label: string;
  key: string;
  /** Lock distance in game units; null when the field is absent. */
  distance: number | null;
}

export function buildLockRingViews(entry: TypedParamEntry): LockRingView[] {
  return LOCK_DISTANCE_TYPES.map((type) => ({
    id: type.id,
    label: type.label,
    key: type.key,
    distance: hasNumericField(entry, type.key)
      ? getLockDistance(entry, type.id)
      : null,
  }));
}

export function maxLockRingDistance(rings: LockRingView[]): number {
  let max = 0;
  for (const ring of rings) {
    if (ring.distance !== null && ring.distance > max) {
      max = ring.distance;
    }
  }
  return max;
}

/**
 * Linear ring scaling: distance 0 (or an empty chart) maps to radius 0,
 * the largest distance maps to maxRadiusPx.
 */
export function scaleRingRadius(
  distance: number,
  maxDistance: number,
  maxRadiusPx: number,
): number {
  if (maxDistance <= 0 || distance <= 0) return 0;
  return (distance / maxDistance) * maxRadiusPx;
}
