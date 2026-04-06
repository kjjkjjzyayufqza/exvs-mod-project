import type { TestTreeNode } from "../types";

export type FileTreeSortBy = "name" | "dateModified" | "type" | "size";

export type FileTreeSortDirection = "asc" | "desc";

/** When not `none`, overrides the primary sort column (Explorer-style grouping). */
export type FileTreeGroupBy = "none" | "type" | "dateModified";

export type FileTreeViewOptions = {
  sortBy: FileTreeSortBy;
  direction: FileTreeSortDirection;
  groupBy: FileTreeGroupBy;
  /** When true, directories are listed before files at each level. */
  foldersOnTop: boolean;
};

export const DEFAULT_FILE_TREE_VIEW_OPTIONS: FileTreeViewOptions = {
  sortBy: "name",
  direction: "asc",
  groupBy: "none",
  foldersOnTop: true,
};

export function effectiveSortKey(opts: FileTreeViewOptions): FileTreeSortBy {
  if (opts.groupBy === "type") return "type";
  if (opts.groupBy === "dateModified") return "dateModified";
  return opts.sortBy;
}

function fileExtensionLower(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

function compareName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareNodes(
  a: TestTreeNode,
  b: TestTreeNode,
  key: FileTreeSortBy,
  direction: FileTreeSortDirection,
  foldersOnTop: boolean
): number {
  const sign = direction === "asc" ? 1 : -1;

  if (foldersOnTop && a.isDir !== b.isDir) {
    return a.isDir ? -1 : 1;
  }

  const tieName = () => sign * compareName(a.name, b.name);

  switch (key) {
    case "name":
      return tieName();
    case "dateModified": {
      const ta = a.mtimeMs ?? 0;
      const tb = b.mtimeMs ?? 0;
      if (ta === tb) return tieName();
      return sign * (ta - tb);
    }
    case "type": {
      const da = a.isDir ? "\0" : fileExtensionLower(a.name);
      const db = b.isDir ? "\0" : fileExtensionLower(b.name);
      const c = compareName(da, db);
      if (c !== 0) return sign * c;
      return tieName();
    }
    case "size": {
      const sa = a.isDir ? 0 : a.size ?? 0;
      const sb = b.isDir ? 0 : b.size ?? 0;
      if (sa === sb) return tieName();
      return sign * (sa - sb);
    }
    default:
      return tieName();
  }
}

/**
 * Recursively sorts sibling lists. Does not mutate the input tree.
 */
export function applyFileTreeViewSort(nodes: TestTreeNode[], opts: FileTreeViewOptions): TestTreeNode[] {
  if (nodes.length === 0) return nodes;
  const key = effectiveSortKey(opts);
  const sorted = [...nodes].sort((a, b) => compareNodes(a, b, key, opts.direction, opts.foldersOnTop));
  return sorted.map((n) => {
    const kids = n.children;
    if (!kids?.length) return n;
    return { ...n, children: applyFileTreeViewSort(kids, opts) };
  });
}
