import { describe, expect, it } from "vitest";
import { TRIAD_ROUTE_SCHEMA, type StageScriptConfig, type TriadRouteDocument } from "@/services/triadRoute/types";
import {
  courseSessionKey,
  deleteRouteSession,
  dirtyCourseRowIds,
  getRouteSession,
  mergeStageScript,
  PENDING_SESSION_KEY,
  putRouteSession,
  type RouteDraftSession,
} from "./draftSessions";

const emptyScript: StageScriptConfig = {
  mapHash: 0,
  teamCosts: [],
  winFlags: 1,
  loseFlags: 4,
  targetCount: 0,
  allowedLosses: 0,
  bgmHash: 0,
  slots: [],
  openingSlots: [],
  waves: [],
};

function document(rowId: number | null, name = "A-1"): TriadRouteDocument {
  return {
    schema: TRIAD_ROUTE_SCHEMA,
    mode: rowId == null ? "new-scenes" : "rewrite-existing",
    course: {
      rowId,
      templateRowId: 1,
      courseId: 1,
      name,
      category: 1,
      numberInCategory: 1,
      initiallyOpen: true,
      unlockType: 0,
      unlockArg0: 0,
      unlockArg1: 0,
      variant: 0,
      goldScore: 0,
      starRating: 1,
      displayUnitIds: [0, 0, 0, 0],
    },
    stages: [
      {
        index: 1,
        sceneKey: 0x1111,
        sceneName: "000triad_battle_a001_001",
        sceneNo: 1,
        scriptPackageHash: 0x2222,
        briefing: {
          sceneClass: 0,
          mapHash: 0,
          timeLimitSeconds: 180,
          hasTarget: false,
          playerCast: [],
          bossCast: [],
          enemyCast: [],
          units: [],
          slots: [],
        },
        script: null,
      },
    ],
    ribbons: [],
  };
}

function session(draft: TriadRouteDocument, dirty = true): RouteDraftSession {
  return {
    draft,
    dirty,
    checks: { issues: [], blocked: false, notChecked: [] },
    scriptErrors: {},
    activeStage: 1,
  };
}

describe("courseSessionKey", () => {
  it("buckets a new course without a row id", () => {
    expect(courseSessionKey(null)).toBe(PENDING_SESSION_KEY);
    expect(courseSessionKey(undefined)).toBe(PENDING_SESSION_KEY);
  });

  it("keys an existing course by its table row", () => {
    expect(courseSessionKey(10)).toBe("row:10");
  });
});

describe("route session map", () => {
  it("restores an unsaved edit after switching away and back", () => {
    const sessions = new Map<string, RouteDraftSession>();
    putRouteSession(sessions, session(document(10, "A-30-edit")));
    putRouteSession(sessions, session(document(11, "B-1")));

    expect(getRouteSession(sessions, 10)?.draft.course.name).toBe("A-30-edit");
    expect(dirtyCourseRowIds(sessions.values())).toEqual(expect.arrayContaining([10, 11]));
  });

  it("forgets a discarded course without touching the others", () => {
    const sessions = new Map<string, RouteDraftSession>();
    putRouteSession(sessions, session(document(10, "keep")));
    putRouteSession(sessions, session(document(11, "drop")));
    deleteRouteSession(sessions, 11);

    expect(getRouteSession(sessions, 10)?.draft.course.name).toBe("keep");
    expect(getRouteSession(sessions, 11)).toBeUndefined();
  });

  it("includes the open course when it is dirty but not yet stashed", () => {
    const sessions = new Map<string, RouteDraftSession>();
    expect(dirtyCourseRowIds(sessions.values(), { dirty: true, rowId: 42 })).toEqual([42]);
    expect(dirtyCourseRowIds(sessions.values(), { dirty: false, rowId: 42 })).toEqual([]);
  });
});

describe("mergeStageScript", () => {
  it("keeps edits made while the script was still loading", () => {
    const edited = document(10, "typed-name");
    const merged = mergeStageScript(edited, 1, 0x1111, emptyScript);
    expect(merged?.course.name).toBe("typed-name");
    expect(merged?.stages[0].script).toEqual(emptyScript);
  });

  it("drops a late read after the modder switched to another scene", () => {
    const otherCourse = document(11, "B-1");
    otherCourse.stages[0].sceneKey = 0x9999;
    expect(mergeStageScript(otherCourse, 1, 0x1111, emptyScript)).toBeNull();
  });
});
