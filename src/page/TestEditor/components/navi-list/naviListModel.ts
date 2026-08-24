import type { NaviListEntry } from "@/models/naviListEntry";

export function createEmptyNaviEntry(entryId: number, uniqueId: number): NaviListEntry {
  return {
    entryId,
    sharedResourceHashA: 0,
    costumeIndex: 0,
    sharedResourceHashB: 0,
    costumeResourceHashA: 0,
    sharedResourceHashC: 0,
    characterUniqueId: uniqueId,
    displayName: `New Navi ${uniqueId}`,
    costumeResourceHashB: 0,
    sharedResourceHashD: 0,
    sharedResourceHashE: 0,
    seriesListEntryId: 0,
    enabledCode: 1,
  };
}

export function nextNaviEntryId(entries: Array<{ entryId: number }>): number {
  if (entries.length === 0) return 1;
  return Math.max(...entries.map((entry) => entry.entryId || 0), 0) + 1;
}

export function nextNaviUniqueId(entries: Array<{ characterUniqueId: number }>): number {
  if (entries.length === 0) return 1;
  return Math.max(...entries.map((entry) => entry.characterUniqueId || 0), 0) + 1;
}

export function nextCostumeIndex(
  entries: Array<{ characterUniqueId: number; costumeIndex: number }>,
  uniqueId: number,
): number {
  const matching = entries.filter((entry) => entry.characterUniqueId === uniqueId);
  if (matching.length === 0) return 0;
  return Math.max(...matching.map((entry) => entry.costumeIndex || 0), 0) + 1;
}

export function countNaviRowsForUniqueId(
  entries: Array<{ entryId: number; characterUniqueId: number }>,
  uniqueId: number,
  excludeEntryId?: number,
): number {
  return entries.filter(
    (entry) =>
      entry.characterUniqueId === uniqueId &&
      (excludeEntryId === undefined || entry.entryId !== excludeEntryId),
  ).length;
}
