import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import { ConfigState } from "../models/conifgStoreModel";
import {
  DEFAULT_SCENE_GIZMO_SIZE,
  SCENE_GIZMO_SIZE_SETTING_KEY,
  normalizeSceneGizmoSize,
} from "@/page/SceneEdit/utils/sceneEditorSettings";

export const useConfigStore = create<ConfigState>((set, get) => ({
  store: null,
  obDplCachePath: "",
  obModPath: "",
  extractOutputPath: "",
  imgToNutexbOutputPath: "",
  repackInputPath: "",
  sceneEditGizmoSize: DEFAULT_SCENE_GIZMO_SIZE,

  initStore: async () => {
    // Init the tauri store
    const _store = await Store.load("settings.json");
    set({ store: _store });

    // Load saved settings if they exist
    const obDplCachePath = await _store.get("obDplCachePath") || "";
    const obModPath = await _store.get("obModPath") || "";
    const extractOutputPath = await _store.get("extractOutputPath") || "";
    const imgToNutexbOutputPath = await _store.get("imgToNutexbOutputPath") || "";
    const repackInputPath = await _store.get("repackInputPath") || "";
    const sceneEditGizmoSize = normalizeSceneGizmoSize(
      await _store.get(SCENE_GIZMO_SIZE_SETTING_KEY),
    );

    // Update state with loaded values
    set({
      obDplCachePath: obDplCachePath as string,
      obModPath: obModPath as string,
      extractOutputPath: extractOutputPath as string,
      imgToNutexbOutputPath: imgToNutexbOutputPath as string,
      repackInputPath: repackInputPath as string,
      sceneEditGizmoSize,
    });

    // Save changes
    await _store.save();
  },

  getSetting: async <T = unknown,>(key: string): Promise<T | undefined> => {
    const { store } = get();
    if (!store) return undefined;
    const value = await store.get(key);
    return value as T | undefined;
  },

  setSetting: async (key: string, value: unknown): Promise<void> => {
    const { store } = get();
    if (!store) return;

    await store.set(key, value);
    await store.save();

    // Keep known fields in sync for components that rely on Zustand state.
    if (key === "obDplCachePath") set({ obDplCachePath: String(value ?? "") });
    if (key === "obModPath") set({ obModPath: String(value ?? "") });
    if (key === "extractOutputPath") set({ extractOutputPath: String(value ?? "") });
    if (key === "imgToNutexbOutputPath") set({ imgToNutexbOutputPath: String(value ?? "") });
    if (key === "repackInputPath") set({ repackInputPath: String(value ?? "") });
    if (key === SCENE_GIZMO_SIZE_SETTING_KEY) set({ sceneEditGizmoSize: normalizeSceneGizmoSize(value) });
  },

  setRepackInputPath: async (path: string) => {
    const { store } = get();
    if (store) {
      await store.set("repackInputPath", path);
      await store.save();
      set({ repackInputPath: path });
    }
  },

  setSceneEditGizmoSize: async (size: number) => {
    const normalized = normalizeSceneGizmoSize(size);
    const { store } = get();
    if (store) {
      await store.set(SCENE_GIZMO_SIZE_SETTING_KEY, normalized);
      await store.save();
    }
    set({ sceneEditGizmoSize: normalized });
  },
}));
