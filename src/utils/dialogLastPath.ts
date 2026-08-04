/**
 * Persists the last directory used per dialog action (localStorage).
 * Tauri `defaultPath` should point at a folder (or a file path for save dialogs).
 */

const STORAGE_PREFIX = "tauri.dialog.lastPath.";

export const DialogLastPathKey = {
  ssbhPreviewOpenModelFolder: "ssbhPreview.openModelFolder",
  ssbhPreviewOpenNumdlb: "ssbhPreview.openNumdlb",
  ssbhPreviewOpenFhm2dMemory: "ssbhPreview.openFhm2dMemory",
  ssbhPreviewOpenNuanmb: "ssbhPreview.openNuanmb",
  ssbhPreviewOpenMotionFolder: "ssbhPreview.openMotionFolder",
  ssbhPreviewOpenMotionFbx: "ssbhPreview.openMotionFbx",
  ssbhMotionFbxExport: "ssbhMotionFbx.export",
  ssbhMotionFbxImportOpen: "ssbhMotionFbx.importOpen",
  ssbhMotionFbxImportSave: "ssbhMotionFbx.importSave",
  ssbhMotionBatchExportDir: "ssbhMotionFbx.batchExportDir",
  ssbhMotionClipOpsSave: "ssbhMotionFbx.clipOpsSave",
  ssbhBlender51Exe: "ssbhMotionFbx.blender51",
  /** @deprecated CascadeurBridge removed; keys kept only so old localStorage values are ignored safely */
  ssbhCascadeurExportBridge: "ssbhCascadeur.exportBridge",
  ssbhCascadeurImportFbx: "ssbhCascadeur.importFbx",
  ssbhCascadeurImportManifest: "ssbhCascadeur.importManifest",
  ssbhCascadeurImportNuanmb: "ssbhCascadeur.importNuanmb",
  ssbhDaeExportDae: "ssbhDae.exportDae",
  ssbhDaeImportSourceDae: "ssbhDae.importSource.dae",
  ssbhDaeImportSourceFbx: "ssbhDae.importSource.fbx",
  ssbhDaeConvertOutputFolder: "ssbhDae.convertOutputFolder",
  /** MSC Workspace "Pick folder" — store the selected folder itself, not its parent. */
  mscWorkspaceFolder: "mscWorkspace.folder",
  traditionalMscWorkspaceFolder: "mscWorkspace.traditional.folder",
} as const;

export type DialogLastPathKeyType = (typeof DialogLastPathKey)[keyof typeof DialogLastPathKey];

function stripTrailingSeparators(p: string): string {
  return p.replace(/[/\\]+$/, "");
}

function parentDirectory(filePath: string): string {
  const t = stripTrailingSeparators(filePath);
  const i = Math.max(t.lastIndexOf("/"), t.lastIndexOf("\\"));
  if (i <= 0) return t;
  return t.slice(0, i);
}

/**
 * Returns a path suitable for Tauri `defaultPath`, or `fallback` / undefined.
 */
export function getDialogDefaultPath(
  key: DialogLastPathKeyType,
  fallback?: string | null,
): string | undefined {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + key)?.trim();
    if (v) return v;
  } catch {
    // storage unavailable
  }
  const f = fallback?.trim();
  return f || undefined;
}

/**
 * Stores the parent folder of a file pick, or the folder itself for directory picks.
 */
export function rememberDialogSelection(
  key: DialogLastPathKeyType,
  selectedPath: string,
  kind: "file" | "directory",
): void {
  const trimmed = selectedPath.trim();
  if (!trimmed) return;
  const dir = kind === "directory" ? stripTrailingSeparators(trimmed) : parentDirectory(trimmed);
  if (!dir) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, dir);
  } catch {
    // ignore quota / private mode
  }
}
