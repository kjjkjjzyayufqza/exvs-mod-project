import { describe, expect, it } from "vitest";
import {
  countNaviRowsForUniqueId,
  createEmptyNaviEntry,
  nextCostumeIndex,
  nextNaviEntryId,
  nextNaviUniqueId,
} from "./naviListModel";

describe("naviListModel", () => {
  it("allocates the next entry and unique ids", () => {
    const entries = [
      createEmptyNaviEntry(1, 4),
      createEmptyNaviEntry(7, 4),
    ];
    expect(nextNaviEntryId(entries)).toBe(8);
    expect(nextNaviUniqueId(entries)).toBe(5);
    expect(nextCostumeIndex(entries, 4)).toBe(1);
    expect(countNaviRowsForUniqueId(entries, 4)).toBe(2);
  });

  it("starts at 1 for an empty table", () => {
    expect(nextNaviEntryId([])).toBe(1);
    expect(nextNaviUniqueId([])).toBe(1);
    expect(nextCostumeIndex([], 1)).toBe(0);
  });
});
