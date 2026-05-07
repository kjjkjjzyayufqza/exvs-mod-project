import { describe, it, expect } from "vitest";
import {
  getDamageForAttackType,
  getCostForAttackType,
  gutsCorrection,
  getLockDistance,
} from "./damageCalculation";
import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

function makeEntry(fields: Record<string, number>): TypedParamEntry {
  return fields as unknown as TypedParamEntry;
}

describe("getDamageForAttackType", () => {
  it("case 13 reads the same field as cases 4/5/12 (hash 0xE301E496)", () => {
    const entry = makeEntry({ correctedDamage: 200 });
    const case4 = getDamageForAttackType(entry, 4, 1.0);
    const case13 = getDamageForAttackType(entry, 13);
    expect(case4).toBe(200);
    expect(case13).toBe(200);
  });

  it("case 4/5/12 applies correction, case 13 does not", () => {
    const entry = makeEntry({ correctedDamage: 200 });
    expect(getDamageForAttackType(entry, 4, 0.5)).toBe(100);
    expect(getDamageForAttackType(entry, 5, 0.5)).toBe(100);
    expect(getDamageForAttackType(entry, 12, 0.5)).toBe(100);
    expect(getDamageForAttackType(entry, 13, 0.5)).toBe(200);
  });

  it("correction uses trunc (toward zero), not floor", () => {
    const entry = makeEntry({ correctedDamage: 7 });
    expect(getDamageForAttackType(entry, 4, 0.5)).toBe(3);
    const entryNeg = makeEntry({ correctedDamage: -7 });
    expect(getDamageForAttackType(entryNeg, 4, 0.5)).toBe(-3);
  });

  it("returns 0 for unknown attack types", () => {
    const entry = makeEntry({ rangedDamage: 100 });
    expect(getDamageForAttackType(entry, 16)).toBe(0);
    expect(getDamageForAttackType(entry, 17)).toBe(0);
    expect(getDamageForAttackType(entry, 99)).toBe(0);
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

describe("gutsCorrection", () => {
  it("returns 1.0 when HP > 50%", () => {
    const entry = makeEntry({});
    expect(gutsCorrection(entry, 0.51)).toBe(1.0);
    expect(gutsCorrection(entry, 1.0)).toBe(1.0);
  });

  it("returns band value * 0.01 when HP <= 50%", () => {
    const entry = makeEntry({ hpCorrectionPctTier01: 80 });
    expect(gutsCorrection(entry, 0.46)).toBeCloseTo(0.8);
  });

  it("selects lowest band when HP <= 5%", () => {
    const entry = makeEntry({ hpCorrectionPctTier10: 50 });
    expect(gutsCorrection(entry, 0.03)).toBeCloseTo(0.5);
  });
});
