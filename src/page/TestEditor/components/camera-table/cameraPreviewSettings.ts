/** Preview-only view zoom. Not authored FOV/offset; persisted in settings.json. */
export const CAMERA_PREVIEW_VIEW_ZOOM_SETTING_KEY = "cameraTablePreviewViewZoom";
const CAMERA_PREVIEW_VIEW_ZOOM_MIRROR_KEY = "cameraTable:previewViewZoom";

export const DEFAULT_CAMERA_PREVIEW_VIEW_ZOOM = 1;
export const MIN_CAMERA_PREVIEW_VIEW_ZOOM = 0.4;
export const MAX_CAMERA_PREVIEW_VIEW_ZOOM = 5;

export function normalizeCameraPreviewViewZoom(value: unknown): number {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (typeof numeric !== "number" || !Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_CAMERA_PREVIEW_VIEW_ZOOM;
  }
  return Math.min(MAX_CAMERA_PREVIEW_VIEW_ZOOM, Math.max(MIN_CAMERA_PREVIEW_VIEW_ZOOM, numeric));
}

export function readCameraPreviewViewZoomMirror(): number {
  try {
    return normalizeCameraPreviewViewZoom(window.localStorage.getItem(CAMERA_PREVIEW_VIEW_ZOOM_MIRROR_KEY));
  } catch {
    return DEFAULT_CAMERA_PREVIEW_VIEW_ZOOM;
  }
}

export function writeCameraPreviewViewZoomMirror(zoom: number): void {
  try {
    window.localStorage.setItem(CAMERA_PREVIEW_VIEW_ZOOM_MIRROR_KEY, String(normalizeCameraPreviewViewZoom(zoom)));
  } catch {
    // localStorage may be unavailable; the Tauri store remains authoritative.
  }
}
