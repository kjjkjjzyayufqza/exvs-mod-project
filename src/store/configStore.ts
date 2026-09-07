import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import { ConfigState } from "../models/conifgStoreModel";
import {
  DEFAULT_SCENE_GIZMO_SIZE,
  SCENE_GIZMO_SIZE_SETTING_KEY,
  normalizeSceneGizmoSize,
} from "@/page/SceneEdit/utils/sceneEditorSettings";
import {
  CAMERA_PREVIEW_VIEW_ZOOM_SETTING_KEY,
  normalizeCameraPreviewViewZoom,
  readCameraPreviewViewZoomMirror,
  writeCameraPreviewViewZoomMirror,
} from "@/page/TestEditor/components/camera-table/cameraPreviewSettings";
import {
  APP_LOCALE_STORE_KEY,
  normalizeAppLocale,
  readAppLocaleMirror,
  writeAppLocaleMirror,
  type AppLocale,
} from "@/i18n/locale";

// Authoritative persistence for the sidebar collapse state lives in the Tauri
// store (settings.json). The localStorage mirror is a non-authoritative cache
// read synchronously on first paint to avoid an expanded->collapsed flicker
// while the async store loads.
const SIDEBAR_OPEN_STORE_KEY = "sidebarOpen";
const SIDEBAR_OPEN_MIRROR_KEY = "sidebar:open";
export const CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY = "characterIdDebugMscOutputPath";
/** EXVS2 Workspace open-folder root; also FHM2D Init workspace extract root. */
export const TEST_EDITOR_FOLDER_STORE_KEY = "testEditorFolder";

let initStoreInFlight: Promise<void> | null = null;

export function trimmedConfigPath(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

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
  testEditorFolder: "",
  extractOutputPath: "",
  characterIdDebugMscOutputPath: "",
  unitModelOutputPath: "",
  imgToNutexbOutputPath: "",
  repackInputPath: "",
  sceneEditGizmoSize: DEFAULT_SCENE_GIZMO_SIZE,
  cameraPreviewViewZoom: readCameraPreviewViewZoomMirror(),
  sidebarOpen: readSidebarOpenMirror(),
  locale: readAppLocaleMirror(),

  initStore: () => {
    if (initStoreInFlight) return initStoreInFlight;
    initStoreInFlight = (async () => {
    const _store = await Store.load("settings.json");
    set({ store: _store });

    // Load saved settings if they exist
    const obDplCachePath = await _store.get("obDplCachePath") || "";
    const obModPath = await _store.get("obModPath") || "";
    const testEditorFolder = await _store.get(TEST_EDITOR_FOLDER_STORE_KEY) || "";
    const extractOutputPath = await _store.get("extractOutputPath") || "";
    const characterIdDebugMscOutputPath = await _store.get(CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY) || "";
    const unitModelOutputPath = await _store.get("unitModelOutputPath") || "";
    const imgToNutexbOutputPath = await _store.get("imgToNutexbOutputPath") || "";
    const repackInputPath = await _store.get("repackInputPath") || "";
    const sceneEditGizmoSize = normalizeSceneGizmoSize(
      await _store.get(SCENE_GIZMO_SIZE_SETTING_KEY),
    );
    const cameraPreviewViewZoom = normalizeCameraPreviewViewZoom(
      await _store.get(CAMERA_PREVIEW_VIEW_ZOOM_SETTING_KEY),
    );
    writeCameraPreviewViewZoomMirror(cameraPreviewViewZoom);
    const storedSidebarOpen = await _store.get(SIDEBAR_OPEN_STORE_KEY);
    const sidebarOpen = storedSidebarOpen === undefined ? true : Boolean(storedSidebarOpen);
    writeSidebarOpenMirror(sidebarOpen);
    const locale = normalizeAppLocale(
      (await _store.get(APP_LOCALE_STORE_KEY)) ?? readAppLocaleMirror(),
    );
    writeAppLocaleMirror(locale);
    await _store.set(APP_LOCALE_STORE_KEY, locale);

    // Update state with loaded values
    set({
      obDplCachePath: obDplCachePath as string,
      obModPath: obModPath as string,
      testEditorFolder: testEditorFolder as string,
      extractOutputPath: extractOutputPath as string,
      characterIdDebugMscOutputPath: characterIdDebugMscOutputPath as string,
      unitModelOutputPath: unitModelOutputPath as string,
      imgToNutexbOutputPath: imgToNutexbOutputPath as string,
      repackInputPath: repackInputPath as string,
      sceneEditGizmoSize,
      cameraPreviewViewZoom,
      sidebarOpen,
      locale,
    });

    await _store.save();
    })().finally(() => {
      initStoreInFlight = null;
    });
    return initStoreInFlight;
  },

  getSetting: async <T = unknown,>(key: string): Promise<T | undefined> => {
    if (!get().store) {
      await get().initStore();
    }
    const { store } = get();
    if (!store) return undefined;
    const value = await store.get(key);
    return value as T | undefined;
  },

  setSetting: async (key: string, value: unknown): Promise<void> => {
    if (!get().store) {
      await get().initStore();
    }
    const { store } = get();
    if (!store) {
      throw new Error("Config store failed to initialize");
    }

    await store.set(key, value);
    await store.save();

    // Keep known fields in sync for components that rely on Zustand state.
    if (key === "obDplCachePath") set({ obDplCachePath: String(value ?? "") });
    if (key === "obModPath") set({ obModPath: String(value ?? "") });
    if (key === TEST_EDITOR_FOLDER_STORE_KEY) set({ testEditorFolder: String(value ?? "") });
    if (key === "extractOutputPath") set({ extractOutputPath: String(value ?? "") });
    if (key === CHARACTER_ID_DEBUG_MSC_OUTPUT_PATH_SETTING_KEY) set({ characterIdDebugMscOutputPath: String(value ?? "") });
    if (key === "unitModelOutputPath") set({ unitModelOutputPath: String(value ?? "") });
    if (key === "imgToNutexbOutputPath") set({ imgToNutexbOutputPath: String(value ?? "") });
    if (key === "repackInputPath") set({ repackInputPath: String(value ?? "") });
    if (key === SCENE_GIZMO_SIZE_SETTING_KEY) set({ sceneEditGizmoSize: normalizeSceneGizmoSize(value) });
    if (key === CAMERA_PREVIEW_VIEW_ZOOM_SETTING_KEY) {
      const cameraPreviewViewZoom = normalizeCameraPreviewViewZoom(value);
      writeCameraPreviewViewZoomMirror(cameraPreviewViewZoom);
      set({ cameraPreviewViewZoom });
    }
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

  setCameraPreviewViewZoom: async (zoom: number) => {
    const normalized = normalizeCameraPreviewViewZoom(zoom);
    writeCameraPreviewViewZoomMirror(normalized);
    set({ cameraPreviewViewZoom: normalized });
    const { store } = get();
    if (store) {
      await store.set(CAMERA_PREVIEW_VIEW_ZOOM_SETTING_KEY, normalized);
      await store.save();
    }
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

  setLocale: async (value: AppLocale) => {
    const locale = normalizeAppLocale(value);
    writeAppLocaleMirror(locale);
    set({ locale });
    const { store } = get();
    if (store) {
      await store.set(APP_LOCALE_STORE_KEY, locale);
      await store.save();
    }
  },
}));
