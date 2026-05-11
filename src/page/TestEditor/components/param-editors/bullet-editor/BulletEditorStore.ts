import { create } from "zustand";
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes";
import { readTypedEntryId } from "../../param-editor/paramEntryUtils";
import { simulateTrajectory, type TrajectoryResult } from "../../bullet-preview/TrajectorySimulator";
import type { BulletPreviewScenario } from "../../bullet-preview/bulletPreviewTypes";
import { DEFAULT_BULLET_PREVIEW_SCENARIO } from "../../bullet-preview/bulletPreviewTypes";
import type { ValidationMessage } from "../shared/types";
import { getMoveTypeDefinition } from "@/lib/gameAlgorithms/moveTypes";
import {
  simulateShootingLoop,
  type ShootingLoopResult,
} from "@/lib/gameAlgorithms/shootingLoop";

export interface BulletEditorState {
  data: TypedParamFile | null;
  filePath: string;
  armsData: TypedParamFile | null;
  armsFilePath: string;
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

  setData: (data: TypedParamFile, filePath: string) => void;
  setArmsData: (data: TypedParamFile, filePath: string) => void;
  selectEntry: (index: number) => void;
  selectArmsEntry: (index: number) => void;
  updateField: (key: string, value: number) => void;
  setScenario: (patch: Partial<BulletPreviewScenario>) => void;
  setPlaybackFrame: (frame: number) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
  tick: (delta: number) => void;
}

function validateBulletEntry(entry: TypedParamEntry): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const speed = typeof entry.initialSpeed === "number" ? entry.initialSpeed : 0;
  const lifetime = typeof entry.lifetime === "number" ? entry.lifetime : 0;
  const moveType =
    typeof entry.moveType === "number" ? Math.trunc(entry.moveType) : 255;
  const moveDef = getMoveTypeDefinition(moveType);

  if (speed > 640) {
    messages.push({
      field: "initialSpeed",
      level: "error",
      message: "Speed exceeds game engine max (640)",
    });
  }
  if (!moveDef) {
    messages.push({
      field: "moveType",
      level: "warning",
      message: `Unknown move type ${moveType}`,
    });
  }
  if (lifetime < 0) {
    messages.push({
      field: "lifetime",
      level: "info",
      message: "Negative lifetime = absolute duration mode",
    });
  }
  return messages;
}

function recompute(
  data: TypedParamFile | null,
  index: number,
  scenario: BulletPreviewScenario,
  armsData: TypedParamFile | null,
  armsIndex: number,
) {
  if (!data || !data.entries[index]) {
    return {
      trajectory: null,
      shootingLoopResult: null,
      validationMessages: [] as ValidationMessage[],
    };
  }
  const entry = data.entries[index];
  const armsEntry = armsData?.entries[armsIndex];
  const shootingLoopResult = armsEntry
    ? simulateShootingLoop({
        armsEntry,
        bulletEntry: entry,
        scenario,
        simulateTrajectory,
      })
    : null;
  const trajectory = shootingLoopResult?.shots[0]?.trajectory
    ?? simulateTrajectory(entry, scenario);
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

  setData: (data, filePath) => {
    const { armsData, selectedArmsIndex } = get();
    const { trajectory, shootingLoopResult, validationMessages } = recompute(
      data,
      0,
      get().scenario,
      armsData,
      selectedArmsIndex,
    );
    set({
      data,
      filePath,
      selectedIndex: 0,
      dirty: false,
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

  selectEntry: (index) => {
    const { data, scenario, armsData, selectedArmsIndex } = get();
    const { trajectory, shootingLoopResult, validationMessages } = recompute(
      data,
      index,
      scenario,
      armsData,
      selectedArmsIndex,
    );
    set({
      selectedIndex: index,
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
