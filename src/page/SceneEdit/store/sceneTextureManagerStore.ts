import { create } from "zustand";

export type TextureEntryStatus = "existing" | "added";

export interface TextureManagerEntry {
  id: string;
  filename: string;
  status: TextureEntryStatus;
  format: string;
  width: number;
  height: number;
  sizeBytes: number;
  referencedBy: string[];
  thumbnailDataUrl: string | null;
  nutexbPath: string | null;
  sourceImagePath: string | null;
}

/**
 * An existing stage texture that was removed in-memory and must be deleted from
 * the stage textures/ folder when the user commits with "save changes".
 */
export interface RemovedTextureRef {
  filename: string;
  nutexbPath: string | null;
}

interface SceneTextureManagerState {
  entries: TextureManagerEntry[];
  selectedId: string | null;
  searchQuery: string;
  /** Existing stage textures removed in-memory, pending deletion on save. */
  removedExisting: RemovedTextureRef[];
}

interface SceneTextureManagerActions {
  setEntries: (entries: TextureManagerEntry[]) => void;
  addEntry: (entry: TextureManagerEntry) => void;
  removeEntry: (id: string) => void;
  replaceEntry: (id: string, updated: Partial<TextureManagerEntry>) => void;
  setSelectedId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setThumbnail: (id: string, dataUrl: string) => void;
  updateReferences: (id: string, refs: string[]) => void;
  /**
   * Mark all in-memory texture edits as persisted: promote "added" entries to
   * "existing" and clear the pending-removal list. Called after a successful save.
   */
  markTexturesSaved: () => void;
  clear: () => void;
}

export type SceneTextureManagerStore = SceneTextureManagerState &
  SceneTextureManagerActions;

export const useSceneTextureManagerStore = create<SceneTextureManagerStore>(
  (set) => ({
    entries: [],
    selectedId: null,
    searchQuery: "",
    removedExisting: [],

    setEntries: (entries) => set({ entries }),
    addEntry: (entry) =>
      set((state) => ({ entries: [...state.entries, entry] })),
    removeEntry: (id) =>
      set((state) => {
        const target = state.entries.find((e) => e.id === id);
        // Only existing stage textures need on-disk deletion at save time;
        // an "added" entry was never written to the stage, so dropping it from
        // memory is enough. Guard against recording the same filename twice.
        const shouldTrack =
          target?.status === "existing" &&
          !state.removedExisting.some(
            (r) => r.filename.toLowerCase() === target.filename.toLowerCase(),
          );
        return {
          entries: state.entries.filter((e) => e.id !== id),
          selectedId: state.selectedId === id ? null : state.selectedId,
          removedExisting: shouldTrack
            ? [
                ...state.removedExisting,
                { filename: target.filename, nutexbPath: target.nutexbPath },
              ]
            : state.removedExisting,
        };
      }),
    replaceEntry: (id, updated) =>
      set((state) => ({
        entries: state.entries.map((e) =>
          e.id === id ? { ...e, ...updated } : e
        ),
      })),
    setSelectedId: (id) => set({ selectedId: id }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    setThumbnail: (id, dataUrl) =>
      set((state) => ({
        entries: state.entries.map((e) =>
          e.id === id ? { ...e, thumbnailDataUrl: dataUrl } : e
        ),
      })),
    updateReferences: (id, refs) =>
      set((state) => ({
        entries: state.entries.map((e) =>
          e.id === id ? { ...e, referencedBy: refs } : e
        ),
      })),
    markTexturesSaved: () =>
      set((state) => ({
        entries: state.entries.map((e) =>
          e.status === "added" ? { ...e, status: "existing" } : e
        ),
        removedExisting: [],
      })),
    clear: () =>
      set({ entries: [], selectedId: null, searchQuery: "", removedExisting: [] }),
  })
);

export function findEntryByFilename(
  entries: TextureManagerEntry[],
  filename: string
): TextureManagerEntry | undefined {
  const lower = filename.toLowerCase();
  return entries.find((e) => e.filename.toLowerCase() === lower);
}
