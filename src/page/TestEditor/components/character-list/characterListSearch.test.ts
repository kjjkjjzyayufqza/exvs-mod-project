import { describe, expect, it } from "vitest";
import type { CharacterListEntry } from "@/models/characterListEntry";
import {
  characterListEntryMatchesSearch,
  filterCharacterListRows,
} from "./characterListSearch";

function makeEntry(partial: Partial<CharacterListEntry> & { entryId: number }): CharacterListEntry {
  return partial as CharacterListEntry;
}

describe("characterListSearch", () => {
  it("matches decimal character id substring", () => {
    const row = makeEntry({ entryId: 1005001, characterName: "Gundam" });
    expect(characterListEntryMatchesSearch(row, "100")).toBe(true);
    expect(characterListEntryMatchesSearch(row, "5001")).toBe(true);
    expect(characterListEntryMatchesSearch(row, "999")).toBe(false);
  });

  it("matches string fields case-insensitively (fuzzy substring)", () => {
    const row = makeEntry({
      entryId: 1,
      characterName: "RX-78-2 Gundam",
      pilotNameFull: "Amuro Ray",
      weaponTextMain: "Beam Rifle",
      variantDisplayNameSlot1: "Origin Ver.",
    });

    expect(characterListEntryMatchesSearch(row, "gundam")).toBe(true);
    expect(characterListEntryMatchesSearch(row, "RX-78")).toBe(true);
    expect(characterListEntryMatchesSearch(row, "amuro")).toBe(true);
    expect(characterListEntryMatchesSearch(row, "beam")).toBe(true);
    expect(characterListEntryMatchesSearch(row, "origin")).toBe(true);
    expect(characterListEntryMatchesSearch(row, "zaku")).toBe(false);
  });

  it("matches any CHARACTERLIST_STRING_FIELDS key, not only characterName", () => {
    const row = makeEntry({
      entryId: 42,
      characterName: "",
      weaponTextSp: "Hyper Mega Launcher",
    });
    expect(characterListEntryMatchesSearch(row, "mega")).toBe(true);
    expect(characterListEntryMatchesSearch(row, "42")).toBe(true);
  });

  it("empty query matches everything", () => {
    const row = makeEntry({ entryId: 1, characterName: "A" });
    expect(characterListEntryMatchesSearch(row, "")).toBe(true);
    expect(characterListEntryMatchesSearch(row, "   ")).toBe(true);
  });

  it("filterCharacterListRows preserves original indices", () => {
    const characters = [
      makeEntry({ entryId: 10, characterName: "Alpha" }),
      makeEntry({ entryId: 20, characterName: "Beta Gundam" }),
      makeEntry({ entryId: 30, characterName: "Gamma" }),
    ];

    const byName = filterCharacterListRows(characters, "gundam");
    expect(byName).toEqual([{ row: characters[1], idx: 1 }]);

    const byId = filterCharacterListRows(characters, "30");
    expect(byId).toEqual([{ row: characters[2], idx: 2 }]);

    const all = filterCharacterListRows(characters, "");
    expect(all.map((x) => x.idx)).toEqual([0, 1, 2]);
  });
});
