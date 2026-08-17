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
      return;
    }
    localStorage.setItem(BLENDER_51_PATH_STORAGE_KEY, trimmed);
  } catch {
    // localStorage may be unavailable in some test environments
  }
}
