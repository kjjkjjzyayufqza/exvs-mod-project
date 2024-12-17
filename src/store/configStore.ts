import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import { ConfigState } from "../models/conifgStoreModel";

export const useConfigStore = create<ConfigState>((set) => ({
  store: null,
  initStore: async () => {
    //init the tauri store
    const _store = await Store.load("settings.json");
    set({ store: _store });

    //debug
    _store.set("test", "test");
  },
}));