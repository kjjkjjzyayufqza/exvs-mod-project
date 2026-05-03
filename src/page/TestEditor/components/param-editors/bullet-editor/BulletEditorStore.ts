import { create } from "zustand";
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes";
import { readTypedEntryId } from "../../param-editor/paramEntryUtils";
import { simulateTrajectory, type TrajectoryResult } from "../../bullet-preview/TrajectorySimulator";
import type { BulletPreviewScenario } from "../../bullet-preview/bulletPreviewTypes";
import { DEFAULT_BULLET_PREVIEW_SCENARIO } from "../../bullet-preview/bulletPreviewTypes";
import type { ValidationMessage } from "../shared/types";

export interface BulletEditorState {
  data: TypedParamFile | null;
  filePath: string;
  selectedIndex: number;
  dirty: boolean;
  scenario: BulletPreviewScenario;
  trajectory: TrajectoryResult | null;
  validationMessages: ValidationMessage[];
  playbackFrame: number;
  isPlaying: boolean;
  playbackSpeed: number;

  setData: (data: TypedParamFile, filePath: string) => void;
  selectEntry: (index: number) => void;
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
  const turnRate =
    typeof entry.homingTurnRate === "number" ? entry.homingTurnRate : 0;
  const lifetime = typeof entry.lifetime === "number" ? entry.lifetime : 0;

  if (speed > 600) {
    messages.push({
      field: "initialSpeed",
      level: "error",
      message: "Speed exceeds engine clamp (600)",
    });
  }
  if (turnRate > 0.1 && turnRate !== 0) {
    messages.push({
      field: "homingTurnRate",
      level: "warning",
      message: "High turn rate may feel broken",
    });
  }
  if (lifetime < 0) {
    messages.push({
      field: "lifetime",
      level: "info",
      message: "Negative = absolute duration mode",
    });
  }
  return messages;
}

function recompute(
  data: TypedParamFile | null,
  index: number,
  scenario: BulletPreviewScenario,
) {
  if (!data || !data.entries[index]) {
    return { trajectory: null, validationMessages: [] as ValidationMessage[] };
  }
  const entry = data.entries[index];
  const trajectory = simulateTrajectory(entry, scenario);
  const validationMessages = validateBulletEntry(entry);
  return { trajectory, validationMessages };
}

export const useBulletEditorStore = create<BulletEditorState>((set, get) => ({
  data: null,
  filePath: "",
  selectedIndex: 0,
  dirty: false,
  scenario: { ...DEFAULT_BULLET_PREVIEW_SCENARIO },
  trajectory: null,
  validationMessages: [],
  playbackFrame: 0,
  isPlaying: false,
  playbackSpeed: 1,

  setData: (data, filePath) => {
    const { trajectory, validationMessages } = recompute(
      data,
      0,
      get().scenario,
    );
    set({
      data,
      filePath,
      selectedIndex: 0,
      dirty: false,
      trajectory,
      validationMessages,
      playbackFrame: 0,
      isPlaying: false,
    });
  },

  selectEntry: (index) => {
    const { data, scenario } = get();
    const { trajectory, validationMessages } = recompute(data, index, scenario);
    set({
      selectedIndex: index,
      trajectory,
      validationMessages,
      playbackFrame: 0,
      isPlaying: false,
    });
  },

  updateField: (key, value) => {
    const { data, selectedIndex, scenario } = get();
    if (!data) return;
    const nextEntries = data.entries.map((e, i) =>
      i === selectedIndex ? { ...e, [key]: value } : e,
    );
    const nextEntryIds = nextEntries.map((e, i) => readTypedEntryId(e, i));
    const nextData = { ...data, entries: nextEntries, entryIds: nextEntryIds };
    const { trajectory, validationMessages } = recompute(
      nextData,
      selectedIndex,
      scenario,
    );
    set({ data: nextData, dirty: true, trajectory, validationMessages });
  },

  setScenario: (patch) => {
    const { data, selectedIndex, scenario } = get();
    const nextScenario = { ...scenario, ...patch };
    const { trajectory, validationMessages } = recompute(
      data,
      selectedIndex,
      nextScenario,
    );
    set({ scenario: nextScenario, trajectory, validationMessages });
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
    const { isPlaying, playbackSpeed, playbackFrame, trajectory } = get();
    if (!isPlaying || !trajectory) return;
    const nextFrame = playbackFrame + delta * 60 * playbackSpeed;
    if (nextFrame >= trajectory.totalFrames) {
      set({ playbackFrame: trajectory.totalFrames, isPlaying: false });
    } else {
      set({ playbackFrame: nextFrame });
    }
  },
}));
