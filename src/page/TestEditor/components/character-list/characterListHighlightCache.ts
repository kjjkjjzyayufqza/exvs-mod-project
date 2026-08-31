/**
 * Persisted Character List star highlights.
 *
 * Scoped by character_list.bin path. Each file stores a set of Character IDs
 * (entryId). Survives app restarts until the user clears a star.
 */

const STORAGE_PREFIX = "exvs2.characterList.entryHighlights:";

export function normalizeCharacterHighlightFilePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").toLowerCase();
}

function storageKey(filePath: string): string {
  return STORAGE_PREFIX + normalizeCharacterHighlightFilePath(filePath);
}

function parseEntryIds(raw: string): number[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid character list highlight cache");
  }
  const ids: number[] = [];
  for (const item of parsed) {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new Error("Invalid character list highlight id");
    }
    ids.push(item >>> 0);
  }
  return ids;
}

export function loadCharacterListHighlights(filePath: string): number[] {
  const trimmed = filePath.trim();
  if (!trimmed) return [];
  try {
    const raw = localStorage.getItem(storageKey(trimmed));
    if (!raw) return [];
    return parseEntryIds(raw);
  } catch {
    return [];
  }
}

export function saveCharacterListHighlights(filePath: string, entryIds: Iterable<number>): void {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error("Character list file path is required to save highlights");
  }
  const unique = new Set<number>();
  for (const id of entryIds) {
    if (typeof id !== "number" || !Number.isFinite(id)) {
      throw new Error("Character list highlight id must be a finite number");
    }
    unique.add(id >>> 0);
  }
  const key = storageKey(trimmed);
  try {
    if (unique.size === 0) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify([...unique]));
  } catch {
    // localStorage may be unavailable in some test environments
  }
}
