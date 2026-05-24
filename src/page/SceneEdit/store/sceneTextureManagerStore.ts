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

interface SceneTextureManagerState {
  entries: TextureManagerEntry[];
  selectedId: string | null;
  searchQuery: string;
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
  clear: () => void;
}

export type SceneTextureManagerStore = SceneTextureManagerState &
  SceneTextureManagerActions;

export const useSceneTextureManagerStore = create<SceneTextureManagerStore>(
  (set) => ({
    entries: [],
    selectedId: null,
    searchQuery: "",

    setEntries: (entries) => set({ entries }),
    addEntry: (entry) =>
      set((state) => ({ entries: [...state.entries, entry] })),
    removeEntry: (id) =>
      set((state) => ({
        entries: state.entries.filter((e) => e.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      })),
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
    clear: () => set({ entries: [], selectedId: null, searchQuery: "" }),
  })
);

export function findEntryByFilename(
  entries: TextureManagerEntry[],
  filename: string
): TextureManagerEntry | undefined {
  const lower = filename.toLowerCase();
  return entries.find((e) => e.filename.toLowerCase() === lower);
}
