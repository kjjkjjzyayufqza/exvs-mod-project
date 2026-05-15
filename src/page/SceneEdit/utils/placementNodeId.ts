/** Suffix for viewport hit-testing: distinguishes multiple placement rows per sub-model folder. */
export const PLACEMENT_ROW_SUFFIX = "__row_";

export function formatPlacementViewportNodeId(folderName: string, placementEntryIndex: number): string {
  return `${folderName}${PLACEMENT_ROW_SUFFIX}${placementEntryIndex}`;
}

export function parsePlacementViewportNodeId(
  id: string,
): { folderName: string; placementEntryIndex: number } | null {
  const i = id.lastIndexOf(PLACEMENT_ROW_SUFFIX);
  if (i === -1) {
    return null;
  }
  const folderName = id.slice(0, i);
  const n = parseInt(id.slice(i + PLACEMENT_ROW_SUFFIX.length), 10);
  if (!Number.isFinite(n) || folderName.length === 0) {
    return null;
  }
  return { folderName, placementEntryIndex: n };
}
