import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import {
  buildAttackTypeRows,
  buildGutsBandViews,
  buildLockRingViews,
  findActiveGutsBandIndex,
  formatGameNumber,
  hasNumericField,
  maxLockRingDistance,
  scaleRingRadius,
} from "./characterVisualizerHelpers";

function makeEntry(fields: Record<string, number | string>): TypedParamEntry {
  return fields as TypedParamEntry;
}

describe("hasNumericField", () => {
  it("accepts numbers and rejects missing or non-numeric values", () => {
    const entry = makeEntry({ meleeDamage: 200, actionLabel: "abc" });
    expect(hasNumericField(entry, "meleeDamage")).toBe(true);
    expect(hasNumericField(entry, "actionLabel")).toBe(false);
    expect(hasNumericField(entry, "missing")).toBe(false);
  });
});

describe("formatGameNumber", () => {
  it("keeps integers plain and rounds floats to one decimal", () => {
    expect(formatGameNumber(300)).toBe("300");
    expect(formatGameNumber(300.25)).toBe("300.3");
  });
});

describe("buildAttackTypeRows", () => {
  const entry = makeEntry({
    mainShotDamage: 120,
    subShotDamage: 200,
    mainShotCost: 10,
    baseUnitCost: 2000,
  });

  it("computes damage and cost from canonical fields", () => {
    const rows = buildAttackTypeRows(entry, 1.0, 1.0);
    const row0 = rows.find((r) => r.attackType === 0);
    expect(row0?.damage).toBe(120);
    expect(row0?.cost).toBe(10);
    expect(row0?.damageKey).toBe("mainShotDamage");
    expect(row0?.costKey).toBe("mainShotCost");
  });

  it("applies the correction rate only to corrected cases", () => {
    const rows = buildAttackTypeRows(entry, 0.5, 1.0);
    expect(rows.find((r) => r.attackType === 4)?.damage).toBe(100);
    expect(rows.find((r) => r.attackType === 13)?.damage).toBe(200);
  });

  it("applies ceil(base * factor) to cost case 18 only", () => {
    const rows = buildAttackTypeRows(entry, 1.0, 1.5);
    expect(rows.find((r) => r.attackType === 18)?.cost).toBe(3000);
    expect(rows.find((r) => r.attackType === 14)?.cost).toBe(2000);
    expect(rows.find((r) => r.attackType === 18)?.costUsesFactor).toBe(true);
    expect(rows.find((r) => r.attackType === 14)?.costUsesFactor).toBe(false);
  });

  it("marks absent fields as null instead of zero", () => {
    const rows = buildAttackTypeRows(entry, 1.0, 1.0);
    const row2 = rows.find((r) => r.attackType === 2);
    expect(row2?.damage).toBeNull();
    expect(row2?.damageKey).toBe("meleeDamage");
    expect(row2?.cost).toBeNull();
    expect(row2?.costKey).toBe("specialCost");
  });

  it("excludes attack types without any field mapping", () => {
    const rows = buildAttackTypeRows(entry, 1.0, 1.0);
    const types = rows.map((r) => r.attackType);
    expect(types).not.toContain(16);
    expect(types).not.toContain(17);
    expect(types).toContain(18);
  });

  it("keeps damage-only rows such as selector 8", () => {
    const rows = buildAttackTypeRows(entry, 1.0, 1.0);
    const row8 = rows.find((r) => r.attackType === 8);
    expect(row8?.damageKey).toBe("damageDispatchValueSelector8");
    expect(row8?.costKey).toBeNull();
  });
});

describe("buildGutsBandViews", () => {
  it("returns the engine-constant band plus ten 5% bands", () => {
    const bands = buildGutsBandViews(makeEntry({}));
    expect(bands).toHaveLength(11);
    expect(bands[0]).toMatchObject({
      minHpPct: 50,
      maxHpPct: 100,
      multiplier: 1.0,
      isEngineConstant: true,
    });
    expect(bands[10]).toMatchObject({ minHpPct: 0, maxHpPct: 5 });
  });

  it("scales present band values by 0.01 and nulls absent bands", () => {
    const bands = buildGutsBandViews(
      makeEntry({ lowDurabilityIncomingDamageMultiplierBand45To50: 80 }),
    );
    expect(bands[1]?.multiplier).toBeCloseTo(0.8);
    expect(bands[2]?.multiplier).toBeNull();
  });
});

describe("findActiveGutsBandIndex", () => {
  const bands = buildGutsBandViews(makeEntry({}));

  it("mirrors the strict greater-than band selection of sub_1405F8E70", () => {
    expect(findActiveGutsBandIndex(bands, 100)).toBe(0);
    expect(findActiveGutsBandIndex(bands, 51)).toBe(0);
    expect(findActiveGutsBandIndex(bands, 50)).toBe(1);
    expect(findActiveGutsBandIndex(bands, 46)).toBe(1);
    expect(findActiveGutsBandIndex(bands, 45)).toBe(2);
    expect(findActiveGutsBandIndex(bands, 3)).toBe(10);
    expect(findActiveGutsBandIndex(bands, 0)).toBe(10);
  });

  it("returns -1 for an empty band list", () => {
    expect(findActiveGutsBandIndex([], 50)).toBe(-1);
  });
});

describe("buildLockRingViews / maxLockRingDistance", () => {
  it("reads canonical family-1 keys and nulls absent ones", () => {
    const rings = buildLockRingViews(
      makeEntry({
        lockDistanceThresholdFamily1Slot0: 300,
        lockDistanceThresholdFamily1Default: 550,
      }),
    );
    expect(rings).toHaveLength(6);
    expect(rings[0]).toMatchObject({ id: 0, label: "Slot 0", distance: 300 });
    expect(rings[1]?.distance).toBeNull();
    expect(rings[5]).toMatchObject({ id: 5, label: "Default", distance: 550 });
    expect(maxLockRingDistance(rings)).toBe(550);
  });

  it("returns 0 max distance when nothing is available", () => {
    expect(maxLockRingDistance(buildLockRingViews(makeEntry({})))).toBe(0);
  });
});

describe("scaleRingRadius", () => {
  it("scales linearly against the largest distance", () => {
    expect(scaleRingRadius(300, 600, 100)).toBe(50);
    expect(scaleRingRadius(600, 600, 100)).toBe(100);
  });

  it("returns 0 for non-positive distances or an empty chart", () => {
    expect(scaleRingRadius(0, 600, 100)).toBe(0);
    expect(scaleRingRadius(-5, 600, 100)).toBe(0);
    expect(scaleRingRadius(300, 0, 100)).toBe(0);
  });
});
