/**
 * Arcade route suit identity is Character List "Character ID" (`entryId`).
 *
 * Mission `unit_id`, briefing slots, and course select-screen suits all store
 * that same 32-bit id. `characterUniqueId` is a costume grouping and is not
 * unique per row — it must never be used as a map key.
 */

import type { CharacterListEntry } from "@/models/characterListEntry";
import { characterListEntryMatchesSearch } from "../character-list/characterListSearch";

/** Unsigned 32-bit Character ID, matching Character List cards and highlights. */
export function asCharacterId(value: number): number {
  return value >>> 0;
}

export type CharacterListUnit = {
  characterId: number;
  name: string;
  entry: CharacterListEntry;
};

export type UnitCatalog = {
  units: readonly CharacterListUnit[];
  byId: ReadonlyMap<number, CharacterListUnit>;
};

export function emptyUnitCatalog(): UnitCatalog {
  return { units: [], byId: new Map() };
}

function readCharacterName(entry: CharacterListEntry): string {
  const raw = entry.characterName;
  return typeof raw === "string" ? raw.trim() : "";
}

/** Same fallback Character List cards use when `characterName` is empty. */
export function characterListUnitName(entry: CharacterListEntry): string {
  const id = asCharacterId(entry.entryId);
  return readCharacterName(entry) || `Character ${id}`;
}

/** Character List card copy: name plus `ID: {Character ID}`. */
export function characterListUnitLabel(unit: CharacterListUnit): string {
  return `${unit.name} (ID: ${unit.characterId})`;
}

export function buildCharacterListUnitCatalog(
  entries: readonly CharacterListEntry[],
): UnitCatalog {
  const units: CharacterListUnit[] = [];
  const byId = new Map<number, CharacterListUnit>();

  for (const entry of entries) {
    if (typeof entry?.entryId !== "number" || !Number.isFinite(entry.entryId)) {
      continue;
    }
    const characterId = asCharacterId(entry.entryId);
    const unit: CharacterListUnit = {
      characterId,
      name: characterListUnitName(entry),
      entry,
    };
    units.push(unit);
    byId.set(characterId, unit);
    // Mission tables expose the same bits as i32; keep a signed alias when it differs.
    const signedBits = characterId | 0;
    if (signedBits !== characterId) {
      byId.set(signedBits, unit);
    }
  }

  units.sort((a, b) => a.characterId - b.characterId);
  return { units, byId };
}

export function lookupCharacterListUnit(
  catalog: UnitCatalog,
  unitId: number,
): CharacterListUnit | undefined {
  if (typeof unitId !== "number" || !Number.isFinite(unitId)) {
    return undefined;
  }
  return catalog.byId.get(asCharacterId(unitId)) ?? catalog.byId.get(unitId);
}

export function unitCatalogLabel(catalog: UnitCatalog, unitId: number): string {
  const hit = lookupCharacterListUnit(catalog, unitId);
  if (hit) {
    return characterListUnitLabel(hit);
  }
  if (!unitId) {
    return "";
  }
  return `Character ${asCharacterId(unitId)}`;
}

export function filterCharacterListUnits(
  catalog: UnitCatalog,
  query: string,
): CharacterListUnit[] {
  const needle = query.trim();
  if (!needle) {
    return [...catalog.units];
  }
  return catalog.units.filter(
    (unit) =>
      String(unit.characterId).includes(needle) ||
      characterListEntryMatchesSearch(unit.entry, needle),
  );
}
