import { Store } from "@tauri-apps/plugin-store";

export interface ConfigState {
  store: Store | null;
  initStore: () => void;

  // Settings that will be stored in the config store
  obDplCachePath?: string;
  extractOutputPath?: string;
  imgToNutexbOutputPath?: string;
  repackInputPath?: string;
  
  // Methods to update settings
  setRepackInputPath: (path: string) => Promise<void>;
}
