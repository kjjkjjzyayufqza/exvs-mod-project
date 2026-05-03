import { create } from "zustand";
import type { TypedParamEntry } from "../param-editor/typedParamTypes";
import {
  filterTypedParamEntryRows,
  readTypedEntryId,
} from "../param-editor/paramEntryUtils";
import { simulateTrajectory } from "@/page/TestEditor/components/bullet-preview/TrajectorySimulator";
import type { TrajectoryResult } from "@/page/TestEditor/components/bullet-preview/TrajectorySimulator";
import {
  applyPhysicsOverrides,
  DEFAULT_BULLET_PREVIEW_FILTER,
  DEFAULT_BULLET_PREVIEW_SCENARIO,
  DEFAULT_BULLET_PREVIEW_VISUALIZATION,
  parseHitEffectHashParts,
  readNumericField,
  type BulletPreviewDataset,
  type BulletPreviewFilter,
  type BulletPreviewPhysicsKey,
  type BulletPreviewPhysicsOverrides,
  type BulletPreviewRow,
  type BulletPreviewScenario,
  type BulletPreviewVisualization,
} from "@/page/TestEditor/components/bullet-preview/bulletPreviewTypes";

const PREVIEW_FPS = 60;

function buildRows(dataset: BulletPreviewDataset | null): BulletPreviewRow[] {
  if (!dataset) return [];
  return dataset.entries.map((entry, sourceIndex) => {
    const hitEffectHash = readNumericField(entry, "hitEffectHash");
    return {
      sourceIndex,
      entryId: readTypedEntryId(entry, sourceIndex),
      entry,
      moveType: readNumericField(entry, "moveType"),
      hitEffectHash,
      hitEffectParts: parseHitEffectHashParts(hitEffectHash),
    };
  });
}

function applyRowFilters(rows: BulletPreviewRow[], filter: BulletPreviewFilter): BulletPreviewRow[] {
  let output = rows;
  if (filter.search.trim()) {
    const matched = new Set(
      filterTypedParamEntryRows(
        rows.map((row) => row.entry),
        filter.search,
      ).map((row) => row.index),
    );
    output = output.filter((row) => matched.has(row.sourceIndex));
  }
  if (filter.moveType !== "all") {
    output = output.filter((row) => row.moveType === filter.moveType);
  }
  if (filter.series !== "all") {
    output = output.filter((row) => row.hitEffectParts?.series === filter.series);
  }
  if (filter.unit !== "all") {
    output = output.filter((row) => row.hitEffectParts?.unit === filter.unit);
  }
  if (filter.variant !== "all") {
    output = output.filter((row) => row.hitEffectParts?.variant === filter.variant);
  }
  return output;
}

function resolveSelectedSourceIndex(
  filteredRows: BulletPreviewRow[],
  previousSourceIndex: number | null,
): number | null {
  if (filteredRows.length === 0) return null;
  if (previousSourceIndex === null) return filteredRows[0].sourceIndex;
  const keep = filteredRows.find((row) => row.sourceIndex === previousSourceIndex);
  return keep ? keep.sourceIndex : filteredRows[0].sourceIndex;
}

function findRow(rows: BulletPreviewRow[], sourceIndex: number | null): BulletPreviewRow | null {
  if (sourceIndex === null) return null;
  return rows.find((row) => row.sourceIndex === sourceIndex) ?? null;
}

function buildActiveEntry(
  dataset: BulletPreviewDataset | null,
  selectedRow: BulletPreviewRow | null,
  externalEntry: TypedParamEntry | null,
  overrides: BulletPreviewPhysicsOverrides,
): TypedParamEntry | null {
  if (dataset) {
    if (!selectedRow) return null;
    return applyPhysicsOverrides(selectedRow.entry, overrides);
  }
  if (!externalEntry) return null;
  return applyPhysicsOverrides(externalEntry, overrides);
}

function rebuildTrajectory(
  entry: TypedParamEntry | null,
  scenario: BulletPreviewScenario,
): TrajectoryResult | null {
  if (!entry) return null;
  return simulateTrajectory(entry, scenario);
}

interface RecomputePayload {
  dataset: BulletPreviewDataset | null;
  externalEntry: TypedParamEntry | null;
  filter: BulletPreviewFilter;
  selectedSourceIndex: number | null;
  physicsOverrides: BulletPreviewPhysicsOverrides;
  scenario: BulletPreviewScenario;
}

function recomputeState(payload: RecomputePayload) {
  const rows = buildRows(payload.dataset);
  const filteredRows = applyRowFilters(rows, payload.filter);
  const selectedSourceIndex = resolveSelectedSourceIndex(
    filteredRows,
    payload.selectedSourceIndex,
  );
  const selectedRow = findRow(rows, selectedSourceIndex);
  const activeEntry = buildActiveEntry(
    payload.dataset,
    selectedRow,
    payload.externalEntry,
    payload.physicsOverrides,
  );
  const trajectory = rebuildTrajectory(activeEntry, payload.scenario);
  return {
    rows,
    filteredRows,
    selectedSourceIndex,
    selectedRow,
    activeEntry,
    trajectory,
  };
}

export interface BulletPreviewState {
  dataset: BulletPreviewDataset | null;
  externalEntry: TypedParamEntry | null;
  rows: BulletPreviewRow[];
  filteredRows: BulletPreviewRow[];
  selectedSourceIndex: number | null;
  selectedRow: BulletPreviewRow | null;
  activeEntry: TypedParamEntry | null;
  filter: BulletPreviewFilter;
  physicsOverrides: BulletPreviewPhysicsOverrides;
  scenario: BulletPreviewScenario;
  trajectory: TrajectoryResult | null;
  visualization: BulletPreviewVisualization;

  playbackFrame: number;
  isPlaying: boolean;
  playbackSpeed: number;

  setDataset: (dataset: BulletPreviewDataset | null) => void;
  setEntry: (entry: TypedParamEntry | null) => void;
  setFilter: (patch: Partial<BulletPreviewFilter>) => void;
  selectFilteredRow: (filteredIndex: number) => void;
  setPhysicsOverride: (key: BulletPreviewPhysicsKey, value: number) => void;
  resetPhysicsOverrides: () => void;
  setScenario: (patch: Partial<BulletPreviewScenario>) => void;
  setVisualization: (patch: Partial<BulletPreviewVisualization>) => void;
  resetWorkbench: () => void;

  setPlaybackFrame: (frame: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
  resetPlayback: () => void;
  seekToHitFrame: () => void;
  seekToStart: () => void;
  tick: (deltaSeconds: number) => void;
}

export const useBulletPreviewStore = create<BulletPreviewState>((set, get) => ({
  dataset: null,
  externalEntry: null,
  rows: [],
  filteredRows: [],
  selectedSourceIndex: null,
  selectedRow: null,
  activeEntry: null,
  filter: { ...DEFAULT_BULLET_PREVIEW_FILTER },
  physicsOverrides: {},
  scenario: { ...DEFAULT_BULLET_PREVIEW_SCENARIO },
  trajectory: null,
  visualization: { ...DEFAULT_BULLET_PREVIEW_VISUALIZATION },
  playbackFrame: 0,
  isPlaying: false,
  playbackSpeed: 1,

  setDataset: (dataset) => {
    const state = get();
    const next = recomputeState({
      dataset,
      externalEntry: state.externalEntry,
      filter: state.filter,
      selectedSourceIndex: state.selectedSourceIndex,
      physicsOverrides: state.physicsOverrides,
      scenario: state.scenario,
    });
    set({
      dataset,
      ...next,
      playbackFrame: 0,
      isPlaying: false,
    });
  },

  setEntry: (entry) => {
    const state = get();
    const next = recomputeState({
      dataset: state.dataset,
      externalEntry: entry,
      filter: state.filter,
      selectedSourceIndex: state.selectedSourceIndex,
      physicsOverrides: state.physicsOverrides,
      scenario: state.scenario,
    });
    set({
      externalEntry: entry,
      ...next,
      playbackFrame: 0,
      isPlaying: false,
    });
  },

  setFilter: (patch) => {
    const state = get();
    const filter = { ...state.filter, ...patch };
    const next = recomputeState({
      dataset: state.dataset,
      externalEntry: state.externalEntry,
      filter,
      selectedSourceIndex: state.selectedSourceIndex,
      physicsOverrides: state.physicsOverrides,
      scenario: state.scenario,
    });
    const maxFrame = next.trajectory ? Math.max(0, next.trajectory.totalFrames - 1) : 0;
    set({
      filter,
      ...next,
      playbackFrame: Math.min(state.playbackFrame, maxFrame),
      isPlaying: false,
    });
  },

  selectFilteredRow: (filteredIndex) => {
    const state = get();
    const row = state.filteredRows[filteredIndex];
    if (!row) return;
    const next = recomputeState({
      dataset: state.dataset,
      externalEntry: state.externalEntry,
      filter: state.filter,
      selectedSourceIndex: row.sourceIndex,
      physicsOverrides: state.physicsOverrides,
      scenario: state.scenario,
    });
    set({
      ...next,
      playbackFrame: 0,
      isPlaying: false,
    });
  },

  setPhysicsOverride: (key, value) => {
    const state = get();
    const overrides = { ...state.physicsOverrides };
    if (!Number.isFinite(value)) {
      delete overrides[key];
    } else {
      overrides[key] = value;
    }
    const next = recomputeState({
      dataset: state.dataset,
      externalEntry: state.externalEntry,
      filter: state.filter,
      selectedSourceIndex: state.selectedSourceIndex,
      physicsOverrides: overrides,
      scenario: state.scenario,
    });
    const maxFrame = next.trajectory ? Math.max(0, next.trajectory.totalFrames - 1) : 0;
    set({
      physicsOverrides: overrides,
      ...next,
      playbackFrame: Math.min(state.playbackFrame, maxFrame),
      isPlaying: false,
    });
  },

  resetPhysicsOverrides: () => {
    const state = get();
    const next = recomputeState({
      dataset: state.dataset,
      externalEntry: state.externalEntry,
      filter: state.filter,
      selectedSourceIndex: state.selectedSourceIndex,
      physicsOverrides: {},
      scenario: state.scenario,
    });
    set({
      physicsOverrides: {},
      ...next,
      playbackFrame: 0,
      isPlaying: false,
    });
  },

  setScenario: (patch) => {
    const state = get();
    const scenario = { ...state.scenario, ...patch };
    const next = recomputeState({
      dataset: state.dataset,
      externalEntry: state.externalEntry,
      filter: state.filter,
      selectedSourceIndex: state.selectedSourceIndex,
      physicsOverrides: state.physicsOverrides,
      scenario,
    });
    const maxFrame = next.trajectory ? Math.max(0, next.trajectory.totalFrames - 1) : 0;
    set({
      scenario,
      ...next,
      playbackFrame: Math.min(state.playbackFrame, maxFrame),
    });
  },

  setVisualization: (patch) =>
    set((state) => ({ visualization: { ...state.visualization, ...patch } })),

  resetWorkbench: () => {
    const state = get();
    const filter = { ...DEFAULT_BULLET_PREVIEW_FILTER };
    const scenario = { ...DEFAULT_BULLET_PREVIEW_SCENARIO };
    const next = recomputeState({
      dataset: state.dataset,
      externalEntry: state.externalEntry,
      filter,
      selectedSourceIndex: null,
      physicsOverrides: {},
      scenario,
    });
    set({
      ...next,
      filter,
      physicsOverrides: {},
      scenario,
      visualization: { ...DEFAULT_BULLET_PREVIEW_VISUALIZATION },
      playbackFrame: 0,
      isPlaying: false,
      playbackSpeed: 1,
    });
  },

  setPlaybackFrame: (frame) => {
    const { trajectory } = get();
    if (!trajectory) return;
    const maxF = Math.max(0, trajectory.totalFrames - 1);
    set({ playbackFrame: Math.max(0, Math.min(frame, maxF)), isPlaying: false });
  },

  setIsPlaying: (playing) => set({ isPlaying: playing }),

  togglePlayback: () =>
    set((state) => {
      if (!state.trajectory) return state;
      return { isPlaying: !state.isPlaying };
    }),

  setPlaybackSpeed: (speed) =>
    set({ playbackSpeed: Math.max(0.0625, Math.min(speed, 8)) }),

  resetPlayback: () => set({ playbackFrame: 0, isPlaying: false }),

  seekToHitFrame: () => {
    const { trajectory } = get();
    if (!trajectory) return;
    if (trajectory.hitFrame >= trajectory.totalFrames) return;
    set({ playbackFrame: trajectory.hitFrame, isPlaying: false });
  },

  seekToStart: () => set({ playbackFrame: 0, isPlaying: false }),

  tick: (deltaSeconds) => {
    const { isPlaying, trajectory, playbackSpeed, playbackFrame } = get();
    if (!isPlaying || !trajectory || trajectory.totalFrames <= 0) return;

    const deltaFrames = deltaSeconds * PREVIEW_FPS * playbackSpeed;
    let next = playbackFrame + deltaFrames;
    const maxExclusive = trajectory.totalFrames;
    while (next >= maxExclusive) next -= maxExclusive;
    while (next < 0) next += maxExclusive;
    set({ playbackFrame: next });
  },
}));
