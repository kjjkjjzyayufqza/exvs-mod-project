import { describe, expect, it } from "vitest";

import type { CharacterIdTableData } from "@/models/characterIdTable";

import {
  characterIdTableRowMatchesSearch,
  filterCharacterIdTableRows,
} from "./characterIdTableSearch";

function createRow(overrides: Partial<CharacterIdTableData> = {}): CharacterIdTableData {
  return {
    CharacterId: 100,
    Model: 0x036b9e67,
    Effect: 123,
    Sound: 0,
    Param: 0,
    Msc: 0,
    Motion: 0,
    ...overrides,
  };
}

describe("characterIdTableSearch", () => {
  it("matches character id by decimal", () => {
    const row = createRow();
    expect(characterIdTableRowMatchesSearch(row, "100")).toBe(true);
    expect(characterIdTableRowMatchesSearch(row, "10")).toBe(true);
    expect(characterIdTableRowMatchesSearch(row, "999")).toBe(false);
  });

  it("matches asset fields by hash hex", () => {
    const row = createRow();
    expect(characterIdTableRowMatchesSearch(row, "0x036B9E67")).toBe(true);
    expect(characterIdTableRowMatchesSearch(row, "036b9e67")).toBe(true);
    expect(characterIdTableRowMatchesSearch(row, "9e67")).toBe(true);
  });

  it("matches asset fields by int32 and spaced hex display", () => {
    const decimalRow = createRow({ Effect: 123 });
    expect(characterIdTableRowMatchesSearch(decimalRow, "123")).toBe(true);
    expect(characterIdTableRowMatchesSearch(decimalRow, "7b")).toBe(true);

    const hexRow = createRow({ Effect: 0x89abcdef });
    expect(characterIdTableRowMatchesSearch(hexRow, "89 ab cd ef")).toBe(true);
    expect(characterIdTableRowMatchesSearch(hexRow, "0x89ABCDEF")).toBe(true);
  });

  it("filters rows across all columns", () => {
    const rows = [
      createRow({ CharacterId: 1, Model: 10 }),
      createRow({ CharacterId: 2, Model: 0xdeadbeef }),
      createRow({ CharacterId: 3, Motion: 42 }),
    ];

    expect(filterCharacterIdTableRows(rows, "deadbeef").map((item) => item.idx)).toEqual([1]);
    expect(filterCharacterIdTableRows(rows, "42").map((item) => item.idx)).toEqual([2]);
    expect(filterCharacterIdTableRows(rows, "").map((item) => item.idx)).toEqual([0, 1, 2]);
  });
});
