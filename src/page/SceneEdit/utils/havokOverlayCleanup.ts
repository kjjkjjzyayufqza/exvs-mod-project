/**
 * Resolve an HKT collision-overlay sourceId back to the owning model's folder name.
 *
 * Mirrors the keying used when collision is loaded or generated (see SceneEdit page):
 * - disk-loaded HKT:   "folderName/map_hit.hkt" | "folderName\\map_hit.hkt" -> "folderName"
 * - mesh-generated HKT: "mesh-hkt-folderName" -> "folderName"
 * - imported-DAE (in-memory): a bare sessionImportId, returned unchanged (no folder)
 */
export function resolveHavokFolderName(sourceId: string): string {
  if (sourceId.startsWith("mesh-hkt-")) {
    return sourceId.slice("mesh-hkt-".length);
  }
  if (/[/\\]/.test(sourceId)) {
    return sourceId.split(/[/\\]/)[0] ?? sourceId;
  }
  return sourceId;
}

/**
 * Collect every overlay sourceId whose owning model folder is in `folderNames`.
 * Used to tear down the collision overlay when a sub-model or the base model is deleted,
 * keeping the in-memory viewport consistent with the deletion (bare sessionImportId keys
 * belonging to imported-DAE objects never match a folder name, so they are left untouched).
 */
export function collectHavokSourceIdsForFolders(
  sourceIds: Iterable<string>,
  folderNames: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  for (const sourceId of sourceIds) {
    if (folderNames.has(resolveHavokFolderName(sourceId))) {
      out.push(sourceId);
    }
  }
  return out;
}
