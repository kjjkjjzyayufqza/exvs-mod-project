import { Store } from "@tauri-apps/plugin-store";

export interface ConfigState {
  store: Store | null;
  initStore: () => void;
  getSetting: <T = unknown>(key: string) => Promise<T | undefined>;
  setSetting: (key: string, value: unknown) => Promise<void>;

  // Settings that will be stored in the config store
  obDplCachePath?: string;
  extractOutputPath?: string;
  imgToNutexbOutputPath?: string;
  repackInputPath?: string;
  
  // Methods to update settings
  setRepackInputPath: (path: string) => Promise<void>;
}
