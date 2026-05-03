import { create } from "zustand";
import type { TypedParamEntry } from "../param-editor/typedParamTypes";
import { simulateTrajectory, type TrajectoryResult } from "./TrajectorySimulator";

export interface BulletPreviewState {
  entry: TypedParamEntry | null;
  trajectory: TrajectoryResult | null;
  currentFrame: number;
  isPlaying: boolean;
  playbackSpeed: number;
  targetDistance: number;
  showHitbox: boolean;
  showRange: boolean;
  showTrail: boolean;

  setEntry: (entry: TypedParamEntry | null) => void;
  setCurrentFrame: (frame: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlayback: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setTargetDistance: (dist: number) => void;
  setShowHitbox: (v: boolean) => void;
  setShowRange: (v: boolean) => void;
  setShowTrail: (v: boolean) => void;
  reset: () => void;
  advanceFrame: (delta: number) => void;
}

export const useBulletPreviewStore = create<BulletPreviewState>((set, get) => ({
  entry: null,
  trajectory: null,
  currentFrame: 0,
  isPlaying: false,
  playbackSpeed: 1,
  targetDistance: 50,
  showHitbox: true,
  showRange: true,
  showTrail: true,

  setEntry: (entry) => {
    if (!entry) {
      set({ entry: null, trajectory: null, currentFrame: 0, isPlaying: false });
      return;
    }
    const trajectory = simulateTrajectory(entry, get().targetDistance);
    set({ entry, trajectory, currentFrame: 0, isPlaying: true });
  },

  setCurrentFrame: (frame) => {
    const { trajectory } = get();
    if (!trajectory) return;
    set({ currentFrame: Math.max(0, Math.min(frame, trajectory.totalFrames - 1)) });
  },

  setIsPlaying: (playing) => set({ isPlaying: playing }),
  togglePlayback: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  setTargetDistance: (dist) => {
    const { entry } = get();
    const trajectory = entry ? simulateTrajectory(entry, dist) : get().trajectory;
    set({ targetDistance: dist, trajectory, currentFrame: 0 });
  },

  setShowHitbox: (v) => set({ showHitbox: v }),
  setShowRange: (v) => set({ showRange: v }),
  setShowTrail: (v) => set({ showTrail: v }),

  reset: () => set({ currentFrame: 0, isPlaying: false }),

  advanceFrame: (delta) => {
    const { currentFrame, trajectory, playbackSpeed, isPlaying } = get();
    if (!isPlaying || !trajectory) return;
    const next = currentFrame + delta * playbackSpeed;
    if (next >= trajectory.totalFrames) {
      set({ currentFrame: 0 });
    } else {
      set({ currentFrame: Math.max(0, next) });
    }
  },
}));
