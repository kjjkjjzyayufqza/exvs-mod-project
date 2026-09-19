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

export type MotionFbxComposeJobStatus = {
  running: boolean;
  stopRequested: boolean;
  pid: number | null;
  blenderPath: string | null;
  outputFbx: string | null;
  elapsedMs: number;
  stdoutTail: string;
  stderrTail: string;
};

export const IDLE_MOTION_FBX_COMPOSE_JOB: MotionFbxComposeJobStatus = {
  running: false,
  stopRequested: false,
  pid: null,
  blenderPath: null,
  outputFbx: null,
  elapsedMs: 0,
  stdoutTail: "",
  stderrTail: "",
};

export function getMotionFbxComposeJobStatus(): Promise<MotionFbxComposeJobStatus> {
  return invoke<MotionFbxComposeJobStatus>("ssbh_motion_fbx_compose_job_status");
}

export function stopMotionFbxCompose(): Promise<boolean> {
  return invoke<boolean>("ssbh_stop_motion_fbx_compose");
}

export function isMotionFbxComposeStopped(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /stopped by user/i.test(message);
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
