import { getParentDir, toWindowsPath } from "./unitModelRepackService";

/** Canonical key for path equality checks (lower-case, forward slash, no trailing slash). */
export function normalizeComparePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * Absolute on-disk path of a structure node, mirroring the Rust
 * `resolve_file_path(json_dir, file_url)` in `unit_model_textures.rs`: `fileUrl`
 * is relative to the directory holding `_structure.json`. Structure JSON often
 * stores Windows-relative urls as `.\\folder\\file.ext` (see Rust
 * `file_url_for_target`), so leading `./` must be stripped or copy/reveal paths
 * become `E:\\root\\.\\folder\\file.ext` and Explorer fails silently.
 * Returns a Windows-style path for consistency with other unit-model commands.
 */
export function resolveUnitModelNodeAbsPath(structureJsonPath: string, fileUrl: string): string {
  const parent = getParentDir(structureJsonPath);
  // Match Rust: replace \\ → /, then trim_start_matches("./") (all leading ./).
  let rel = fileUrl.replace(/\\/g, "/");
  while (rel.startsWith("./")) {
    rel = rel.slice(2);
  }
  rel = rel.replace(/^\/+/, "");
  return toWindowsPath(`${parent}/${rel}`);
}
