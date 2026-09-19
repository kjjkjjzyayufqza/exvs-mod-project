import { describe, expect, it } from "vitest";
import {
  buildSquadLineup,
  createDormantRouteDraft,
  enemySlotCount,
  nextFreeCourseId,
  nextFreeSceneNumber,
  playerSlotCount,
  setStageLineup,
  summariseIssues,
} from "./routeDraft";
import {
  MAX_ENEMY_SIDE_UNITS,
  SCENE_CLASS,
  TRIAD_ROUTE_SCHEMA,
  WIN_FLAG,
  type CourseRow,
  type DormantScene,
  type ValidationIssue,
} from "./types";

const PLAYER_SUIT = 733_026_001;
/** Stands in for the RX-78 row the character list resolves in the app. */
const RX78 = 733_026_002;
const MAP_HILLS = 0x523f_3b93;

function courseRow(overrides: Partial<CourseRow> = {}): CourseRow {
  return {
    rowId: 0x08c4_59ff,
    courseId: 1,
    name: "A-1",
    category: 1,
    numberInCategory: 1,
    sortOrder: 1,
    stageSceneKeys: [0x0100_0001, 0, 0],
    initiallyOpen: 1,
    unlockType: 0,
    unlockArg0: 0,
    unlockArg1: 0,
    variant: 0,
    goldScore: 120_000,
    starRating: 2,
    displayUnitIds: [PLAYER_SUIT, RX78, RX78, RX78],
    rotationGroup: 1,
    costLimitLow: 0,
    costLimitHigh: 0,
    alwaysOne: 1,
    extra: {},
    ...overrides,
  };
}

function dormantScene(sceneKey: number, packageHash: number, stageNumber: number): DormantScene {
  return {
    sceneKey,
    packageHash,
    hasBriefing: true,
    sceneName: `000triad_battle_a022_00${stageNumber}`,
    category: "a",
    courseNumber: 22,
    stageNumber,
  };
}

const dormant: DormantScene[] = [
  dormantScene(0x5974_0e8f, 0x6dc7_f821, 1),
  dormantScene(0xc07d_5f35, 0xf4ce_a99b, 2),
  dormantScene(0xb77a_6fa3, 0x83c9_990d, 3),
];

describe("buildSquadLineup", () => {
  it("puts one player suit against the requested number of enemies", () => {
    const lineup = buildSquadLineup({
      playerUnitId: PLAYER_SUIT,
      enemyUnitId: RX78,
      enemyCount: 10,
    });

    expect(playerSlotCount(lineup.slots)).toBe(1);
    expect(enemySlotCount(lineup.slots)).toBe(10);
    expect(lineup.slots[0]).toMatchObject({ slot: 0, unitId: PLAYER_SUIT, team: 0 });
    expect(lineup.slots.slice(1).every((slot) => slot.unitId === RX78)).toBe(true);
  });

  it("numbers enemy slots from 2 so slot 1 stays free for a CPU partner", () => {
    const lineup = buildSquadLineup({
      playerUnitId: PLAYER_SUIT,
      enemyUnitId: RX78,
      enemyCount: 3,
    });
    expect(lineup.slots.map((slot) => slot.slot)).toEqual([0, 2, 3, 4]);
  });

  it("adds a CPU partner on slot 1 when one is asked for", () => {
    const lineup = buildSquadLineup({
      playerUnitId: PLAYER_SUIT,
      partnerUnitId: PLAYER_SUIT,
      enemyUnitId: RX78,
      enemyCount: 2,
    });
    expect(playerSlotCount(lineup.slots)).toBe(2);
    expect(lineup.slots[1]).toMatchObject({ slot: 1, team: 0, isCpuPartner: true });
    expect(lineup.slots.map((slot) => slot.slot)).toEqual([0, 1, 2, 3]);
  });

  it("spreads the enemies across the arena instead of stacking them", () => {
    const lineup = buildSquadLineup({
      playerUnitId: PLAYER_SUIT,
      enemyUnitId: RX78,
      enemyCount: 10,
    });
    const enemies = lineup.slots.filter((slot) => slot.team === 1);
    const xs = enemies.map((slot) => slot.position[0]);
    expect(new Set(xs).size).toBe(xs.length);
    expect(enemies.every((slot) => slot.facingDegrees === 180)).toBe(true);
    expect(enemies.every((slot) => slot.position[2] > 0)).toBe(true);
  });

  it("refuses a squad the hardware cannot render", () => {
    expect(() =>
      buildSquadLineup({
        playerUnitId: PLAYER_SUIT,
        enemyUnitId: RX78,
        enemyCount: MAX_ENEMY_SIDE_UNITS + 1,
      }),
    ).toThrow(/enem/i);
    expect(() =>
      buildSquadLineup({ playerUnitId: PLAYER_SUIT, enemyUnitId: RX78, enemyCount: 0 }),
    ).toThrow();
  });

  it("builds a briefing whose slots mirror the spawn list", () => {
    const lineup = buildSquadLineup({
      playerUnitId: PLAYER_SUIT,
      enemyUnitId: RX78,
      enemyCount: 10,
      mapHash: MAP_HILLS,
      timeLimitSeconds: 300,
    });

    expect(lineup.briefing.mapHash).toBe(MAP_HILLS);
    expect(lineup.briefing.timeLimitSeconds).toBe(300);
    expect(lineup.briefing.slots.map((entry) => entry.slot)).toEqual(
      lineup.slots.map((slot) => slot.slot),
    );
    expect(lineup.briefing.units).toHaveLength(11);
    expect(lineup.briefing.units.filter((unit) => unit.unitId === RX78)).toHaveLength(10);
  });

  it("pairs a wipe-out win condition with the standard briefing class", () => {
    const lineup = buildSquadLineup({
      playerUnitId: PLAYER_SUIT,
      enemyUnitId: RX78,
      enemyCount: 10,
    });
    expect(lineup.script.winFlags & WIN_FLAG.wipeOut).toBeTruthy();
    expect(lineup.briefing.sceneClass).toBe(SCENE_CLASS.standard);
    expect(lineup.briefing.bossSlots).toEqual([]);
  });

  it("switches to a boss briefing when the fight is framed as a target hunt", () => {
    const lineup = buildSquadLineup({
      playerUnitId: PLAYER_SUIT,
      enemyUnitId: RX78,
      enemyCount: 10,
      objective: "destroy-targets",
    });
    expect(lineup.script.winFlags & WIN_FLAG.targetCount).toBeTruthy();
    expect(lineup.script.targetCount).toBe(10);
    expect(lineup.briefing.sceneClass).toBe(SCENE_CLASS.target);
    expect(lineup.briefing.hasTarget).toBe(true);
  });
});

describe("createDormantRouteDraft", () => {
  it("turns three dormant scenes into a ready-to-validate route", () => {
    const draft = createDormantRouteDraft({
      template: courseRow(),
      scenes: dormant,
      courseId: 253,
      name: "A-22",
      category: 1,
      numberInCategory: 22,
      firstSceneNumber: 900,
      briefings: dormant.map(() => ({
        sceneClass: SCENE_CLASS.standard,
        mapHash: MAP_HILLS,
        timeLimitSeconds: 180,
        hasTarget: false,
        bossSlots: [],
        units: [],
        slots: [],
      })),
    });

    expect(draft.schema).toBe(TRIAD_ROUTE_SCHEMA);
    expect(draft.mode).toBe("activate-dormant");
    expect(draft.course.rowId).toBeNull();
    expect(draft.course.templateRowId).toBe(0x08c4_59ff);
    expect(draft.course.courseId).toBe(253);
    expect(draft.course.name).toBe("A-22");
    expect(draft.stages.map((stage) => stage.index)).toEqual([1, 2, 3]);
    expect(draft.stages.map((stage) => stage.sceneNo)).toEqual([900, 901, 902]);
    expect(draft.stages.map((stage) => stage.scriptPackageHash)).toEqual(
      dormant.map((scene) => scene.packageHash),
    );
  });

  it("refuses a scene list the course table cannot hold", () => {
    expect(() =>
      createDormantRouteDraft({
        template: courseRow(),
        scenes: [...dormant, dormant[0]],
        courseId: 253,
        name: "A-22",
        category: 1,
        numberInCategory: 22,
        firstSceneNumber: 900,
        briefings: [],
      }),
    ).toThrow(/stage/i);
    expect(() =>
      createDormantRouteDraft({
        template: courseRow(),
        scenes: [],
        courseId: 253,
        name: "A-22",
        category: 1,
        numberInCategory: 22,
        firstSceneNumber: 900,
        briefings: [],
      }),
    ).toThrow();
  });
});

describe("setStageLineup", () => {
  it("writes the generated squad into one stage without touching the others", () => {
    const draft = createDormantRouteDraft({
      template: courseRow(),
      scenes: dormant,
      courseId: 253,
      name: "A-22",
      category: 1,
      numberInCategory: 22,
      firstSceneNumber: 900,
      briefings: dormant.map(() => ({
        sceneClass: SCENE_CLASS.standard,
        mapHash: MAP_HILLS,
        timeLimitSeconds: 180,
        hasTarget: false,
        bossSlots: [],
        units: [],
        slots: [],
      })),
    });
    const lineup = buildSquadLineup({
      playerUnitId: PLAYER_SUIT,
      enemyUnitId: RX78,
      enemyCount: 10,
      mapHash: MAP_HILLS,
    });

    const next = setStageLineup(draft, 1, lineup);

    expect(next).not.toBe(draft);
    expect(next.stages[0].script?.slots).toHaveLength(11);
    expect(next.stages[0].briefing.slots).toHaveLength(11);
    expect(next.stages[1].script).toBeNull();
    expect(draft.stages[0].script).toBeNull();
  });

  it("rejects a stage index the route does not have", () => {
    const draft = createDormantRouteDraft({
      template: courseRow(),
      scenes: [dormant[0]],
      courseId: 253,
      name: "A-22",
      category: 6,
      numberInCategory: 22,
      firstSceneNumber: 900,
      briefings: [
        {
          sceneClass: SCENE_CLASS.standard,
          mapHash: MAP_HILLS,
          timeLimitSeconds: 180,
          hasTarget: false,
          bossSlots: [],
          units: [],
          slots: [],
        },
      ],
    });
    const lineup = buildSquadLineup({
      playerUnitId: PLAYER_SUIT,
      enemyUnitId: RX78,
      enemyCount: 2,
    });
    expect(() => setStageLineup(draft, 3, lineup)).toThrow(/stage/i);
  });
});

describe("id allocation", () => {
  it("finds the first free course id at or above a starting point", () => {
    expect(nextFreeCourseId([1, 2, 3], 1)).toBe(4);
    expect(nextFreeCourseId([1, 2, 3], 253)).toBe(253);
    expect(nextFreeCourseId([253, 254], 253)).toBe(255);
  });

  it("finds the first free scene number at or above a starting point", () => {
    expect(nextFreeSceneNumber([900, 901], 900)).toBe(902);
    expect(nextFreeSceneNumber([], 900)).toBe(900);
  });
});

describe("summariseIssues", () => {
  const issues: ValidationIssue[] = [
    { code: "a", severity: "error", message: "", location: "course" },
    { code: "b", severity: "warning", message: "", location: "stage.1" },
    { code: "c", severity: "warning", message: "", location: "stage.1" },
    { code: "d", severity: "info", message: "", location: "stage.2" },
  ];

  it("counts by severity and flags whether saving is blocked", () => {
    expect(summariseIssues(issues)).toEqual({
      error: 1,
      warning: 2,
      info: 1,
      blocked: true,
    });
    expect(summariseIssues(issues.slice(1)).blocked).toBe(false);
    expect(summariseIssues([])).toEqual({ error: 0, warning: 0, info: 0, blocked: false });
  });
});
