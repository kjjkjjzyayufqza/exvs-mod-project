export const SCENE_GIZMO_SIZE_SETTING_KEY = "sceneEditGizmoSize";
export const SCENE_IMPORT_DAE_DIALOG_PATH_KEY = "sceneEdit.importDae";
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
