/**
 * Persisted Param Editor entry highlights.
 *
 * Scoped by source file path. Each file stores a set of entry ids (hashes).
 * Survives app restarts until the user manually clears a highlight.
 */

const STORAGE_PREFIX = "exvs2.paramEditor.entryHighlights:";

export function normalizeParamHighlightFilePath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").toLowerCase();
}

function storageKey(filePath: string): string {
  return STORAGE_PREFIX + normalizeParamHighlightFilePath(filePath);
}

function parseEntryIds(raw: string): number[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Invalid param entry highlight cache");
  }
  const ids: number[] = [];
  for (const item of parsed) {
    if (typeof item !== "number" || !Number.isFinite(item)) {
      throw new Error("Invalid param entry highlight id");
    }
    ids.push(item >>> 0);
  }
  return ids;
}

/** Load highlighted entry ids for a param file. Empty when unset or invalid. */
export function loadParamEntryHighlights(filePath: string): number[] {
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

/** Persist highlighted entry ids for a param file. Empty list removes the key. */
export function saveParamEntryHighlights(filePath: string, entryIds: Iterable<number>): void {
  const trimmed = filePath.trim();
  if (!trimmed) {
    throw new Error("Param file path is required to save entry highlights");
  }
  const unique = new Set<number>();
  for (const id of entryIds) {
    if (typeof id !== "number" || !Number.isFinite(id)) {
      throw new Error("Param entry highlight id must be a finite number");
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
