import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import { ConfigState } from "../models/conifgStoreModel";
import {
  DEFAULT_SCENE_GIZMO_SIZE,
  SCENE_GIZMO_SIZE_SETTING_KEY,
  normalizeSceneGizmoSize,
} from "@/page/SceneEdit/utils/sceneEditorSettings";

// Authoritative persistence for the sidebar collapse state lives in the Tauri
// store (settings.json). The localStorage mirror is a non-authoritative cache
// read synchronously on first paint to avoid an expanded->collapsed flicker
// while the async store loads.
const SIDEBAR_OPEN_STORE_KEY = "sidebarOpen";
const SIDEBAR_OPEN_MIRROR_KEY = "sidebar:open";

export function readSidebarOpenMirror(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_OPEN_MIRROR_KEY) !== "false";
  } catch {
    return true;
  }
}

function writeSidebarOpenMirror(open: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_OPEN_MIRROR_KEY, String(open));
  } catch {
    // localStorage may be unavailable; the Tauri store remains authoritative.
  }
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  store: null,
  obDplCachePath: "",
  obModPath: "",
  extractOutputPath: "",
  unitModelOutputPath: "",
  imgToNutexbOutputPath: "",
  repackInputPath: "",
  sceneEditGizmoSize: DEFAULT_SCENE_GIZMO_SIZE,
  sidebarOpen: readSidebarOpenMirror(),

  initStore: async () => {
    // Init the tauri store
    const _store = await Store.load("settings.json");
    set({ store: _store });

    // Load saved settings if they exist
    const obDplCachePath = await _store.get("obDplCachePath") || "";
    const obModPath = await _store.get("obModPath") || "";
    const extractOutputPath = await _store.get("extractOutputPath") || "";
    const unitModelOutputPath = await _store.get("unitModelOutputPath") || "";
    const imgToNutexbOutputPath = await _store.get("imgToNutexbOutputPath") || "";
    const repackInputPath = await _store.get("repackInputPath") || "";
    const sceneEditGizmoSize = normalizeSceneGizmoSize(
      await _store.get(SCENE_GIZMO_SIZE_SETTING_KEY),
    );
    const storedSidebarOpen = await _store.get(SIDEBAR_OPEN_STORE_KEY);
    const sidebarOpen = storedSidebarOpen === undefined ? true : Boolean(storedSidebarOpen);
    writeSidebarOpenMirror(sidebarOpen);

    // Update state with loaded values
    set({
      obDplCachePath: obDplCachePath as string,
      obModPath: obModPath as string,
      extractOutputPath: extractOutputPath as string,
      unitModelOutputPath: unitModelOutputPath as string,
      imgToNutexbOutputPath: imgToNutexbOutputPath as string,
      repackInputPath: repackInputPath as string,
      sceneEditGizmoSize,
      sidebarOpen,
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
    if (key === "unitModelOutputPath") set({ unitModelOutputPath: String(value ?? "") });
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

  setSidebarOpen: async (open: boolean) => {
    writeSidebarOpenMirror(open);
    set({ sidebarOpen: open });
    const { store } = get();
    if (store) {
      await store.set(SIDEBAR_OPEN_STORE_KEY, open);
      await store.save();
    }
  },
}));
