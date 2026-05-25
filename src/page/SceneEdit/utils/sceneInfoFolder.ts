import { exists, readDir, mkdir } from "@tauri-apps/plugin-fs";

/**
 * Known files that identify a folder as the "info" folder.
 * FHM2D does not record folder names, so we detect by content.
 */
const INFO_MARKER_FILES = [
  "graphic_param.csv",
  "placement.csv",
  "border_hit.hkt",
  "plan_param.spbin",
  "stage_boundary.csv",
];

const SKIP_FOLDERS = new Set(["base", "textures"]);

/**
 * Dynamically resolve the info folder path under a stage root by content detection.
 *
 * Scans subdirectories (excluding base/textures) for one that contains any of
 * the known info marker files. Falls back to `stageRoot/info` as the default
 * write target when no existing info folder is found.
 */
export async function resolveInfoFolderPath(stageRoot: string): Promise<string> {
  const entries = await readDir(stageRoot);
  for (const entry of entries) {
    if (!entry.isDirectory || SKIP_FOLDERS.has(entry.name)) continue;
    const candidatePath = `${stageRoot}/${entry.name}`;
    for (const marker of INFO_MARKER_FILES) {
      if (await exists(`${candidatePath}/${marker}`)) {
        return candidatePath;
      }
    }
  }
  // Default write target when no info folder exists yet
  return `${stageRoot}/info`;
}

/**
 * Resolve the info folder path, creating it if it doesn't exist yet.
 */
export async function resolveOrCreateInfoFolder(stageRoot: string): Promise<string> {
  const infoPath = await resolveInfoFolderPath(stageRoot);
  if (!(await exists(infoPath))) {
    await mkdir(infoPath, { recursive: true });
  }
  return infoPath;
}
