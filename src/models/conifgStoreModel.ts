import { Store } from "@tauri-apps/plugin-store";

export interface ConfigState {
  store: Store | null;
  initStore: () => void;
}
