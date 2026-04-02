/**
 * Absolute paths from workspace root down to the target file (inclusive),
 * used to highlight the path to the current JSON in the tree without scanning the tree.
 */
export function pathAncestorSetFromRoot(
  rootDir: string | undefined,
  targetPath: string | null,
): Set<string> {
  if (!targetPath || !rootDir) return new Set();
  const norm = (s: string) => s.replace(/\\/g, "/");
  const root = norm(rootDir).replace(/\/+$/, "");
  const full = norm(targetPath);
  if (!full.startsWith(root)) return new Set();
  const relative = full.slice(root.length).replace(/^\/+/, "");
  if (!relative) return new Set();
  const set = new Set<string>();
  let cur = root;
  for (const seg of relative.split("/")) {
    cur = `${cur}/${seg}`;
    set.add(cur);
  }
  return set;
}
