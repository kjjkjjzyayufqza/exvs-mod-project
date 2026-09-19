import { describe, expect, it } from "vitest";
import type { CharacterListEntry } from "@/models/characterListEntry";
import {
  asCharacterId,
  buildCharacterListUnitCatalog,
  characterListUnitLabel,
  filterCharacterListUnits,
  lookupCharacterListUnit,
  unitCatalogLabel,
} from "./characterListUnitCatalog";

function makeEntry(
  partial: Partial<CharacterListEntry> & { entryId: number },
): CharacterListEntry {
  return partial as CharacterListEntry;
}

describe("characterListUnitCatalog", () => {
  it("maps Character List Character ID (entryId) to characterName, not uniqueId", () => {
    const catalog = buildCharacterListUnitCatalog([
      makeEntry({
        entryId: 1001001,
        characterUniqueId: 1,
        characterName: "ガンダム",
      }),
      makeEntry({
        entryId: 1001002,
        characterUniqueId: 1,
        characterName: "ガンダム",
      }),
      makeEntry({
        entryId: 733026005,
        characterUniqueId: 795,
        characterName: "達納金",
      }),
    ]);

    expect(catalog.units.map((unit) => unit.characterId)).toEqual([
      1001001, 1001002, 733026005,
    ]);
    expect(lookupCharacterListUnit(catalog, 1001001)?.name).toBe("ガンダム");
    expect(lookupCharacterListUnit(catalog, 1001002)?.characterId).toBe(1001002);
    expect(lookupCharacterListUnit(catalog, 733026005)?.name).toBe("達納金");
    expect(lookupCharacterListUnit(catalog, 1)).toBeUndefined();
    expect(lookupCharacterListUnit(catalog, 795)).toBeUndefined();
  });

  it("looks up the same 32-bit id whether the caller passed it signed or unsigned", () => {
    const unsignedId = 0xffff_0001 >>> 0;
    const catalog = buildCharacterListUnitCatalog([
      makeEntry({ entryId: unsignedId, characterName: "Overflow Suit" }),
    ]);

    expect(asCharacterId(unsignedId | 0)).toBe(unsignedId);
    expect(lookupCharacterListUnit(catalog, unsignedId)?.name).toBe("Overflow Suit");
    expect(lookupCharacterListUnit(catalog, unsignedId | 0)?.name).toBe("Overflow Suit");
    expect(unitCatalogLabel(catalog, unsignedId | 0)).toBe(
      `Overflow Suit (ID: ${unsignedId})`,
    );
  });

  it("labels rows the way Character List cards do", () => {
    const catalog = buildCharacterListUnitCatalog([
      makeEntry({ entryId: 1001001, characterName: "ガンダム" }),
      makeEntry({ entryId: 2002001, characterName: "   " }),
    ]);
    const gundam = lookupCharacterListUnit(catalog, 1001001);
    expect(gundam).toBeDefined();
    expect(characterListUnitLabel(gundam!)).toBe("ガンダム (ID: 1001001)");
    expect(unitCatalogLabel(catalog, 2002001)).toBe("Character 2002001 (ID: 2002001)");
    expect(unitCatalogLabel(catalog, 0)).toBe("");
    expect(unitCatalogLabel(catalog, 9999999)).toBe("Character 9999999");
  });

  it("filters by Character ID and Character List string fields", () => {
    const catalog = buildCharacterListUnitCatalog([
      makeEntry({
        entryId: 1001001,
        characterName: "ガンダム",
        pilotNameFull: "Amuro Ray",
      }),
      makeEntry({
        entryId: 733026005,
        characterName: "達納金",
        weaponTextMain: "Beam",
      }),
    ]);

    expect(filterCharacterListUnits(catalog, "1001001").map((u) => u.characterId)).toEqual([
      1001001,
    ]);
    expect(filterCharacterListUnits(catalog, "達納").map((u) => u.characterId)).toEqual([
      733026005,
    ]);
    expect(filterCharacterListUnits(catalog, "amuro").map((u) => u.characterId)).toEqual([
      1001001,
    ]);
  });
});
