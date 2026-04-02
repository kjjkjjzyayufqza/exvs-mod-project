import type { TestTreeNode } from "../types";
import { normalizePackFolderName } from "../utils/packName";

export const STRUCTURE_JSON_SUFFIX = "_structure.json";

/** Workspace root direct child folder only (same packs as Repack Changes). */
export function isWorkspaceDirectChildFolder(
  node: TestTreeNode,
  rootDir: string | undefined,
): boolean {
  if (!node.isDir || !rootDir) return false;
  const normalize = (input: string) => input.replace(/\\/g, "/");
  const normalizedRoot = normalize(rootDir).replace(/\/+$/, "");
  const normalizedNode = normalize(node.path).replace(/\/+$/, "");
  if (!normalizedNode.startsWith(normalizedRoot)) return false;
  const relative = normalizedNode.slice(normalizedRoot.length).replace(/^\/+/, "");
  return Boolean(relative && !relative.includes("/"));
}

/** Root-level *_structure.json only; matches Repack Changes folder naming. */
export function parseRootStructureJsonRepackTarget(
  fileName: string,
  filePath: string,
  rootDir: string | undefined,
): { folderName: string; structurePath: string } | null {
  if (!rootDir) return null;
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(STRUCTURE_JSON_SUFFIX)) return null;
  const normalize = (input: string) => input.replace(/\\/g, "/");
  const normalizedRoot = normalize(rootDir).replace(/\/+$/, "");
  const normalizedNode = normalize(filePath);
  if (!normalizedNode.startsWith(normalizedRoot)) return null;
  const relative = normalizedNode.slice(normalizedRoot.length).replace(/^\/+/, "");
  if (!relative || relative.includes("/")) return null;
  const folderName = fileName.slice(0, fileName.length - STRUCTURE_JSON_SUFFIX.length);
  if (!folderName) return null;
  return { folderName: normalizePackFolderName(folderName), structurePath: filePath };
}
