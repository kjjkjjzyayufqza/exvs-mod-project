import { Store } from "@tauri-apps/plugin-store";
import type { AppLocale } from "@/i18n/locale";
import type { PreviewRenderStyle } from "@/components/ssbh-model-preview/SsbhModelPreviewContext";

export interface ConfigState {
  store: Store | null;
  initStore: () => Promise<void>;
  getSetting: <T = unknown>(key: string) => Promise<T | undefined>;
  setSetting: (key: string, value: unknown) => Promise<void>;

  // Settings that will be stored in the config store
  obDplCachePath?: string;
  obModPath?: string;
  /**
   * EXVS2 Workspace root (e.g. E:\XB\mod).
   * Used by FHM2D Init extracts into 012list/041cpm/006effect/….
   */
  testEditorFolder?: string;
  extractOutputPath?: string;
  characterIdDebugMscOutputPath?: string;
  unitModelOutputPath?: string;
  imgToNutexbOutputPath?: string;
  repackInputPath?: string;
  sceneEditGizmoSize?: number;
  sceneEditTexturesEnabled: boolean;
  sceneEditPreviewRenderStyle: PreviewRenderStyle;
  unitModelPreviewRenderStyle: PreviewRenderStyle;
  cameraPreviewViewZoom: number;
  sidebarOpen: boolean;
  locale: AppLocale;

  // Methods to update settings
  setRepackInputPath: (path: string) => Promise<void>;
  setSceneEditGizmoSize: (size: number) => Promise<void>;
  setSceneEditTexturesEnabled: (enabled: boolean) => Promise<void>;
  setSceneEditPreviewRenderStyle: (style: PreviewRenderStyle) => Promise<void>;
  setUnitModelPreviewRenderStyle: (style: PreviewRenderStyle) => Promise<void>;
  setCameraPreviewViewZoom: (zoom: number) => Promise<void>;
  setSidebarOpen: (open: boolean) => Promise<void>;
  setLocale: (locale: AppLocale) => Promise<void>;
}
