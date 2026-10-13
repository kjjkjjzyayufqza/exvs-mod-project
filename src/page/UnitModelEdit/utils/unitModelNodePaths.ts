import type { UnitModelTreeNode } from "./unitModelStructureTree";
import { getParentDir, toWindowsPath } from "./unitModelRepackService";

function findFirstDescendantFileUrl(node: UnitModelTreeNode): string | undefined {
  if (node.kind === "item" && node.fileUrl?.trim()) {
    return node.fileUrl;
  }
  for (const child of node.children ?? []) {
    const found = findFirstDescendantFileUrl(child);
    if (found) return found;
  }
  return undefined;
}

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

/**
 * Absolute path to reveal in Explorer for a structure tree node (file or folder).
 * Folder nodes use the first descendant file, or models/<label> for model groups.
 */
export function resolveUnitModelRevealAbsPath(
  structureJsonPath: string,
  node: UnitModelTreeNode,
): string | null {
  if (node.kind === "item" && node.fileUrl?.trim()) {
    return resolveUnitModelNodeAbsPath(structureJsonPath, node.fileUrl);
  }
  const descendantUrl = findFirstDescendantFileUrl(node);
  if (descendantUrl) {
    return resolveUnitModelNodeAbsPath(structureJsonPath, descendantUrl);
  }
  if (node.role === "model-group" && node.label.trim()) {
    const parent = getParentDir(structureJsonPath);
    return toWindowsPath(`${parent}/models/${node.label}`);
  }
  return null;
}
