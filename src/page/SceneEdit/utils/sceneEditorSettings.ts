export const SCENE_GIZMO_SIZE_SETTING_KEY = "sceneEditGizmoSize";

/** Tauri store keys under `dialogDefaultPath` — one per Scene Editor file/folder dialog. */
export const SCENE_OPEN_FOLDER_DIALOG_PATH_KEY = "sceneEdit.openFolder";
export const SCENE_IMPORT_FHM2D_DIALOG_PATH_KEY = "sceneEdit.importFhm2d";
export const SCENE_EXTRACT_FHM2D_SOURCE_DIALOG_PATH_KEY = "sceneEdit.extractFhm2dSource";
export const SCENE_EXTRACT_FHM2D_OUTPUT_DIALOG_PATH_KEY = "sceneEdit.extractFhm2dOutput";
export const SCENE_IMPORT_DAE_QUICK_DIALOG_PATH_KEY = "sceneEdit.importDaeQuick";
export const SCENE_IMPORT_DAE_CONFIG_DIALOG_PATH_KEY = "sceneEdit.importDaeConfig";
export const SCENE_SAVE_FHM2D_DIALOG_PATH_KEY = "sceneEdit.saveFhm2d";
export const SCENE_EXPORT_DAE_FILE_DIALOG_PATH_KEY = "sceneEdit.exportDaeFile";
export const SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY = "sceneEdit.exportDaeFolder";
/** Last model file picked in Generate HKT from New Model (full path). */
export const SCENE_GENERATE_HKT_FROM_MODEL_DIALOG_PATH_KEY = "sceneEdit.generateHktFromModel";
export const DEFAULT_SCENE_GIZMO_SIZE = 1.12;
export const MIN_SCENE_GIZMO_SIZE = 0.25;
export const MAX_SCENE_GIZMO_SIZE = 3;

export function normalizeSceneGizmoSize(value: unknown): number {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric)) {
    return DEFAULT_SCENE_GIZMO_SIZE;
  }
  return Math.min(MAX_SCENE_GIZMO_SIZE, Math.max(MIN_SCENE_GIZMO_SIZE, numeric));
}
