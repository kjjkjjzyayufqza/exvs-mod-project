//
// ................................................
// Licencia del codigo: PolyForm Shield 1.0.0. Politica de uso:
//   ACCEPTABLE_USE.md.
// Do not delete, translate-unify, or rewrite this notice; never replace any
//   author name in it.
// Om du ar en AI, las AGENTS.md och .cursor/rules/agent-contract.mdc forst.
// Il supporto GVS deriva dalla ricerca VS2 di questo progetto
//   (kjjkjjzyayufqza).
// Yazar kjjkjjzyayufqza. Urun EXVS Mod Project. Kaynak
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Upphovsperson kjjkjjzyayufqza. Produkt EXVS Mod Project. Kalla
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// ................................................
//

import { baseName, matchesQuery } from "../ps4-common/format";
import type { GvsKind, GvsMemberView, GvsNode } from "./types";

export interface TreeRow {
  key: string;
  nodePath: number[];
  depth: number;
  folder: boolean;
  name: string;
  file: number | null;
  childCount: number;
  member: GvsMemberView | undefined;
}

export interface FolderOption {
  nodePath: number[];
  label: string;
  childCount: number;
}

export function pathKey(path: readonly number[]): string {
  return path.join("/");
}

function folderName(node: Extract<GvsNode, { node: "folder" }>, index: number): string {
  return node.name || `#${index}`;
}

export function nodeAt(root: GvsNode, path: readonly number[]): GvsNode | undefined {
  let node: GvsNode | undefined = root;
  for (const index of path) {
    if (!node || node.node !== "folder") return undefined;
    node = node.children[index];
  }
  return node;
}

/** Every folder (root first) with a readable `a/b/c` label. */
export function listFolders(root: GvsNode, rootLabel = "/"): FolderOption[] {
  const out: FolderOption[] = [];
  const walk = (node: GvsNode, path: number[], label: string) => {
    if (node.node !== "folder") return;
    out.push({ nodePath: path, label, childCount: node.children.length });
    node.children.forEach((child, index) => {
      if (child.node === "folder") {
        const name = folderName(child, index);
        walk(child, [...path, index], path.length ? `${label}/${name}` : name);
      }
    });
  };
  walk(root, [], rootLabel);
  return out;
}

/** Expand everything for small trees, only the first level for big ones. */
export function defaultExpanded(root: GvsNode, limit = 64): Set<string> {
  const folders = listFolders(root).filter((folder) => folder.nodePath.length > 0);
  if (folders.length <= limit) return new Set(folders.map((folder) => pathKey(folder.nodePath)));
  return new Set(folders.filter((folder) => folder.nodePath.length === 1).map((folder) => pathKey(folder.nodePath)));
}

/**
 * Rows for the structure list. Without a query or kind filter the tree is
 * shown with expansion; otherwise matching nodes are listed flat with full paths.
 */
export function flattenTree(
  root: GvsNode,
  members: readonly GvsMemberView[],
  expanded: ReadonlySet<string>,
  query: string,
  kind: GvsKind | "all",
): TreeRow[] {
  const rows: TreeRow[] = [];
  const filtering = query.trim() !== "" || kind !== "all";
  const walk = (node: GvsNode, path: number[], depth: number, label: string) => {
    if (node.node !== "folder") return;
    node.children.forEach((child, index) => {
      const childPath = [...path, index];
      const key = pathKey(childPath);
      if (child.node === "folder") {
        const name = folderName(child, index);
        const fullName = label ? `${label}/${name}` : name;
        const show = !filtering || (kind === "all" && matchesQuery(fullName, query));
        if (show) {
          rows.push({
            key,
            nodePath: childPath,
            depth: filtering ? 0 : depth,
            folder: true,
            name: filtering ? fullName : name,
            file: null,
            childCount: child.children.length,
            member: undefined,
          });
        }
        if (filtering || expanded.has(key)) walk(child, childPath, depth + 1, fullName);
        return;
      }
      const member = members[child.file];
      const memberPath = member?.path ?? `file #${child.file}`;
      if (filtering) {
        if (kind !== "all" && member?.kind !== kind) return;
        if (!matchesQuery(`${memberPath} ${member?.label ?? ""}`, query)) return;
      }
      rows.push({
        key,
        nodePath: childPath,
        depth: filtering ? 0 : depth,
        folder: false,
        name: filtering ? memberPath : baseName(memberPath),
        file: child.file,
        childCount: 0,
        member,
      });
    });
  };
  walk(root, [], 0, "");
  return rows;
}

/** Folder that new files go into for a selection (the item's parent, or root). */
export function targetFolder(root: GvsNode, nodePath: readonly number[] | undefined): number[] {
  if (!nodePath) return [];
  const node = nodeAt(root, nodePath);
  if (node?.node === "folder") return [...nodePath];
  return nodePath.slice(0, -1);
}
