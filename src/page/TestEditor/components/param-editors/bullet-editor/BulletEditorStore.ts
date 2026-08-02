import { create } from "zustand";
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes";
import { readTypedEntryId } from "../../param-editor/paramEntryUtils";
import { simulateTrajectory, type TrajectoryResult } from "../../bullet-preview/TrajectorySimulator";
import type { BulletPreviewScenario, BulletPreviewVisualization } from "../../bullet-preview/bulletPreviewTypes";
import { DEFAULT_BULLET_PREVIEW_SCENARIO, DEFAULT_BULLET_PREVIEW_VISUALIZATION } from "../../bullet-preview/bulletPreviewTypes";
import type { ValidationMessage } from "../shared/types";
import type { ParamKind } from "@/lib/gameAlgorithms/crossParamResolver";
import {
  type ShootingLoopResult,
} from "@/lib/gameAlgorithms/shootingLoop";
import { validateBulletEntry } from "./bulletValidation";

/** Sibling param kinds the bullet editor can load for cross-reference resolution. */
export type BulletSiblingKind = Extract<
  ParamKind,
  "interactionid" | "hitgroupiddef" | "projectileDepictionTable"
>;

export type BulletSiblingFiles = Record<BulletSiblingKind, TypedParamFile | null>;
export type BulletSiblingPaths = Record<BulletSiblingKind, string>;

const EMPTY_SIBLING_FILES: BulletSiblingFiles = {
  interactionid: null,
  hitgroupiddef: null,
  projectileDepictionTable: null,
};

const EMPTY_SIBLING_PATHS: BulletSiblingPaths = {
  interactionid: "",
  hitgroupiddef: "",
  projectileDepictionTable: "",
};

export interface BulletEditorState {
  data: TypedParamFile | null;
  filePath: string;
  armsData: TypedParamFile | null;
  armsFilePath: string;
  siblingFiles: BulletSiblingFiles;
  siblingFilePaths: BulletSiblingPaths;
  selectedIndex: number;
  selectedArmsIndex: number;
  dirty: boolean;
  scenario: BulletPreviewScenario;
  trajectory: TrajectoryResult | null;
  shootingLoopResult: ShootingLoopResult<TrajectoryResult> | null;
  validationMessages: ValidationMessage[];
  playbackFrame: number;
  isPlaying: boolean;
  playbackSpeed: number;
  visualization: BulletPreviewVisualization;

  setData: (data: TypedParamFile, filePath: string) => void;
  setArmsData: (data: TypedParamFile, filePath: string) => void;
  setSiblingFile: (
    kind: BulletSiblingKind,
    data: TypedParamFile,
    filePath: string,
  ) => void;
  selectEntry: (index: number) => void;
  selectArmsEntry: (index: number) => void;
  updateField: (key: string, value: number) => void;
  setScenario: (patch: Partial<BulletPreviewScenario>) => void;
  setPlaybackFrame: (frame: number) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setVisualization: (patch: Partial<BulletPreviewVisualization>) => void;
  seekToHitFrame: () => void;
  tick: (delta: number) => void;
}

/**
 * Auto-syncs the scenario base launch speed to the selected entry's initial_speed when
 * that field is set; otherwise keeps the user's current value. Base velocity is not a
 * bulletparam field (it comes from the firing weapon/action), so this is only a sensible
 * starting point the user can override.
 */
function deriveLaunchSpeed(
  entry: TypedParamEntry | undefined,
  scenario: BulletPreviewScenario,
): number {
  const initial = entry && typeof entry.initialSpeed === "number" ? Math.abs(entry.initialSpeed) : 0;
  return initial > 0 ? initial : scenario.launchSpeed;
}

function recompute(
  data: TypedParamFile | null,
  index: number,
  scenario: BulletPreviewScenario,
  _armsData: TypedParamFile | null,
  _armsIndex: number,
) {
  if (!data || !data.entries[index]) {
    return {
      trajectory: null,
      shootingLoopResult: null,
      validationMessages: [] as ValidationMessage[],
    };
  }
  const entry = data.entries[index];
  // Native armsparam analysis disproved the former startup/active/recovery and
  // bulletCountPerShot labels. Keep trajectory preview, but do not fabricate an
  // arms-driven shooting loop until those fields have native consumers.
  const shootingLoopResult = null;
  const trajectory = simulateTrajectory(entry, scenario);
  const validationMessages = validateBulletEntry(entry);
  return { trajectory, shootingLoopResult, validationMessages };
}

function playbackEndFrame(
  trajectory: TrajectoryResult | null,
  shootingLoopResult: ShootingLoopResult<TrajectoryResult> | null,
): number {
  if (shootingLoopResult) {
    return Math.max(
      shootingLoopResult.timeline.cooldownEndFrame,
      ...shootingLoopResult.shots.map((shot) => shot.endFrame),
    );
  }
  return trajectory?.totalFrames ?? 0;
}

export const useBulletEditorStore = create<BulletEditorState>((set, get) => ({
  data: null,
  filePath: "",
  armsData: null,
  armsFilePath: "",
  siblingFiles: { ...EMPTY_SIBLING_FILES },
  siblingFilePaths: { ...EMPTY_SIBLING_PATHS },
  selectedIndex: 0,
  selectedArmsIndex: 0,
  dirty: false,
  scenario: { ...DEFAULT_BULLET_PREVIEW_SCENARIO },
  trajectory: null,
  shootingLoopResult: null,
  validationMessages: [],
  playbackFrame: 0,
  isPlaying: false,
  playbackSpeed: 1,
  visualization: { ...DEFAULT_BULLET_PREVIEW_VISUALIZATION },

  setData: (data, filePath) => {
    const { armsData, selectedArmsIndex, scenario } = get();
    const nextScenario = { ...scenario, launchSpeed: deriveLaunchSpeed(data.entries[0], scenario) };
    const { trajectory, shootingLoopResult, validationMessages } = recompute(
      data,
      0,
      nextScenario,
      armsData,
      selectedArmsIndex,
    );
    set({
      data,
      filePath,
      selectedIndex: 0,
      dirty: false,
      scenario: nextScenario,
      trajectory,
      shootingLoopResult,
      validationMessages,
      playbackFrame: 0,
      isPlaying: false,
    });
  },

  setArmsData: (data, filePath) => {
    const { data: bulletData, selectedIndex, scenario } = get();
    const { trajectory, shootingLoopResult, validationMessages } = recompute(
      bulletData,
      selectedIndex,
      scenario,
      data,
      0,
    );
    set({
      armsData: data,
      armsFilePath: filePath,
      selectedArmsIndex: 0,
      trajectory,
      shootingLoopResult,
      validationMessages,
      playbackFrame: 0,
      isPlaying: false,
    });
  },

  setSiblingFile: (kind, data, filePath) =>
    set((state) => ({
      siblingFiles: { ...state.siblingFiles, [kind]: data },
      siblingFilePaths: { ...state.siblingFilePaths, [kind]: filePath },
    })),

  selectEntry: (index) => {
    const { data, scenario, armsData, selectedArmsIndex } = get();
    const nextScenario = { ...scenario, launchSpeed: deriveLaunchSpeed(data?.entries[index], scenario) };
    const { trajectory, shootingLoopResult, validationMessages } = recompute(
      data,
      index,
      nextScenario,
      armsData,
      selectedArmsIndex,
    );
    set({
      selectedIndex: index,
      scenario: nextScenario,
      trajectory,
      shootingLoopResult,
      validationMessages,
      playbackFrame: 0,
      isPlaying: false,
    });
  },

  selectArmsEntry: (index) => {
    const { data, selectedIndex, scenario, armsData } = get();
    const { trajectory, shootingLoopResult, validationMessages } = recompute(
      data,
      selectedIndex,
      scenario,
      armsData,
      index,
    );
    set({
      selectedArmsIndex: index,
      trajectory,
      shootingLoopResult,
      validationMessages,
      playbackFrame: 0,
      isPlaying: false,
    });
  },

  updateField: (key, value) => {
    const { data, selectedIndex, scenario, armsData, selectedArmsIndex } = get();
    if (!data) return;
    const nextEntries = data.entries.map((e, i) =>
      i === selectedIndex ? { ...e, [key]: value } : e,
    );
    const nextEntryIds = nextEntries.map((e, i) => readTypedEntryId(e, i));
    const nextData = { ...data, entries: nextEntries, entryIds: nextEntryIds };
    const { trajectory, shootingLoopResult, validationMessages } = recompute(
      nextData,
      selectedIndex,
      scenario,
      armsData,
      selectedArmsIndex,
    );
    set({
      data: nextData,
      dirty: true,
      trajectory,
      shootingLoopResult,
      validationMessages,
    });
  },

  setScenario: (patch) => {
    const { data, selectedIndex, scenario, armsData, selectedArmsIndex } = get();
    const nextScenario = { ...scenario, ...patch };
    const { trajectory, shootingLoopResult, validationMessages } = recompute(
      data,
      selectedIndex,
      nextScenario,
      armsData,
      selectedArmsIndex,
    );
    set({
      scenario: nextScenario,
      trajectory,
      shootingLoopResult,
      validationMessages,
    });
  },

  setPlaybackFrame: (frame) => set({ playbackFrame: frame }),

  togglePlayback: () => {
    const { isPlaying, trajectory, playbackFrame } = get();
    if (!isPlaying && trajectory && playbackFrame >= trajectory.totalFrames) {
      set({ playbackFrame: 0, isPlaying: true });
    } else {
      set({ isPlaying: !isPlaying });
    }
  },

  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  setVisualization: (patch) =>
    set((state) => ({ visualization: { ...state.visualization, ...patch } })),

  seekToHitFrame: () => {
    const { trajectory } = get();
    if (!trajectory) return;
    if (trajectory.hitFrame >= trajectory.totalFrames) return;
    set({ playbackFrame: trajectory.hitFrame, isPlaying: false });
  },

  tick: (delta) => {
    const {
      isPlaying,
      playbackSpeed,
      playbackFrame,
      trajectory,
      shootingLoopResult,
    } = get();
    if (!isPlaying || !trajectory) return;
    const nextFrame = playbackFrame + delta * 60 * playbackSpeed;
    const endFrame = playbackEndFrame(trajectory, shootingLoopResult);
    if (nextFrame >= endFrame) {
      set({ playbackFrame: endFrame, isPlaying: false });
    } else {
      set({ playbackFrame: nextFrame });
    }
  },
}));
