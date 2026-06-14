import { Store } from "@tauri-apps/plugin-store";

export interface ConfigState {
  store: Store | null;
  initStore: () => void;
  getSetting: <T = unknown>(key: string) => Promise<T | undefined>;
  setSetting: (key: string, value: unknown) => Promise<void>;

  // Settings that will be stored in the config store
  obDplCachePath?: string;
  obModPath?: string;
  extractOutputPath?: string;
  unitModelOutputPath?: string;
  imgToNutexbOutputPath?: string;
  repackInputPath?: string;
  sceneEditGizmoSize?: number;
  sidebarOpen: boolean;

  // Methods to update settings
  setRepackInputPath: (path: string) => Promise<void>;
  setSceneEditGizmoSize: (size: number) => Promise<void>;
  setSidebarOpen: (open: boolean) => Promise<void>;
}
