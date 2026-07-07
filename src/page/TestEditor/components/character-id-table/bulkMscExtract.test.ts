import { describe, expect, it } from "vitest";

import type { CharacterIdTableData } from "@/models/characterIdTable";

import { buildBulkMscExtractPlan } from "./bulkMscExtract";

function createRow(overrides: Partial<CharacterIdTableData> = {}): CharacterIdTableData {
  return {
    CharacterId: 100,
    Model: 0,
    Effect: 0,
    Sound: 0,
    Param: 0,
    Msc: 0,
    Motion: 0,
    ...overrides,
  };
}

describe("buildBulkMscExtractPlan", () => {
  it("skips empty MSC values and deduplicates repeated hashes", () => {
    const plan = buildBulkMscExtractPlan([
      createRow({ CharacterId: 1, Msc: 0 }),
      createRow({ CharacterId: 2, Msc: 0x1240bd01 }),
      createRow({ CharacterId: 3, Msc: 0x1240bd01 }),
      createRow({ CharacterId: 4, Msc: 0x43bb8719 }),
    ]);

    expect(plan.totalRows).toBe(4);
    expect(plan.nonZeroRows).toBe(3);
    expect(plan.skippedZeroRows).toBe(1);
    expect(plan.duplicateRows).toBe(1);
    expect(plan.candidates.map((candidate) => candidate.hashHex)).toEqual([
      "0x1240BD01",
      "0x43BB8719",
    ]);
    expect(plan.candidates[0]).toMatchObject({
      packName: "002zgundm_002hyaksk_001",
      characterIds: [2, 3],
      rowIndexes: [1, 2],
    });
  });

  it("falls back to an MSC hash name when no mapping exists", () => {
    const plan = buildBulkMscExtractPlan([
      createRow({ CharacterId: 9, Msc: 0x12345678 }),
    ]);

    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]).toMatchObject({
      hashHex: "0x12345678",
      packName: "Msc_12345678",
      characterIds: [9],
    });
  });
});
