import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { mergeOutlinerOrder, reorderOutlinerIds } from "../utils/sceneOutlinerOrder";

export interface OutlinerGroup {
  id: string;
  label: string;
  children: string[];
  collapsed: boolean;
}

export interface ClipboardEntry {
  nodeId: string;
  placementIdx: number | null;
  transform: { posX: number; posY: number; posZ: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number };
}

interface HistoryEntry {
  type: string;
  description: string;
  undo: () => void;
  redo: () => void;
}

interface SceneEditorState {
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  anchorId: string | null;

  groups: OutlinerGroup[];
  clipboard: ClipboardEntry[];
  clipboardOperation: "copy" | "cut" | null;

  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  nodeVisibility: Record<string, boolean>;

  objectLocks: Record<string, boolean>;

  viewMode: "normal" | "collision" | "both";
  showAabb: boolean;
  showCollisionMesh: boolean;
  collisionVisibility: Record<string, boolean>;
  sessionId: string | null;
  outlinerOrder: string[];
}

interface SceneEditorActions {
  select: (id: string, opts?: { shift?: boolean; ctrl?: boolean; allIds?: string[] }) => void;
  selectAll: (ids: string[]) => void;
  deselectAll: () => void;
  isSelected: (id: string) => boolean;
  getSelectedIds: () => string[];
  getPrimaryId: () => string | null;

  createGroup: (label: string, childIds: string[]) => void;
  removeGroup: (groupId: string) => void;
  renameGroup: (groupId: string, label: string) => void;
  toggleGroupCollapse: (groupId: string) => void;
  addToGroup: (groupId: string, nodeIds: string[]) => void;
  removeFromGroup: (groupId: string, nodeIds: string[]) => void;

  copyToClipboard: (entries: ClipboardEntry[]) => void;
  cutToClipboard: (entries: ClipboardEntry[]) => void;
  clearClipboard: () => void;

  pushCommand: (entry: Omit<HistoryEntry, "redo"> & { execute: () => void }) => void;
  recordCommand: (entry: HistoryEntry) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;

  toggleVisibility: (nodeId: string) => void;
  setVisibility: (nodeId: string, visible: boolean) => void;
  isVisible: (nodeId: string) => boolean;

  toggleLock: (nodeId: string) => void;
  isLocked: (nodeId: string) => boolean;

  setViewMode: (mode: "normal" | "collision" | "both") => void;
  setShowAabb: (v: boolean) => void;
  setShowCollisionMesh: (v: boolean) => void;
  toggleCollisionVisibility: (sourceId: string) => void;
  setCollisionVisibility: (sourceId: string, visible: boolean) => void;
  setAllCollisionVisibility: (visible: boolean) => void;
  setSessionId: (id: string | null) => void;
  syncOutlinerOrder: (nodeIds: string[]) => void;
  reorderOutlinerNode: (activeId: string, overId: string) => void;
  resetAll: () => void;
}

const MAX_HISTORY = 100;

export const useSceneEditorStore = create<SceneEditorState & SceneEditorActions>()(
  immer((set, get) => ({
    selectedIds: new Set<string>(),
    lastSelectedId: null,
    anchorId: null,
    groups: [],
    clipboard: [],
    clipboardOperation: null,
    undoStack: [],
    redoStack: [],
    nodeVisibility: {},
    objectLocks: {},
    viewMode: "normal",
    showAabb: true,
    showCollisionMesh: true,
    collisionVisibility: {},
    sessionId: null,
    outlinerOrder: [],

    select: (id, opts) => {
      set((state) => {
        if (opts?.ctrl) {
          const next = new Set(state.selectedIds);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          state.selectedIds = next;
          state.lastSelectedId = id;
          if (!state.anchorId) state.anchorId = id;
          return;
        }
        if (opts?.shift && state.anchorId && opts.allIds) {
          const allIds = opts.allIds;
          const anchorIdx = allIds.indexOf(state.anchorId);
          const targetIdx = allIds.indexOf(id);
          if (anchorIdx >= 0 && targetIdx >= 0) {
            const start = Math.min(anchorIdx, targetIdx);
            const end = Math.max(anchorIdx, targetIdx);
            const range = allIds.slice(start, end + 1);
            state.selectedIds = new Set(range);
            state.lastSelectedId = id;
            return;
          }
        }
        state.selectedIds = new Set([id]);
        state.lastSelectedId = id;
        state.anchorId = id;
      });
    },

    selectAll: (ids) => {
      set((state) => {
        state.selectedIds = new Set(ids);
        state.lastSelectedId = ids.length > 0 ? ids[ids.length - 1] : null;
        state.anchorId = ids.length > 0 ? ids[0] : null;
      });
    },

    deselectAll: () => {
      set((state) => {
        state.selectedIds = new Set();
        state.lastSelectedId = null;
        state.anchorId = null;
      });
    },

    isSelected: (id) => get().selectedIds.has(id),

    getSelectedIds: () => [...get().selectedIds],

    getPrimaryId: () => get().lastSelectedId,

    createGroup: (label, childIds) => {
      set((state) => {
        const groupId = `group_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        state.groups.push({
          id: groupId,
          label,
          children: childIds,
          collapsed: false,
        });
      });
    },

    removeGroup: (groupId) => {
      set((state) => {
        state.groups = state.groups.filter((g) => g.id !== groupId);
      });
    },

    renameGroup: (groupId, label) => {
      set((state) => {
        const group = state.groups.find((g) => g.id === groupId);
        if (group) group.label = label;
      });
    },

    toggleGroupCollapse: (groupId) => {
      set((state) => {
        const group = state.groups.find((g) => g.id === groupId);
        if (group) group.collapsed = !group.collapsed;
      });
    },

    addToGroup: (groupId, nodeIds) => {
      set((state) => {
        const group = state.groups.find((g) => g.id === groupId);
        if (group) {
          for (const id of nodeIds) {
            if (!group.children.includes(id)) {
              group.children.push(id);
            }
          }
        }
      });
    },

    removeFromGroup: (groupId, nodeIds) => {
      set((state) => {
        const group = state.groups.find((g) => g.id === groupId);
        if (group) {
          group.children = group.children.filter((c) => !nodeIds.includes(c));
        }
      });
    },

    copyToClipboard: (entries) => {
      set((state) => {
        state.clipboard = entries;
        state.clipboardOperation = "copy";
      });
    },

    cutToClipboard: (entries) => {
      set((state) => {
        state.clipboard = entries;
        state.clipboardOperation = "cut";
      });
    },

    clearClipboard: () => {
      set((state) => {
        state.clipboard = [];
        state.clipboardOperation = null;
      });
    },

    pushCommand: (entry) => {
      entry.execute();
      set((state) => {
        const histEntry: HistoryEntry = {
          type: entry.type,
          description: entry.description,
          undo: entry.undo,
          redo: entry.execute,
        };
        state.undoStack.push(histEntry);
        if (state.undoStack.length > MAX_HISTORY) {
          state.undoStack.shift();
        }
        state.redoStack = [];
      });
    },

    recordCommand: (entry) => {
      set((state) => {
        state.undoStack.push(entry);
        if (state.undoStack.length > MAX_HISTORY) {
          state.undoStack.shift();
        }
        state.redoStack = [];
      });
    },

    undo: () => {
      const state = get();
      const entry = state.undoStack[state.undoStack.length - 1];
      if (!entry) return;
      entry.undo();
      set((s) => {
        const popped = s.undoStack.pop();
        if (popped) s.redoStack.push(popped);
      });
    },

    redo: () => {
      const state = get();
      const entry = state.redoStack[state.redoStack.length - 1];
      if (!entry) return;
      entry.redo();
      set((s) => {
        const popped = s.redoStack.pop();
        if (popped) s.undoStack.push(popped);
      });
    },

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    clearHistory: () => {
      set((state) => {
        state.undoStack = [];
        state.redoStack = [];
      });
    },

    toggleVisibility: (nodeId) => {
      set((state) => {
        const current = state.nodeVisibility[nodeId] ?? true;
        state.nodeVisibility[nodeId] = !current;
      });
    },

    setVisibility: (nodeId, visible) => {
      set((state) => {
        state.nodeVisibility[nodeId] = visible;
      });
    },

    isVisible: (nodeId) => get().nodeVisibility[nodeId] ?? true,

    toggleLock: (nodeId) => {
      set((state) => {
        state.objectLocks[nodeId] = !(state.objectLocks[nodeId] ?? false);
      });
    },

    isLocked: (nodeId) => get().objectLocks[nodeId] ?? false,

    setViewMode: (mode) => {
      set((state) => {
        state.viewMode = mode;
      });
    },

    setShowAabb: (v) => {
      set((state) => {
        state.showAabb = v;
      });
    },

    setShowCollisionMesh: (v) => {
      set((state) => {
        state.showCollisionMesh = v;
      });
    },

    toggleCollisionVisibility: (sourceId) => {
      set((state) => {
        const current = state.collisionVisibility[sourceId] ?? true;
        state.collisionVisibility[sourceId] = !current;
      });
    },

    setCollisionVisibility: (sourceId, visible) => {
      set((state) => {
        state.collisionVisibility[sourceId] = visible;
      });
    },

    setAllCollisionVisibility: (visible) => {
      set((state) => {
        for (const key of Object.keys(state.collisionVisibility)) {
          state.collisionVisibility[key] = visible;
        }
      });
    },

    setSessionId: (id) => {
      set((state) => {
        state.sessionId = id;
      });
    },

    syncOutlinerOrder: (nodeIds) => {
      set((state) => {
        state.outlinerOrder = mergeOutlinerOrder(state.outlinerOrder, nodeIds);
      });
    },

    reorderOutlinerNode: (activeId, overId) => {
      set((state) => {
        state.outlinerOrder = reorderOutlinerIds(state.outlinerOrder, activeId, overId);
      });
    },

    resetAll: () => {
      set((state) => {
        state.selectedIds = new Set();
        state.lastSelectedId = null;
        state.anchorId = null;
        state.groups = [];
        state.clipboard = [];
        state.clipboardOperation = null;
        state.undoStack = [];
        state.redoStack = [];
        state.nodeVisibility = {};
        state.objectLocks = {};
        state.collisionVisibility = {};
        state.sessionId = null;
        state.outlinerOrder = [];
      });
    },
  })),
);
