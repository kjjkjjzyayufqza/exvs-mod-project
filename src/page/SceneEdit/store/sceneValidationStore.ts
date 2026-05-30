import { create } from "zustand";
import type { ExvsStageValidationError } from "../utils/sceneSessionService";

export interface SceneValidationState {
  /** Flat list of the most recent validation errors (for the dialog). */
  errors: ExvsStageValidationError[];
  /** Outliner node id (== sub-model folder name) -> error count, for marking. */
  errorFolders: Record<string, number>;
}

interface SceneValidationActions {
  setErrors: (
    errors: ExvsStageValidationError[],
    errorFolders: Record<string, number>,
  ) => void;
  clear: () => void;
  clearFolder: (folderName: string) => void;
  hasErrors: () => boolean;
}

export type SceneValidationStore = SceneValidationState & SceneValidationActions;

const EMPTY_STATE: SceneValidationState = { errors: [], errorFolders: {} };

export const useSceneValidationStore = create<SceneValidationStore>((set, get) => ({
  ...EMPTY_STATE,

  setErrors: (errors, errorFolders) => set({ errors, errorFolders }),

  clear: () => set({ ...EMPTY_STATE }),

  clearFolder: (folderName) =>
    set((state) => {
      if (!(folderName in state.errorFolders)) return state;
      const nextFolders = { ...state.errorFolders };
      delete nextFolders[folderName];
      return {
        errorFolders: nextFolders,
        errors: state.errors,
      };
    }),

  hasErrors: () => get().errors.length > 0,
}));
