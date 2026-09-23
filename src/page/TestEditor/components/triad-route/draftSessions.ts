/**
 * In-memory drafts for the arcade route editor.
 *
 * Opening a course used to always re-read briefings from disk, so typing a
 * name then clicking another row threw the edit away. Sessions keep the
 * unsaved document keyed by course row so switching back is instant and
 * lossless. A brand-new course has no row id yet; it lives under
 * {@link PENDING_SESSION_KEY}.
 */

import type {
  StageScriptConfig,
  TriadRouteDocument,
  ValidationIssue,
} from "@/services/triadRoute/types";
import type { ReferenceList } from "@/services/triadRoute/types";

export const PENDING_SESSION_KEY = "pending";

export type CachedChecks = {
  issues: ValidationIssue[];
  blocked: boolean;
  notChecked: ReferenceList[];
};

export type RouteDraftSession = {
  draft: TriadRouteDocument;
  dirty: boolean;
  checks: CachedChecks;
  scriptErrors: Record<number, string>;
  activeStage: number;
};

/** Stable map key for a course row, or the pending-new-course bucket. */
export function courseSessionKey(rowId: number | null | undefined): string {
  return rowId == null ? PENDING_SESSION_KEY : `row:${rowId}`;
}

export function putRouteSession(
  sessions: Map<string, RouteDraftSession>,
  session: RouteDraftSession,
): void {
  sessions.set(courseSessionKey(session.draft.course.rowId), session);
}

export function getRouteSession(
  sessions: Map<string, RouteDraftSession>,
  rowId: number | null | undefined,
): RouteDraftSession | undefined {
  return sessions.get(courseSessionKey(rowId));
}

export function deleteRouteSession(
  sessions: Map<string, RouteDraftSession>,
  rowId: number | null | undefined,
): void {
  sessions.delete(courseSessionKey(rowId));
}

/** Row ids whose cached (or current) session still has unsaved edits. */
export function dirtyCourseRowIds(
  sessions: Iterable<RouteDraftSession>,
  current?: { dirty: boolean; rowId: number | null } | null,
): number[] {
  const ids = new Set<number>();
  for (const session of sessions) {
    const rowId = session.draft.course.rowId;
    if (session.dirty && rowId != null) ids.add(rowId);
  }
  if (current?.dirty && current.rowId != null) ids.add(current.rowId);
  return [...ids];
}

/**
 * Carry the numbers a category renumber assigned into the cached drafts.
 *
 * A session holds the whole course row, so one opened before the renumber
 * would write the old number back the next time it is saved and quietly undo
 * the reorder. Numbers are keyed by course id because variant rows share one.
 */
export function applyCourseNumbers(
  sessions: Map<string, RouteDraftSession>,
  numbersByCourseId: Map<number, number>,
): void {
  for (const [key, session] of sessions) {
    const number = numbersByCourseId.get(session.draft.course.courseId);
    if (number === undefined || session.draft.course.numberInCategory === number) continue;
    sessions.set(key, {
      ...session,
      draft: {
        ...session.draft,
        course: { ...session.draft.course, numberInCategory: number },
      },
    });
  }
}

/**
 * Attach a loaded mission script to the draft the modder is looking at now.
 *
 * Returns `null` when the stage is gone or belongs to a different scene —
 * that is how an in-flight read is dropped after the modder switched rows,
 * instead of writing the old course back over the new one.
 */
export function mergeStageScript(
  draft: TriadRouteDocument,
  stageIndex: number,
  sceneKey: number,
  script: StageScriptConfig,
): TriadRouteDocument | null {
  const stage = draft.stages.find((entry) => entry.index === stageIndex);
  if (!stage || stage.sceneKey !== sceneKey) return null;
  return {
    ...draft,
    stages: draft.stages.map((entry) =>
      entry.index === stageIndex ? { ...entry, script } : entry,
    ),
  };
}
