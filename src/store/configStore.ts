import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import { ConfigState } from "../models/conifgStoreModel";

export const useConfigStore = create<ConfigState>((set, get) => ({
  store: null,
  obDplCachePath: "",
  extractOutputPath: "",
  imgToNutexbOutputPath: "",
  repackInputPath: "",

  initStore: async () => {
    // Init the tauri store
    const _store = await Store.load("settings.json");
    set({ store: _store });

    // Load saved settings if they exist
    const obDplCachePath = await _store.get("obDplCachePath") || "";
    const extractOutputPath = await _store.get("extractOutputPath") || "";
    const imgToNutexbOutputPath = await _store.get("imgToNutexbOutputPath") || "";
    const repackInputPath = await _store.get("repackInputPath") || "";

    // Update state with loaded values
    set({
      obDplCachePath: obDplCachePath as string,
      extractOutputPath: extractOutputPath as string,
      imgToNutexbOutputPath: imgToNutexbOutputPath as string,
      repackInputPath: repackInputPath as string
    });

    // Save changes
    await _store.save();
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
