/**
 * Game-accurate damage, cost, and guts calculation.
 * Ported from sub_1405F9010, sub_1405F9180, sub_1405F8E70, sub_1405F8600
 * in vsac27_Release.exe.
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

// --- Attack type hash mapping from sub_1405F9010 ---

const DAMAGE_HASH_BY_ATTACK_TYPE: Record<number, { hash: number; camelKey: string; usesCorrection?: boolean }> = {
  0:  { hash: 0xEB30FE24, camelKey: "rangedDamage" },
  1:  { hash: 0xEB30FE24, camelKey: "rangedDamage" },
  2:  { hash: 0x333722B6, camelKey: "meleeDamage" },
  3:  { hash: 0x9054ACF0, camelKey: "subDamage" },
  4:  { hash: 0xE301E496, camelKey: "correctedDamage", usesCorrection: true },
  5:  { hash: 0xE301E496, camelKey: "correctedDamage", usesCorrection: true },
  6:  { hash: 0x1D6EA3F1, camelKey: "assistDamage" },
  7:  { hash: 0x1D6EA3F1, camelKey: "assistDamage" },
  8:  { hash: 0x00D7CEDB, camelKey: "maxHp" },
  9:  { hash: 0x7765F2E9, camelKey: "correctedDamage2", usesCorrection: true },
  10: { hash: 0x539BE76D, camelKey: "rangedSpecialDamage" },
  11: { hash: 0x2DA8874F, camelKey: "specialMeleeDamage" },
  12: { hash: 0xE301E496, camelKey: "correctedDamage", usesCorrection: true },
  13: { hash: 0xE301E496, camelKey: "correctedDamage" },
  14: { hash: 0x333722B6, camelKey: "meleeDamage" },
  15: { hash: 0x9054ACF0, camelKey: "subDamage" },
  18: { hash: 0x9054ACF0, camelKey: "subDamage" },
};

const COST_HASH_BY_ATTACK_TYPE: Record<number, { hash: number; camelKey: string }> = {
  0:  { hash: 0x8199A311, camelKey: "mainCost" },
  1:  { hash: 0xD8F4FBD2, camelKey: "subMainCost" },
  2:  { hash: 0x22823596, camelKey: "specialCost" },
  3:  { hash: 0x0872029D, camelKey: "subShotCost" },
  4:  { hash: 0xAE7FF94F, camelKey: "meleeCost" },
  5:  { hash: 0xAE7FF94F, camelKey: "meleeCost" },
  6:  { hash: 0xFEE76495, camelKey: "assistCost" },
  7:  { hash: 0xFEE76495, camelKey: "assistCost" },
  9:  { hash: 0x1EA3FAE1, camelKey: "burstCost" },
  10: { hash: 0xC6A88D7F, camelKey: "specialRangedCost" },
  12: { hash: 0xAE7FF94F, camelKey: "meleeCost" },
  13: { hash: 0x5E0DDDD8, camelKey: "chargeCost" },
  14: { hash: 0x04371326, camelKey: "baseUnitCost" },
  15: { hash: 0x04371326, camelKey: "baseUnitCost" },
  18: { hash: 0x04371326, camelKey: "baseUnitCost" },
};

export const ATTACK_TYPE_LABELS: Record<number, string> = {
  0: "Ranged (main)",
  1: "Ranged (sub main)",
  2: "Melee",
  3: "Sub shot",
  4: "Corrected ranged A",
  5: "Corrected ranged B",
  6: "Assist A",
  7: "Assist B",
  8: "Max HP (special)",
  9: "Corrected special",
  10: "Ranged special",
  11: "Special melee",
  12: "Corrected melee",
  13: "Corrected (no mult)",
  14: "Melee (secondary)",
  15: "Sub (secondary)",
  16: "N/A",
  17: "N/A",
  18: "Sub (with factor)",
};

/**
 * Resolves damage for a given attack type.
 * Game logic: sub_1405F9010 switch(attackType)
 */
export function getDamageForAttackType(
  entry: TypedParamEntry,
  attackType: number,
  correctionRate: number = 1.0,
): number {
  const mapping = DAMAGE_HASH_BY_ATTACK_TYPE[attackType];
  if (!mapping) return 0;

  const baseValue = field(entry, mapping.camelKey);
  if (mapping.usesCorrection) {
    return Math.trunc(baseValue * correctionRate);
  }
  return baseValue;
}

/**
 * Resolves cost for a given attack type.
 * Game logic: sub_1405F9180 switch(attackType)
 *
 * Case 18 is special: base_unit_cost * character_list_factor (ceil).
 */
export function getCostForAttackType(
  entry: TypedParamEntry,
  attackType: number,
  characterListFactor: number = 1.0,
): number {
  const mapping = COST_HASH_BY_ATTACK_TYPE[attackType];
  if (!mapping) return 0;

  const baseValue = field(entry, mapping.camelKey);
  if (attackType === 18) {
    return Math.ceil(baseValue * characterListFactor);
  }
  return baseValue;
}

// --- Low-durability incoming-damage multiplier from sub_1405F8E70 ---

const LOW_DURABILITY_DAMAGE_BANDS: Array<{
  threshold: number;
  hash: number;
  key: string;
}> = [
  {
    threshold: 0.45,
    hash: 0x6674EE31,
    key: "lowDurabilityIncomingDamageMultiplierBand45To50",
  },
  {
    threshold: 0.40,
    hash: 0x9B8BF864,
    key: "lowDurabilityIncomingDamageMultiplierBand40To45",
  },
  {
    threshold: 0.35,
    hash: 0xE1D22572,
    key: "lowDurabilityIncomingDamageMultiplierBand35To40",
  },
  {
    threshold: 0.30,
    hash: 0xBB19842F,
    key: "lowDurabilityIncomingDamageMultiplierBand30To35",
  },
  {
    threshold: 0.25,
    hash: 0xC1405939,
    key: "lowDurabilityIncomingDamageMultiplierBand25To30",
  },
  {
    threshold: 0.20,
    hash: 0x3CBF4F6C,
    key: "lowDurabilityIncomingDamageMultiplierBand20To25",
  },
  {
    threshold: 0.15,
    hash: 0x46E6927A,
    key: "lowDurabilityIncomingDamageMultiplierBand15To20",
  },
  {
    threshold: 0.10,
    hash: 0x6F2514E8,
    key: "lowDurabilityIncomingDamageMultiplierBand10To15",
  },
  {
    threshold: 0.05,
    hash: 0x157CC9FE,
    key: "lowDurabilityIncomingDamageMultiplierBand05To10",
  },
];

const LOW_DURABILITY_DAMAGE_LOWEST_BAND = {
  hash: 0xE883DFAB,
  key: "lowDurabilityIncomingDamageMultiplierBand00To05",
};

/**
 * Resolves the incoming-damage multiplier selected by current durability ratio.
 * Game logic: sub_1405F8E70 -> sub_1405F89C0 -> sub_1405F9480.
 *
 * When HP > 50%, returns 1.0 (no reduction).
 * Below 50%, checks 10 bands (each 5% wide) and returns the band's value * 0.01.
 *
 * @param entry - characterparam entry
 * @param hpPercent - current HP as fraction (0.0 to 1.0)
 * @returns incoming-damage multiplier
 */
export function lowDurabilityIncomingDamageMultiplier(
  entry: TypedParamEntry,
  hpPercent: number,
): number {
  if (hpPercent > 0.50) return 1.0;

  let key = LOW_DURABILITY_DAMAGE_LOWEST_BAND.key;
  for (const band of LOW_DURABILITY_DAMAGE_BANDS) {
    if (hpPercent > band.threshold) {
      key = band.key;
      break;
    }
  }

  return fieldFloat(entry, key) * 0.01;
}

/**
 * Returns the full low-durability incoming-damage table for visualization.
 * Each entry is { minHp, maxHp, multiplier }.
 */
export function lowDurabilityIncomingDamageTable(entry: TypedParamEntry): Array<{
  minHp: number;
  maxHp: number;
  multiplier: number;
  key: string;
}> {
  const result: Array<{ minHp: number; maxHp: number; multiplier: number; key: string }> = [];

  result.push({ minHp: 0.50, maxHp: 1.00, multiplier: 1.0, key: "(none)" });

  for (let i = 0; i < LOW_DURABILITY_DAMAGE_BANDS.length; i++) {
    const band = LOW_DURABILITY_DAMAGE_BANDS[i]!;
    const upperThreshold =
      i === 0 ? 0.50 : LOW_DURABILITY_DAMAGE_BANDS[i - 1]!.threshold;
    result.push({
      minHp: band.threshold,
      maxHp: upperThreshold,
      multiplier: fieldFloat(entry, band.key) * 0.01,
      key: band.key,
    });
  }

  result.push({
    minHp: 0.00,
    maxHp: 0.05,
    multiplier: fieldFloat(entry, LOW_DURABILITY_DAMAGE_LOWEST_BAND.key) * 0.01,
    key: LOW_DURABILITY_DAMAGE_LOWEST_BAND.key,
  });

  return result;
}

/** @deprecated Use lowDurabilityIncomingDamageMultiplier. */
export const gutsCorrection = lowDurabilityIncomingDamageMultiplier;

/** @deprecated Use lowDurabilityIncomingDamageTable. */
export const gutsTable = lowDurabilityIncomingDamageTable;

// --- Lock distance from sub_1405F8600 ---

export const LOCK_DISTANCE_TYPES = [
  { id: 0, hash: 0x08ECF0BE, key: "redLockDistance", label: "Red lock" },
  { id: 1, hash: 0x9271BEB4, key: "midLockDistance", label: "Mid lock" },
  { id: 2, hash: 0xE69AD372, key: "farLockDistance", label: "Far lock" },
  { id: 3, hash: 0x78903491, key: "maxLockDistance", label: "Max lock" },
  { id: 4, hash: 0x0F8134A7, key: "greenLockDistance", label: "Green lock" },
  { id: 5, hash: 0x55EECE85, key: "defaultLockDistance", label: "Default" },
] as const;

export function getLockDistance(entry: TypedParamEntry, distType: number): number {
  const info = LOCK_DISTANCE_TYPES.find((t) => t.id === distType);
  if (!info) return 0;
  return fieldFloat(entry, info.key);
}
