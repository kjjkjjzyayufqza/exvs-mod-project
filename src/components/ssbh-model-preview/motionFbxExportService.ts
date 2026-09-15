import { invoke } from "@tauri-apps/api/core";

export type CompleteMotionFbxExportRequest = {
  nuanmbPath: string;
  nusktbPath: string;
  numdlbPath: string;
  outputFbxPath: string;
  blenderPath: string | null;
  actionName: string | null;
};

export type CompleteMotionFbxExportReport = {
  outputPath: string;
  actionName: string;
  frameCount: number;
  durationSeconds: number;
  blenderPath: string;
  warnings: string[];
};

export function exportCompleteMotionFbx(
  request: CompleteMotionFbxExportRequest,
): Promise<CompleteMotionFbxExportReport> {
  return invoke<CompleteMotionFbxExportReport>("ssbh_export_complete_motion_fbx", { request });
}

const BLENDER_51_PATH_STORAGE_KEY = "exvs2.blender51Path";
const BLENDER_PATH_CHANGED_EVENT = "exvs2-blender-path-changed";

export function getBlender51PathOverride(): string | null {
  try {
    const value = localStorage.getItem(BLENDER_51_PATH_STORAGE_KEY)?.trim() ?? "";
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function setBlender51PathOverride(path: string | null): void {
  try {
    const trimmed = path?.trim() ?? "";
    if (trimmed.length === 0) {
      localStorage.removeItem(BLENDER_51_PATH_STORAGE_KEY);
    } else {
      localStorage.setItem(BLENDER_51_PATH_STORAGE_KEY, trimmed);
    }
  } catch {
    // localStorage may be unavailable in some test environments
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BLENDER_PATH_CHANGED_EVENT));
  }
}

export function subscribeBlenderExecutablePath(
  onChange: (path: string | null) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const handler = () => onChange(getBlender51PathOverride());
  window.addEventListener(BLENDER_PATH_CHANGED_EVENT, handler);
  return () => window.removeEventListener(BLENDER_PATH_CHANGED_EVENT, handler);
}
