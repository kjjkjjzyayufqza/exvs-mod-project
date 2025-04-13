import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import { ConfigState } from "../models/conifgStoreModel";

export const useConfigStore = create<ConfigState>((set) => ({
  store: null,
  obDplCachePath: "",
  extractOutputPath: "",
  
  initStore: async () => {
    // Init the tauri store
    const _store = await Store.load("settings.json");
    set({ store: _store });
    
    // Load saved settings if they exist
    const obDplCachePath = await _store.get("obDplCachePath") || "";
    const extractOutputPath = await _store.get("extractOutputPath") || "";
    
    // Update state with loaded values
    set({ 
      obDplCachePath: obDplCachePath as string,
      extractOutputPath: extractOutputPath as string
    });
    
    // Save changes
    await _store.save();
  },
}));
