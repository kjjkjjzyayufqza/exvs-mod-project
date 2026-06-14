import { getParentDir, toWindowsPath } from "./unitModelRepackService";

/** Canonical key for path equality checks (lower-case, forward slash, no trailing slash). */
export function normalizeComparePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * Absolute on-disk path of a structure node, mirroring the Rust
 * `resolve_file_path(json_dir, file_url)` in `unit_model_textures.rs`: `fileUrl`
 * is relative to the directory holding `_structure.json`. Returns a Windows-style
 * path for consistency with the other unit-model Tauri commands.
 */
export function resolveUnitModelNodeAbsPath(structureJsonPath: string, fileUrl: string): string {
  const parent = getParentDir(structureJsonPath);
  const rel = fileUrl.replace(/\\/g, "/").replace(/^\/+/, "");
  return toWindowsPath(`${parent}/${rel}`);
}
