import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import { ConfigState } from "../models/conifgStoreModel";

export const useConfigStore = create<ConfigState>((set, get) => ({
  store: null,
  obDplCachePath: "",
  obModPath: "",
  extractOutputPath: "",
  imgToNutexbOutputPath: "",
  repackInputPath: "",

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

    // Update state with loaded values
    set({
      obDplCachePath: obDplCachePath as string,
      obModPath: obModPath as string,
      extractOutputPath: extractOutputPath as string,
      imgToNutexbOutputPath: imgToNutexbOutputPath as string,
      repackInputPath: repackInputPath as string
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
  },

  setRepackInputPath: async (path: string) => {
    const { store } = get();
    if (store) {
      await store.set("repackInputPath", path);
      await store.save();
      set({ repackInputPath: path });
    }
  },
}));
