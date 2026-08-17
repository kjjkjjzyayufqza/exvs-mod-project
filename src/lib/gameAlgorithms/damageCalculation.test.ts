import { describe, it, expect } from "vitest";
import {
  getDamageForAttackType,
  getCostForAttackType,
  getDamageFieldInfo,
  getCostFieldInfo,
  lowDurabilityIncomingDamageMultiplier,
  getLockDistance,
  LOCK_DISTANCE_TYPES,
} from "./damageCalculation";
import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

function makeEntry(fields: Record<string, number>): TypedParamEntry {
  return fields as unknown as TypedParamEntry;
}

describe("getDamageForAttackType", () => {
  it("case 13 reads the same field as cases 4/5/12 (hash 0xE2C6FD16 sub_shot_damage)", () => {
    const entry = makeEntry({ subShotDamage: 200 });
    const case4 = getDamageForAttackType(entry, 4, 1.0);
    const case13 = getDamageForAttackType(entry, 13);
    expect(case4).toBe(200);
    expect(case13).toBe(200);
  });

  it("case 4/5/12 applies correction, case 13 does not", () => {
    const entry = makeEntry({ subShotDamage: 200 });
    expect(getDamageForAttackType(entry, 4, 0.5)).toBe(100);
    expect(getDamageForAttackType(entry, 5, 0.5)).toBe(100);
    expect(getDamageForAttackType(entry, 12, 0.5)).toBe(100);
    expect(getDamageForAttackType(entry, 13, 0.5)).toBe(200);
  });

  it("correction uses trunc (toward zero), not floor", () => {
    const entry = makeEntry({ subShotDamage: 7 });
    expect(getDamageForAttackType(entry, 4, 0.5)).toBe(3);
    const entryNeg = makeEntry({ subShotDamage: -7 });
    expect(getDamageForAttackType(entryNeg, 4, 0.5)).toBe(-3);
  });

  it("reads canonical audited keys for main shot and selector 8", () => {
    const entry = makeEntry({
      mainShotDamage: 120,
      damageDispatchValueSelector8: 1500,
    });
    expect(getDamageForAttackType(entry, 0)).toBe(120);
    expect(getDamageForAttackType(entry, 1)).toBe(120);
    expect(getDamageForAttackType(entry, 8)).toBe(1500);
  });

  it("returns 0 for unknown attack types", () => {
    const entry = makeEntry({ mainShotDamage: 100 });
    expect(getDamageForAttackType(entry, 16)).toBe(0);
    expect(getDamageForAttackType(entry, 17)).toBe(0);
    expect(getDamageForAttackType(entry, 99)).toBe(0);
  });
});

describe("field info accessors", () => {
  it("exposes canonical field keys and correction flags", () => {
    expect(getDamageFieldInfo(4)).toEqual({
      key: "subShotDamage",
      usesCorrection: true,
    });
    expect(getDamageFieldInfo(13)).toEqual({
      key: "subShotDamage",
      usesCorrection: false,
    });
    expect(getDamageFieldInfo(16)).toBeNull();
    expect(getCostFieldInfo(18)).toEqual({
      key: "baseUnitCost",
      usesFactor: true,
    });
    expect(getCostFieldInfo(14)).toEqual({
      key: "baseUnitCost",
      usesFactor: false,
    });
    expect(getCostFieldInfo(8)).toBeNull();
  });
});

describe("getCostForAttackType", () => {
  it("case 18 applies ceil(base * factor)", () => {
    const entry = makeEntry({ baseUnitCost: 100 });
    expect(getCostForAttackType(entry, 18, 1.5)).toBe(150);
    expect(getCostForAttackType(entry, 18, 1.33)).toBe(133);
  });

  it("case 14 and 15 read same hash as 18 but without factor", () => {
    const entry = makeEntry({ baseUnitCost: 100 });
    expect(getCostForAttackType(entry, 14)).toBe(100);
    expect(getCostForAttackType(entry, 15)).toBe(100);
  });
});

describe("lowDurabilityIncomingDamageMultiplier", () => {
  it("returns 1.0 when HP > 50%", () => {
    const entry = makeEntry({});
    expect(lowDurabilityIncomingDamageMultiplier(entry, 0.51)).toBe(1.0);
    expect(lowDurabilityIncomingDamageMultiplier(entry, 1.0)).toBe(1.0);
  });

  it("returns band value * 0.01 when HP <= 50%", () => {
    const entry = makeEntry({
      lowDurabilityIncomingDamageMultiplierBand45To50: 80,
    });
    expect(lowDurabilityIncomingDamageMultiplier(entry, 0.46)).toBeCloseTo(0.8);
  });

  it("selects lowest band when HP <= 5%", () => {
    const entry = makeEntry({
      lowDurabilityIncomingDamageMultiplierBand00To05: 50,
    });
    expect(lowDurabilityIncomingDamageMultiplier(entry, 0.03)).toBeCloseTo(0.5);
  });
});

describe("getLockDistance", () => {
  it("reads canonical family-1 threshold keys", () => {
    const entry = makeEntry({
      lockDistanceThresholdFamily1Slot0: 300.5,
      lockDistanceThresholdFamily1Default: 111,
    });
    expect(getLockDistance(entry, 0)).toBeCloseTo(300.5);
    expect(getLockDistance(entry, 5)).toBeCloseTo(111);
  });

  it("returns 0 for unknown selector ids", () => {
    const entry = makeEntry({ lockDistanceThresholdFamily1Slot0: 300 });
    expect(getLockDistance(entry, 99)).toBe(0);
  });

  it("covers all six family-1 selectors with distinct keys", () => {
    const keys = LOCK_DISTANCE_TYPES.map((t) => t.key);
    expect(new Set(keys).size).toBe(6);
    for (const key of keys) {
      expect(key.startsWith("lockDistanceThresholdFamily1")).toBe(true);
    }
  });
});
