export interface CharacterUniqueIdEntry {
  entryId: number;
  characterUniqueId: number;
}

/** Entry IDs (other than excludeEntryId) that already use this unique ID. */
export function findCharacterUniqueIdConflicts(
  uniqueId: number,
  entries: CharacterUniqueIdEntry[],
  excludeEntryId?: number,
): number[] {
  return entries
    .filter(
      (entry) =>
        entry.characterUniqueId === uniqueId &&
        (excludeEntryId === undefined || entry.entryId !== excludeEntryId),
    )
    .map((entry) => entry.entryId);
}

export function isCharacterUniqueIdUnique(
  uniqueId: number,
  entries: CharacterUniqueIdEntry[],
  excludeEntryId?: number,
): boolean {
  return findCharacterUniqueIdConflicts(uniqueId, entries, excludeEntryId).length === 0;
}

/** Next free unique ID: max(existing, 0) + 1 (matches list "Add character" behavior). */
export function pickNextCharacterUniqueId(entries: CharacterUniqueIdEntry[]): number {
  if (entries.length === 0) return 1;
  return Math.max(...entries.map((entry) => entry.characterUniqueId || 0), 0) + 1;
}
