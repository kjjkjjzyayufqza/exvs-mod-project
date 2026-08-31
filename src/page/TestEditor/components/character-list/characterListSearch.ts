import {
  CHARACTERLIST_STRING_FIELDS,
  type CharacterListEntry,
} from "@/models/characterListEntry";

export interface CharacterListRowRef {
  row: CharacterListEntry;
  idx: number;
}

const EMPTY_HIGHLIGHTS: ReadonlySet<number> = new Set();

export function normalizeCharacterHighlightId(entryId: number): number {
  return entryId >>> 0;
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
  highlightedEntryIds?: ReadonlySet<number>,
): CharacterListRowRef[] {
  const mapped = characters.map((row, idx) => ({ row, idx }));
  const highlighted = highlightedEntryIds ?? EMPTY_HIGHLIGHTS;
  const visible = !query.trim()
    ? mapped
    : mapped.filter(
        ({ row }) =>
          highlighted.has(normalizeCharacterHighlightId(row.entryId)) ||
          characterListEntryMatchesSearch(row, query),
      );

  if (highlighted.size === 0) return visible;

  const starred: CharacterListRowRef[] = [];
  const rest: CharacterListRowRef[] = [];
  for (const item of visible) {
    if (highlighted.has(normalizeCharacterHighlightId(item.row.entryId))) {
      starred.push(item);
    } else {
      rest.push(item);
    }
  }
  return starred.length === 0 ? visible : [...starred, ...rest];
}
