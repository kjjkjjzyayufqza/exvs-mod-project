import { describe, expect, it } from "vitest";
import { TRIAD_ROUTE_SCHEMA, type BriefingDraft, type CreatedScene, type TriadRouteDocument } from "@/services/triadRoute/types";
import {
  appendClonedStages,
  canExtendStages,
  defaultSceneNameForSlot,
  missingStageIndexes,
} from "./extendStages";

function emptyBriefing(): BriefingDraft {
  return {
    sceneClass: 0,
    mapHash: 0,
    timeLimitSeconds: 180,
    hasTarget: false,
    playerCast: [],
    bossCast: [],
    enemyCast: [],
    units: [],
    slots: [],
  };
}

function document(stageCount: number, category = 1): TriadRouteDocument {
  return {
    schema: TRIAD_ROUTE_SCHEMA,
    mode: "rewrite-existing",
    course: {
      rowId: 10,
      templateRowId: 10,
      courseId: 253,
      name: "A-30",
      category,
      numberInCategory: 30,
      initiallyOpen: true,
      unlockType: 0,
      unlockArg0: 0,
      unlockArg1: 0,
      variant: 0,
      goldScore: 0,
      starRating: 1,
      displayUnitIds: [0, 0, 0, 0],
    },
    stages: Array.from({ length: stageCount }, (_, index) => ({
      index: index + 1,
      sceneKey: 0x1000 + index,
      sceneName: `000triad_battle_a030_${String(index + 1).padStart(3, "0")}`,
      sceneNo: 250 + index,
      scriptPackageHash: 0x2000 + index,
      briefing: emptyBriefing(),
      script: null,
    })),
    ribbons: [],
  };
}

function created(name: string, key: number): CreatedScene {
  return {
    sceneName: name,
    sceneKey: key,
    packageHash: key + 1,
    scriptFolder: `/tmp/${name}`,
    scriptFile: `/tmp/${name}/${name}.mismsexc`,
    briefingFile: `/tmp/${name}_out.dat`,
  };
}

describe("missingStageIndexes", () => {
  it("asks an A-class one-stage course for stages 2 and 3", () => {
    expect(missingStageIndexes(1, 1)).toEqual([2, 3]);
    expect(canExtendStages(1, 1)).toBe(true);
  });

  it("hides the control on F-class and on a full course", () => {
    expect(missingStageIndexes(1, 6)).toEqual([]);
    expect(canExtendStages(6, 1)).toBe(false);
    expect(missingStageIndexes(3, 1)).toEqual([]);
    expect(canExtendStages(1, 3)).toBe(false);
  });
});

describe("defaultSceneNameForSlot", () => {
  it("keeps the first stage's course number, not the display name", () => {
    const draft = document(1);
    expect(defaultSceneNameForSlot(draft, 2)).toBe("000triad_battle_a030_002");
    expect(defaultSceneNameForSlot(draft, 3)).toBe("000triad_battle_a030_003");
  });
});

describe("appendClonedStages", () => {
  it("pins cloned stages into the empty slots without moving stage 1", () => {
    const draft = document(1);
    const next = appendClonedStages(draft, [
      {
        index: 2,
        created: created("000triad_battle_a030_002", 0xaaa1),
        briefing: emptyBriefing(),
        sceneNo: 251,
      },
      {
        index: 3,
        created: created("000triad_battle_a030_003", 0xaaa2),
        briefing: emptyBriefing(),
        sceneNo: 252,
      },
    ]);
    expect(next.stages.map((stage) => stage.index)).toEqual([1, 2, 3]);
    expect(next.stages[0].sceneKey).toBe(0x1000);
    expect(next.stages[1].origin).toBe("cloned");
    expect(next.stages[1].sceneName).toBe("000triad_battle_a030_002");
  });

  it("refuses to overwrite a slot that already exists", () => {
    expect(() =>
      appendClonedStages(document(1), [
        {
          index: 1,
          created: created("000triad_battle_a030_001", 0xaaa1),
          briefing: emptyBriefing(),
          sceneNo: 250,
        },
      ]),
    ).toThrow(/already on this course/);
  });
});
