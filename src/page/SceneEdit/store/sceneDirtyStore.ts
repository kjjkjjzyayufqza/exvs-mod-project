import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type ChangeType = "added" | "modified" | "deleted";

export type ModifiedFields = {
  transform: boolean;
  material: boolean;
  textures: boolean;
  hkt: boolean;
};

export type ObjectDirtyEntry = {
  changeType: ChangeType;
  modifiedFields: ModifiedFields;
};

export type GlobalDirtyState = {
  graphicParams: boolean;
  placementOrder: boolean;
  textures: boolean;
};

const EMPTY_MODIFIED_FIELDS: ModifiedFields = {
  transform: false,
  material: false,
  textures: false,
  hkt: false,
};

interface SceneDirtyState {
  objects: Record<string, ObjectDirtyEntry>;
  global: GlobalDirtyState;
  replacedModels: Record<string, boolean>;
}

interface SceneDirtyActions {
  hasAnyChanges: () => boolean;
  markObjectAdded: (folderName: string) => void;
  markObjectModified: (folderName: string, field: keyof ModifiedFields) => void;
  markObjectDeleted: (folderName: string) => void;
  markGlobalDirty: (field: keyof GlobalDirtyState) => void;
  markModelReplaced: (folderName: string) => void;
  getReplacedModels: () => string[];
  getAddedObjects: () => string[];
  getModifiedObjects: () => string[];
  getDeletedObjects: () => string[];
  reset: () => void;
  resetObject: (folderName: string) => void;
}

export type SceneDirtyStore = SceneDirtyState & SceneDirtyActions;

export const useSceneDirtyStore = create<SceneDirtyStore>()(
  immer((set, get) => ({
    objects: {} as Record<string, ObjectDirtyEntry>,
    global: { graphicParams: false, placementOrder: false, textures: false },
    replacedModels: {} as Record<string, boolean>,

    hasAnyChanges: () => {
      const state = get();
      if (Object.keys(state.objects).length > 0) return true;
      if (Object.values(state.replacedModels).some(Boolean)) return true;
      return (
        state.global.graphicParams ||
        state.global.placementOrder ||
        state.global.textures
      );
    },

    markObjectAdded: (folderName) => {
      set((state) => {
        state.objects[folderName] = {
          changeType: "added",
          modifiedFields: { ...EMPTY_MODIFIED_FIELDS },
        };
      });
    },

    markObjectModified: (folderName, field) => {
      set((state) => {
        const existing = state.objects[folderName];
        if (existing) {
          if (existing.changeType === "deleted" || existing.changeType === "added") return;
          existing.modifiedFields[field] = true;
        } else {
          state.objects[folderName] = {
            changeType: "modified",
            modifiedFields: { ...EMPTY_MODIFIED_FIELDS, [field]: true },
          };
        }
      });
    },

    markObjectDeleted: (folderName) => {
      set((state) => {
        const existing = state.objects[folderName];
        if (existing && existing.changeType === "added") {
          delete state.objects[folderName];
          return;
        }
        state.objects[folderName] = {
          changeType: "deleted",
          modifiedFields: { ...EMPTY_MODIFIED_FIELDS },
        };
      });
    },

    markGlobalDirty: (field) => {
      set((state) => {
        state.global[field] = true;
      });
    },

    markModelReplaced: (folderName) => {
      set((state) => {
        state.replacedModels[folderName] = true;
      });
    },

    getReplacedModels: () => {
      const { replacedModels } = get();
      return Object.keys(replacedModels).filter((name) => replacedModels[name]);
    },

    getAddedObjects: () => {
      return Object.entries(get().objects)
        .filter(([, e]) => e.changeType === "added")
        .map(([k]) => k);
    },

    getModifiedObjects: () => {
      return Object.entries(get().objects)
        .filter(([, e]) => e.changeType === "modified")
        .map(([k]) => k);
    },

    getDeletedObjects: () => {
      return Object.entries(get().objects)
        .filter(([, e]) => e.changeType === "deleted")
        .map(([k]) => k);
    },

    reset: () => {
      set((state) => {
        state.objects = {};
        state.global = { graphicParams: false, placementOrder: false, textures: false };
        state.replacedModels = {} as Record<string, boolean>;
      });
    },

    resetObject: (folderName) => {
      set((state) => {
        delete state.objects[folderName];
      });
    },
  })),
);
