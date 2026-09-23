/**
 * DTOs for the arcade (Triad Battle) route editor.
 *
 * These mirror the serde shapes in `src-tauri/src/format/triad_route_*.rs`
 * exactly; the Rust side is the source of truth for every field name.
 */

export const TRIAD_ROUTE_SCHEMA = "exvs2.triad-route/v1";

/** Player side plus CPU partner: the measured on-screen ceiling. */
export const MAX_PLAYER_SIDE_UNITS = 2;
/** Enemy units that can share the screen before the game degrades. */
export const MAX_ENEMY_SIDE_UNITS = 12;
export const MAX_STAGES_PER_COURSE = 3;

/** Briefing scene class (`InfoClass_mc`). */
export const SCENE_CLASS = {
  standard: 0,
  random: 1,
  target: 2,
  boss: 3,
} as const;

/** Win-condition bits read by the mission template. */
export const WIN_FLAG = {
  wipeOut: 0x1,
  targetCount: 0x2,
  survive: 0x4,
} as const;

/** Lose-condition bits. */
export const LOSE_FLAG = {
  costExhausted: 0x1,
  importantUnitsLost: 0x2,
  timeUp: 0x4,
} as const;

/** Unlock types the editor may write; the rest are read-only. */
export const UNLOCK_TYPE = {
  serverOnly: 0,
  clearCourse: 1,
  clearCount: 3,
} as const;

/** Intro action a slot plays when it spawns (`0x400` P37). */
export const INTRO_ACTION = {
  still: 0,
  runForward: 1,
  flyForward: 2,
  shortHop: 3,
  roll: 4,
} as const;

export type RouteBuildMode = "rewrite-existing" | "activate-dormant" | "new-scenes";
export type IssueSeverity = "error" | "warning" | "info";

export interface CourseRow {
  rowId: number;
  courseId: number;
  name: string;
  category: number;
  numberInCategory: number;
  sortOrder: number;
  stageSceneKeys: [number, number, number];
  initiallyOpen: number;
  unlockType: number;
  unlockArg0: number;
  unlockArg1: number;
  variant: number;
  goldScore: number;
  starRating: number;
  displayUnitIds: [number, number, number, number];
  rotationGroup: number;
  costLimitLow: number;
  costLimitHigh: number;
  alwaysOne: number;
  extra: Record<string, number>;
}

export interface SceneRow {
  sceneKey: number;
  sceneNo: number;
  extra: Record<string, number>;
}

export interface RibbonRow {
  rowId: number;
  ribbonId: number;
  courseId: number;
  kind: number;
  threshold: number;
  extra: Record<string, number>;
}

export interface SceneIdRow {
  sceneKey: number;
  packageHash: number;
  /** Official name recovered from the key; the unpacked package is called this. */
  sceneName: string | null;
}

export interface PilotNameEntry {
  nameHash: number;
  name: string;
}

/** A scene that ships complete but that no course plays. */
export interface DormantScene {
  sceneKey: number;
  packageHash: number;
  hasBriefing: boolean;
  /** Official name recovered from the key, when it follows the naming rule. */
  sceneName: string | null;
  category: string | null;
  courseNumber: number | null;
  stageNumber: number | null;
}

/** Unused scenes that belong to the same would-be course, e.g. A-22 1..3. */
export interface DormantSceneGroup {
  key: string;
  label: string;
  category: string | null;
  courseNumber: number | null;
  scenes: DormantScene[];
}

/**
 * Group unused scenes into route-sized sets.
 *
 * Scenes whose key decodes to a name are grouped by their would-be course and
 * ordered by stage; anything the naming rule does not cover stays on its own
 * so it is still claimable, just without a readable label.
 */
export function groupDormantScenes(scenes: DormantScene[]): DormantSceneGroup[] {
  const groups = new Map<string, DormantSceneGroup>();
  for (const scene of scenes) {
    const named = scene.category !== null && scene.courseNumber !== null;
    const key = named
      ? `${scene.category}-${scene.courseNumber}`
      : `key-${scene.sceneKey >>> 0}`;
    const label = named
      ? `${(scene.category ?? "").toUpperCase()}-${scene.courseNumber}`
      : formatHash(scene.sceneKey);
    const group = groups.get(key) ?? {
      key,
      label,
      category: scene.category,
      courseNumber: scene.courseNumber,
      scenes: [],
    };
    group.scenes.push(scene);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.scenes.sort((a, b) => (a.stageNumber ?? 0) - (b.stageNumber ?? 0));
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export interface TriadTableFiles {
  course: string;
  scene: string;
  ribbon: string | null;
}

/**
 * What identifies a course row on the select screen.
 *
 * `courseId` alone does not: the shipped table holds several rows per id, one
 * per variant, and the game's lookup lands on whichever of them sorts first.
 */
export interface CourseRowIdentity {
  courseId: number;
  variant: number;
}

/**
 * The tables a draft is checked against, as loaded — nothing is pre-filtered
 * to exclude the route being edited. A snapshot is read once and reused for
 * every draft, so it cannot know which row the modder later opens; the Rust
 * checks exclude it themselves from the document they are handed.
 */
export interface RouteValidationContext {
  /** Every course row in the table, keyed by row id. */
  courseRows: Record<string, CourseRowIdentity>;
  sceneIdTable: Record<string, number>;
  sceneListKeys: number[];
  briefingSceneKeys: number[];
  availablePackageHashes: number[];
  /** Scene number each scene-list row reports, keyed by scene key. */
  sceneNumbersByKey: Record<string, number>;
  knownUnitIds: number[];
  knownPilotHashes: number[];
  knownMapHashes: number[];
  knownBgmHashes: number[];
}

export interface TriadWorkspaceSnapshot {
  files: TriadTableFiles;
  courses: CourseRow[];
  scenes: SceneRow[];
  ribbons: RibbonRow[];
  sceneIdRows: SceneIdRow[];
  briefingSceneKeys: number[];
  pilotNames: PilotNameEntry[];
  dormantScenes: DormantScene[];
  validationContext: RouteValidationContext;
}

export interface TriadWorkspacePaths {
  triadListDir: string;
  sceneIdTableDir: string;
  outmissionDir: string;
  pilotNameListDir: string | null;
  packageRoots: string[];
  /** Unpacked 051mission folders holding one package per mission script. */
  scriptDirs: string[];
}

/** One entry of the briefing's cast: a suit + pilot the screen can draw. */
export interface BsfoBriefingUnit {
  word0: number;
  unitId: number;
  pilotId: number;
  word3: number;
}

/**
 * What the briefing knows about one battle slot.
 *
 * The entry's **position** in `BriefingDraft.slots` is the slot number, the
 * same one the mission script's `sys_0(0x400, <slot>, ...)` defines.
 */
export interface BsfoSlotEntry {
  unitId: number;
  flags: number;
  /** Index into `BriefingDraft.units`; `NO_CAST` for an undefined slot. */
  castIndex: number;
  /** Undecoded (0..3 in shipped files); carried through verbatim. */
  word3: number;
}

/** Empty display position, or a slot the script does not define. */
export const NO_CAST = -1;

/** Portraits the loading screen holds, which is the BSFO sec0 layout. */
export const MAX_PLAYER_SIDE_DRAWN = 2;
export const MAX_ENEMY_SIDE_DRAWN = 3;

/**
 * The loading screen for one stage.
 *
 * `playerCast` / `bossCast` / `enemyCast` index into `units` and are the only
 * thing the screen draws. `slots` is the whole battle roster including every
 * later wave, so it is normally much longer than the six enemy portraits.
 */
export interface BriefingDraft {
  sceneClass: number;
  mapHash: number;
  timeLimitSeconds: number;
  hasTarget: boolean;
  playerCast: number[];
  bossCast: number[];
  enemyCast: number[];
  units: BsfoBriefingUnit[];
  slots: BsfoSlotEntry[];
}

export interface ScriptSlot {
  slot: number;
  unitId: number;
  /** 0 = player side, 1 = enemy side. */
  team: number;
  isCpuPartner: boolean;
  showPilotName: boolean;
  pilotNameHash: number;
  /** Spawn position; the bytecode stores whole numbers here. */
  position: [number, number, number];
  facingDegrees: number;
  introAction: number;
  introActionFrames: number;
  aiLevel: number;
  displayOrder: number;
}

/**
 * One wave of the shipped phase template: wait until at most
 * `enemiesAliveAtMost` units are left, count `delaySeconds` down, then deploy.
 */
export interface ScriptWave {
  enemiesAliveAtMost: number;
  delaySeconds: number;
  deploySlots: number[];
  messageHash: number | null;
}

export interface StageScriptConfig {
  mapHash: number;
  teamCosts: number[];
  winFlags: number;
  loseFlags: number;
  targetCount: number;
  allowedLosses: number;
  bgmHash: number;
  slots: ScriptSlot[];
  /** Slots deployed the moment the battle starts. */
  openingSlots: number[];
  waves: ScriptWave[];
}

/** How a stage's files were obtained. Cloned stages may insert sceneidtable rows on save. */
export type StageOrigin = "existing" | "cloned";

export interface StageDraft {
  index: number;
  sceneKey: number;
  sceneName: string | null;
  sceneNo: number;
  scriptPackageHash: number;
  briefing: BriefingDraft;
  script: StageScriptConfig | null;
  origin?: StageOrigin;
}

export interface CourseDraft {
  rowId: number | null;
  templateRowId: number;
  courseId: number;
  name: string;
  category: number;
  numberInCategory: number;
  initiallyOpen: boolean;
  unlockType: number;
  unlockArg0: number;
  unlockArg1: number;
  variant: number;
  goldScore: number;
  starRating: number;
  displayUnitIds: [number, number, number, number];
}

export interface RibbonDraft {
  rowId: number | null;
  ribbonId: number;
  kind: number;
  threshold: number;
}

export interface TriadRouteDocument {
  schema: string;
  mode: RouteBuildMode;
  course: CourseDraft;
  stages: StageDraft[];
  ribbons: RibbonDraft[];
}

export interface ValidationIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  location: string;
  /** Values interpolated into `issues.<code>`. Empty when the title is static. */
  args?: Record<string, string>;
}

/** Reference lists the validator skips when the workspace cannot supply them. */
export type ReferenceList =
  | "unit-ids"
  | "pilot-names"
  | "map-hashes"
  | "bgm-hashes"
  | "package-hashes";

export interface RouteValidationResult {
  issues: ValidationIssue[];
  blocked: boolean;
  /**
   * Reference lists the context arrived without. Every check that reads one
   * was skipped rather than guessed, so a result with no issues covers fewer
   * invariants than a clean one — the panel says which.
   */
  notChecked: ReferenceList[];
}

/** What part of the route a planned write touches. */
export type PlanKind =
  | "course-table"
  | "scene-table"
  | "scene-id-table"
  | "briefing"
  | "script";

/** One file saving would replace, described before it is written. */
export interface PlannedWrite {
  path: string;
  kind: PlanKind;
  /** 1-based stage this write belongs to, for the per-stage entries. */
  stageIndex: number | null;
  byteLen: number;
  /** False when the write creates the file rather than replacing it. */
  replacesExisting: boolean;
  /** True when the bytes match what is already on disk. */
  unchanged: boolean;
}

/** Everything a save would do, computed without touching the workspace. */
export interface RoutePlan {
  writes: PlannedWrite[];
  stagePackageHashes: number[];
}

export interface WrittenFile {
  path: string;
  backupPath: string;
}

export interface AppliedRoute {
  written: WrittenFile[];
  /** Paths the save skipped because their bytes already matched. */
  unchanged: string[];
  stagePackageHashes: number[];
}

/** One course the category renumber placed, before and after. */
export interface CourseOrderEntry {
  courseId: number;
  name: string;
  previousNumber: number;
  number: number;
  /** Every row carrying this course id, variants included. */
  rowIds: number[];
}

export interface AppliedCategoryOrder {
  category: number;
  /** Every course in the category, in its new order. */
  courses: CourseOrderEntry[];
  written: WrittenFile[];
  unchanged: string[];
}

/** Which part of the route a mission package carries. */
export type TriadRepackKind =
  | "route-tables"
  | "scene-id-table"
  | "briefings"
  | "pilot-names"
  | "script";

/**
 * Where a package stands relative to the `.fhm2d` the game loads.
 *
 * `not-packed` and `stale` are the two states that make a saved route
 * invisible in game; the three `missing-*` states say the package cannot be
 * packed at all yet.
 */
export type TriadRepackStatus =
  | "missing-folder"
  | "missing-structure"
  | "missing-payload"
  | "not-packed"
  | "stale"
  | "current";

/** Statuses a repack would actually change something for. */
export const TRIAD_REPACK_OUTSTANDING: readonly TriadRepackStatus[] = [
  "not-packed",
  "stale",
];

export function needsRepack(status: TriadRepackStatus): boolean {
  return TRIAD_REPACK_OUTSTANDING.includes(status);
}

export function canRepack(status: TriadRepackStatus): boolean {
  return needsRepack(status) || status === "current";
}

/** One mission package, described against the mod folder it would be written to. */
export interface TriadRepackEntry {
  id: string;
  kind: TriadRepackKind;
  label: string;
  packHash: string | null;
  folderPath: string;
  structurePath: string;
  outputPath: string | null;
  status: TriadRepackStatus;
  /** False for packages the route works without, today only the pilot names. */
  required: boolean;
  /** True when the open route plays this stage's script. */
  inRoute: boolean;
  payloadCount: number;
  missingPayloads: string[];
  /** Payloads whose bytes differ from the `.bak` a save left beside them. */
  editedPayloads: string[];
  newestSourceMs: number | null;
  outputMs: number | null;
  outputSize: number | null;
}

/** Every mission package, whether or not it still needs repacking. */
export interface TriadRepackPlan {
  modFolder: string;
  entries: TriadRepackEntry[];
}

export interface GeneratedSceneIdentity {
  name: string;
  sceneKey: number;
  packageHash: number;
  sceneKeyCollision: string | null;
  packageHashCollision: string | null;
}

/** A hashed scene name, plus whether this workspace already owns its files. */
export interface HashedSceneName extends GeneratedSceneIdentity {
  /**
   * True when the only thing holding these ids is this workspace's own copy
   * of the same scene — a folder and briefing an earlier run left behind —
   * so creating it again with `replaceExisting` will work.
   */
  replaceable: boolean;
}

/**
 * One scene to materialise by cloning a donor.
 *
 * Only the name travels: the backend recomputes both hashes from it, so a
 * folder can never end up carrying a `HashName` its own name does not produce.
 */
export type SceneDonorKind = "dplcache-package" | "workspace-folder";

export interface NewSceneRequest {
  dplCacheDir?: string;
  workspaceRoot: string;
  /** Route prefix the mission scripts unpack under, e.g. `051mission`. */
  scriptPrefix: string;
  outmissionDir: string;
  donorSceneKey: number;
  donorPackageHash: number;
  sceneName: string;
  donorKind?: SceneDonorKind;
  donorScriptFolder?: string;
  /**
   * Overwrite this workspace's own earlier copy of the same scene instead of
   * refusing. Ids held by anything else are still a hard error.
   */
  replaceExisting?: boolean;
}

/** What one created scene now owns on disk. */
export interface CreatedScene {
  sceneName: string;
  sceneKey: number;
  packageHash: number;
  scriptFolder: string;
  scriptFile: string;
  briefingFile: string;
}

/** Render a 32-bit id the way the research notes and the game data write it. */
export function formatHash(value: number): string {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

/** Category number to the letter the select screen shows. */
export function categoryLetter(category: number): string | null {
  if (!Number.isInteger(category) || category < 1 || category > 6) return null;
  return String.fromCharCode("A".charCodeAt(0) + category - 1);
}
