import { readDir } from "@tauri-apps/plugin-fs";

const MSC_FOLDER_MARKERS = [".bscex", ".cscex", ".dscex"] as const;

export function isMscFolderMarkerFile(name: string): boolean {
  const lower = name.toLowerCase();
  return MSC_FOLDER_MARKERS.some((ext) => lower.endsWith(ext));
}

/**
 * Returns true if the directory contains at least one file with a .bscex / .cscex / .dscex suffix (non-recursive).
 */
export async function folderContainsMscScriptFiles(dirPath: string): Promise<boolean> {
  const trimmed = dirPath.trim();
  if (!trimmed) {
    return false;
  }
  const entries = await readDir(trimmed);
  return entries.some((e) => e.isFile && e.name && isMscFolderMarkerFile(e.name));
}
