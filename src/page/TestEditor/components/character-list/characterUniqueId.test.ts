import { describe, expect, it } from "vitest";
import {
  findCharacterUniqueIdConflicts,
  isCharacterUniqueIdUnique,
  pickNextCharacterUniqueId,
} from "./characterUniqueId";

const entries = [
  { entryId: 100, characterUniqueId: 1 },
  { entryId: 200, characterUniqueId: 2 },
  { entryId: 300, characterUniqueId: 2 },
];

describe("characterUniqueId", () => {
  it("detects conflicts excluding the current entry", () => {
    expect(findCharacterUniqueIdConflicts(2, entries, 200)).toEqual([300]);
    expect(findCharacterUniqueIdConflicts(2, entries, 999)).toEqual([200, 300]);
    expect(isCharacterUniqueIdUnique(1, entries, 100)).toBe(true);
    expect(isCharacterUniqueIdUnique(2, entries, 200)).toBe(false);
  });

  it("picks max+1 as the next unique id", () => {
    expect(pickNextCharacterUniqueId([])).toBe(1);
    expect(pickNextCharacterUniqueId(entries)).toBe(3);
    expect(pickNextCharacterUniqueId([{ entryId: 1, characterUniqueId: 0 }])).toBe(1);
  });
});
