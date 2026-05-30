import type { ExvsStageValidationError } from "./sceneSessionService";

/**
 * Derive the content-level folder name (== outliner sub-model node id) for a
 * validation error from its numatb/texture path.
 *
 * The Rust validator reports an absolute path under the content root, e.g.
 * `.../<content>/base/<sub>/x__maya__.numatb`. The first path segment that
 * matches a known sub-model folder name identifies the offending object.
 */
export function deriveErrorFolder(
  path: string | null,
  knownFolderNames: readonly string[],
): string | null {
  if (!path) return null;
  const segments = path.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) return null;
  const known = new Map(knownFolderNames.map((name) => [name.toLowerCase(), name]));
  for (const segment of segments) {
    const match = known.get(segment.toLowerCase());
    if (match) return match;
  }
  return null;
}

/** Map of outliner node id (folder name) -> error count, for outliner marking. */
export function buildErrorFolderCounts(
  errors: readonly ExvsStageValidationError[],
  knownFolderNames: readonly string[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const error of errors) {
    const folder = deriveErrorFolder(error.path, knownFolderNames);
    if (!folder) continue;
    counts[folder] = (counts[folder] ?? 0) + 1;
  }
  return counts;
}

export interface GroupedValidationErrors {
  /** Folder name (outliner node id), or null when it cannot be resolved. */
  folder: string | null;
  errors: ExvsStageValidationError[];
}

/** Group errors by their derived folder name for display in the error dialog. */
export function groupErrorsByFolder(
  errors: readonly ExvsStageValidationError[],
  knownFolderNames: readonly string[],
): GroupedValidationErrors[] {
  const order: (string | null)[] = [];
  const byFolder = new Map<string | null, ExvsStageValidationError[]>();
  for (const error of errors) {
    const folder = deriveErrorFolder(error.path, knownFolderNames);
    if (!byFolder.has(folder)) {
      byFolder.set(folder, []);
      order.push(folder);
    }
    byFolder.get(folder)!.push(error);
  }
  return order.map((folder) => ({ folder, errors: byFolder.get(folder)! }));
}
