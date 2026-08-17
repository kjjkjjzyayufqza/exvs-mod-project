import {
  CHARACTERLIST_STRING_FIELDS,
  type CharacterListEntry,
} from "@/models/characterListEntry";

export interface CharacterListRowRef {
  row: CharacterListEntry;
  idx: number;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase();
}

/**
 * Match Character List rows by Character ID (decimal substring) or any
 * CHARACTERLIST_STRING_FIELDS value (case-insensitive substring).
 */
export function characterListEntryMatchesSearch(
  entry: CharacterListEntry,
  query: string,
): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  if (entry.entryId.toString().includes(trimmed)) {
    return true;
  }

  const normalizedQuery = normalizeSearchText(trimmed);
  return CHARACTERLIST_STRING_FIELDS.some((key) => {
    const value = entry[key];
    return typeof value === "string" && normalizeSearchText(value).includes(normalizedQuery);
  });
}

export function filterCharacterListRows(
  characters: CharacterListEntry[],
  query: string,
): CharacterListRowRef[] {
  const mapped = characters.map((row, idx) => ({ row, idx }));
  if (!query.trim()) return mapped;
  return mapped.filter(({ row }) => characterListEntryMatchesSearch(row, query));
}
