import { create } from "zustand";

/**
 * App-wide z-order for floating windows (Rnd modals: SSBH file editors, scene/effect detail
 * views, generic app modals). A single monotonic counter gives every window a unique z so
 * focus order is consistent across all window kinds — clicking any window raises it above the
 * rest (Windows-style). Replaces the former per-kind z counters in useSsbhFileEditorSessions.
 */
export interface FloatingWindowState {
  /** Monotonically increasing; never resets while the app is alive. */
  counter: number;
  /** windowId -> assigned z. */
  zById: Record<string, number>;
  /** The currently focused (front-most) window, or null when none are open. */
  topId: string | null;
  /** Raise a window to the front. Returns its newly assigned z. */
  bringToFront: (id: string) => number;
  /** Drop a window from the order (call on unmount). Recomputes topId if it was on top. */
  release: (id: string) => void;
}

function highestId(zById: Record<string, number>): string | null {
  let bestId: string | null = null;
  let bestZ = -Infinity;
  for (const [id, z] of Object.entries(zById)) {
    if (z > bestZ) {
      bestZ = z;
      bestId = id;
    }
  }
  return bestId;
}

export const useFloatingWindowStore = create<FloatingWindowState>((set, get) => ({
  counter: 0,
  zById: {},
  topId: null,
  bringToFront: (id) => {
    const nextZ = get().counter + 1;
    set((state) => ({
      counter: nextZ,
      zById: { ...state.zById, [id]: nextZ },
      topId: id,
    }));
    return nextZ;
  },
  release: (id) => {
    set((state) => {
      if (!(id in state.zById)) return state;
      const zById = { ...state.zById };
      delete zById[id];
      return {
        ...state,
        zById,
        topId: state.topId === id ? highestId(zById) : state.topId,
      };
    });
  },
}));
