/**
 * Pure helpers for building and editing a route project.
 *
 * Nothing here touches the filesystem: the view keeps a draft document in
 * state, these functions derive the next draft, and the Tauri layer only sees
 * the finished project. Keeping the squad and briefing generators here is what
 * lets "one suit against ten" be a single call the wizard and the slot editor
 * both use.
 */

import {
  MAX_ENEMY_SIDE_UNITS,
  MAX_PLAYER_SIDE_UNITS,
  MAX_STAGES_PER_COURSE,
  LOSE_FLAG,
  SCENE_CLASS,
  TRIAD_ROUTE_SCHEMA,
  WIN_FLAG,
  type BriefingDraft,
  type CourseRow,
  type DormantScene,
  type IssueSeverity,
  type ScriptSlot,
  type StageDraft,
  type StageScriptConfig,
  type TriadRouteDocument,
  type ValidationIssue,
} from "./types";

/** Slot 0 is the player, slot 1 is reserved for the CPU partner. */
const PLAYER_SLOT = 0;
const PARTNER_SLOT = 1;
const FIRST_ENEMY_SLOT = 2;

/** Arena geometry for a generated enemy line, in engine units. */
const ENEMY_ARC_RADIUS = 700;
const ENEMY_ARC_SPREAD_DEGREES = 120;
const ENEMY_ALTITUDE = 160;
/** Enemies are placed in front of the player and turned to face them. */
const ENEMY_FACING_DEGREES = 180;
/** Frames the generated fly-in lasts. */
const ENEMY_INTRO_FRAMES = 60;

const DEFAULT_PLAYER_TEAM_COST = 3000;
const DEFAULT_ENEMY_UNIT_COST = 2000;
const DEFAULT_TIME_LIMIT_SECONDS = 180;
const DEFAULT_PLAYER_AI_LEVEL = 5;
const DEFAULT_ENEMY_AI_LEVEL = 4;
/** The shipped courses all lose on "cost gone or time up". */
const DEFAULT_LOSE_FLAGS = LOSE_FLAG.costExhausted | LOSE_FLAG.timeUp;

export type SquadObjective = "wipe-out" | "destroy-targets";

export interface SquadLineupOptions {
  playerUnitId: number;
  /** Adds a CPU partner on slot 1 when set. */
  partnerUnitId?: number;
  enemyUnitId: number;
  enemyCount: number;
  /** Leave unset to keep whichever map the stage already uses. */
  mapHash?: number;
  bgmHash?: number;
  timeLimitSeconds?: number;
  objective?: SquadObjective;
  playerTeamCost?: number;
  /** Cost charged per enemy kill; the enemy team pool is this times the count. */
  enemyUnitCost?: number;
  playerPilotNameHash?: number;
  enemyPilotNameHash?: number;
}

/** A generated fight: the spawn list plus the briefing that mirrors it. */
export interface SquadLineup {
  slots: ScriptSlot[];
  script: StageScriptConfig;
  briefing: BriefingDraft;
}

/**
 * Place `count` units on an arc in front of the player.
 *
 * A straight line stacks badly once past a handful of units and an arc keeps
 * every enemy inside the opening camera, which matters when ten of them spawn
 * at once.
 */
function arcPosition(index: number, count: number): [number, number, number] {
  const step = count > 1 ? ENEMY_ARC_SPREAD_DEGREES / (count - 1) : 0;
  const degrees = count > 1 ? -ENEMY_ARC_SPREAD_DEGREES / 2 + step * index : 0;
  const radians = (degrees * Math.PI) / 180;
  // The bytecode stores whole numbers, so the arc is rounded here rather than
  // silently truncated when the script is written.
  return [
    Math.round(ENEMY_ARC_RADIUS * Math.sin(radians)),
    ENEMY_ALTITUDE,
    Math.round(ENEMY_ARC_RADIUS * Math.cos(radians)),
  ];
}

/** Build a one-side-versus-many fight and the briefing that shows it. */
export function buildSquadLineup(options: SquadLineupOptions): SquadLineup {
  const {
    playerUnitId,
    partnerUnitId,
    enemyUnitId,
    enemyCount,
    mapHash = 0,
    bgmHash = 0,
    timeLimitSeconds = DEFAULT_TIME_LIMIT_SECONDS,
    objective = "wipe-out",
    playerTeamCost = DEFAULT_PLAYER_TEAM_COST,
    enemyUnitCost = DEFAULT_ENEMY_UNIT_COST,
    playerPilotNameHash = 0,
    enemyPilotNameHash = 0,
  } = options;

  if (!Number.isInteger(enemyCount) || enemyCount < 1) {
    throw new Error(`enemy count must be at least 1, got ${enemyCount}`);
  }
  if (enemyCount > MAX_ENEMY_SIDE_UNITS) {
    throw new Error(
      `${enemyCount} enemies exceed the measured on-screen limit of ${MAX_ENEMY_SIDE_UNITS}`,
    );
  }
  if (timeLimitSeconds <= 0) {
    throw new Error(`time limit must be positive, got ${timeLimitSeconds}`);
  }

  const slots: ScriptSlot[] = [
    {
      slot: PLAYER_SLOT,
      unitId: playerUnitId,
      team: 0,
      isCpuPartner: false,
      showPilotName: playerPilotNameHash !== 0,
      pilotNameHash: playerPilotNameHash,
      position: [0, 0, 0],
      facingDegrees: 0,
      introAction: 0,
      introActionFrames: 1,
      aiLevel: DEFAULT_PLAYER_AI_LEVEL,
      displayOrder: 0,
    },
  ];

  if (partnerUnitId !== undefined) {
    slots.push({
      slot: PARTNER_SLOT,
      unitId: partnerUnitId,
      team: 0,
      isCpuPartner: true,
      showPilotName: false,
      pilotNameHash: 0,
      position: [150, 0, 0],
      facingDegrees: 0,
      introAction: 0,
      introActionFrames: 1,
      aiLevel: DEFAULT_PLAYER_AI_LEVEL,
      displayOrder: 1,
    });
  }
  if (slots.length > MAX_PLAYER_SIDE_UNITS) {
    throw new Error(`the player side holds at most ${MAX_PLAYER_SIDE_UNITS} units`);
  }

  for (let index = 0; index < enemyCount; index += 1) {
    slots.push({
      slot: FIRST_ENEMY_SLOT + index,
      unitId: enemyUnitId,
      team: 1,
      isCpuPartner: false,
      showPilotName: enemyPilotNameHash !== 0,
      pilotNameHash: enemyPilotNameHash,
      position: arcPosition(index, enemyCount),
      facingDegrees: ENEMY_FACING_DEGREES,
      introAction: 2,
      introActionFrames: ENEMY_INTRO_FRAMES,
      aiLevel: DEFAULT_ENEMY_AI_LEVEL,
      displayOrder: index,
    });
  }

  const destroyTargets = objective === "destroy-targets";
  const script: StageScriptConfig = {
    mapHash,
    teamCosts: [playerTeamCost, enemyUnitCost * enemyCount, 0, 0, 0, 0],
    winFlags: destroyTargets ? WIN_FLAG.targetCount : WIN_FLAG.wipeOut,
    loseFlags: DEFAULT_LOSE_FLAGS,
    targetCount: destroyTargets ? enemyCount : 0,
    allowedLosses: 0,
    bgmHash,
    slots,
    openingSlots: slots.filter((slot) => slot.team !== 0).map((slot) => slot.slot),
    waves: [],
  };

  const briefing: BriefingDraft = {
    sceneClass: destroyTargets ? SCENE_CLASS.target : SCENE_CLASS.standard,
    mapHash,
    timeLimitSeconds,
    hasTarget: destroyTargets,
    bossSlots: [],
    units: slots.map((slot) => ({
      word0: 0,
      unitId: slot.unitId,
      pilotId: 0,
      word3: 0,
    })),
    slots: slots.map((slot) => ({
      unitId: slot.unitId,
      flags: 1,
      slot: slot.slot,
      order: slot.displayOrder,
    })),
  };

  return { slots, script, briefing };
}

export function playerSlotCount(slots: ScriptSlot[]): number {
  return slots.filter((slot) => slot.team === 0).length;
}

export function enemySlotCount(slots: ScriptSlot[]): number {
  return slots.filter((slot) => slot.team !== 0).length;
}

export interface DormantRouteOptions {
  /** Shipped course row whose unnamed columns the new row inherits. */
  template: CourseRow;
  scenes: DormantScene[];
  /** Briefings already read from the outmission package, in scene order. */
  briefings: BriefingDraft[];
  courseId: number;
  name: string;
  category: number;
  numberInCategory: number;
  firstSceneNumber: number;
  initiallyOpen?: boolean;
  starRating?: number;
  goldScore?: number;
  displayUnitIds?: [number, number, number, number];
}

/**
 * Turn a group of dormant scenes into a route project.
 *
 * This is the low-risk path: the scenes already have scripts, sceneidtable
 * rows and briefings, so the only new data is a course row and its scene-list
 * rows.
 */
export function createDormantRouteDraft(options: DormantRouteOptions): TriadRouteDocument {
  const { template, scenes, briefings } = options;
  if (scenes.length < 1) {
    throw new Error("a route needs at least one stage");
  }
  if (scenes.length > MAX_STAGES_PER_COURSE) {
    throw new Error(
      `a course plays at most ${MAX_STAGES_PER_COURSE} stages, got ${scenes.length}`,
    );
  }
  const keys = new Set(scenes.map((scene) => scene.sceneKey));
  if (keys.size !== scenes.length) {
    throw new Error("the same scene cannot be used for two stages");
  }
  if (briefings.length !== scenes.length) {
    throw new Error(
      `expected one briefing per stage: ${scenes.length} stages, ${briefings.length} briefings`,
    );
  }

  const stages: StageDraft[] = scenes.map((scene, index) => ({
    index: index + 1,
    sceneKey: scene.sceneKey,
    sceneName: scene.sceneName,
    sceneNo: options.firstSceneNumber + index,
    scriptPackageHash: scene.packageHash,
    briefing: briefings[index],
    script: null,
  }));

  return {
    schema: TRIAD_ROUTE_SCHEMA,
    mode: "activate-dormant",
    course: {
      rowId: null,
      templateRowId: template.rowId,
      courseId: options.courseId,
      name: options.name,
      category: options.category,
      numberInCategory: options.numberInCategory,
      initiallyOpen: options.initiallyOpen ?? true,
      unlockType: 0,
      unlockArg0: 0,
      unlockArg1: 0,
      variant: 0,
      goldScore: options.goldScore ?? template.goldScore,
      starRating: options.starRating ?? template.starRating,
      displayUnitIds: options.displayUnitIds ?? [...template.displayUnitIds],
    },
    stages,
    ribbons: [],
  };
}

/**
 * Write a generated squad into one stage, returning a new document.
 *
 * A lineup built without a map keeps the stage's current one, so generating a
 * squad never silently moves the fight to nowhere.
 */
export function setStageLineup(
  document: TriadRouteDocument,
  stageIndex: number,
  lineup: SquadLineup,
): TriadRouteDocument {
  const target = document.stages.find((stage) => stage.index === stageIndex);
  if (!target) {
    throw new Error(`the route has no stage ${stageIndex}`);
  }
  const mapHash = lineup.script.mapHash !== 0 ? lineup.script.mapHash : target.briefing.mapHash;

  return {
    ...document,
    stages: document.stages.map((stage) =>
      stage.index === stageIndex
        ? {
            ...stage,
            script: { ...lineup.script, mapHash },
            briefing: { ...lineup.briefing, mapHash },
          }
        : stage,
    ),
  };
}

function nextFreeNumber(used: number[], start: number): number {
  const taken = new Set(used);
  let candidate = start;
  while (taken.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

export function nextFreeCourseId(used: number[], start: number): number {
  return nextFreeNumber(used, start);
}

export function nextFreeSceneNumber(used: number[], start: number): number {
  return nextFreeNumber(used, start);
}

export type IssueSummary = Record<IssueSeverity, number> & { blocked: boolean };

/** Count issues per severity so the panel header can show the state at a glance. */
export function summariseIssues(issues: ValidationIssue[]): IssueSummary {
  const summary: IssueSummary = { error: 0, warning: 0, info: 0, blocked: false };
  for (const issue of issues) {
    summary[issue.severity] += 1;
  }
  summary.blocked = summary.error > 0;
  return summary;
}
