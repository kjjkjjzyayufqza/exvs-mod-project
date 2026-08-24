export type NutexbScanFile = {
  relativePath: string;
  path: string;
  size: number;
};

export type NutexbFolderScan = {
  root: string;
  files: NutexbScanFile[];
};

export type NutexbTreeNode = {
  id: string;
  name: string;
  kind: "folder" | "file";
  relativePath: string;
  path: string | null;
  size: number | null;
  fileCount: number;
  children: NutexbTreeNode[];
};

export type FlattenedNutexbTreeRow = {
  node: NutexbTreeNode;
  depth: number;
};

function splitRelative(relativePath: string): string[] {
  return relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
}

export function buildNutexbTree(rootName: string, files: readonly NutexbScanFile[]): NutexbTreeNode {
  const root: NutexbTreeNode = {
    id: "",
    name: rootName || "nutexb",
    kind: "folder",
    relativePath: "",
    path: null,
    size: null,
    fileCount: 0,
    children: [],
  };
  const folders = new Map<string, NutexbTreeNode>();
  folders.set("", root);

  const ensureFolder = (relativePath: string): NutexbTreeNode => {
    const existing = folders.get(relativePath);
    if (existing) return existing;
    const parts = splitRelative(relativePath);
    const name = parts[parts.length - 1] ?? relativePath;
    const parentPath = parts.slice(0, -1).join("/");
    const parent = ensureFolder(parentPath);
    const folder: NutexbTreeNode = {
      id: relativePath,
      name,
      kind: "folder",
      relativePath,
      path: null,
      size: null,
      fileCount: 0,
      children: [],
    };
    parent.children.push(folder);
    folders.set(relativePath, folder);
    return folder;
  };

  for (const file of files) {
    const parts = splitRelative(file.relativePath);
    const name = parts[parts.length - 1] ?? file.relativePath;
    const parentPath = parts.slice(0, -1).join("/");
    const parent = ensureFolder(parentPath);
    parent.children.push({
      id: file.relativePath,
      name,
      kind: "file",
      relativePath: file.relativePath,
      path: file.path,
      size: file.size,
      fileCount: 1,
      children: [],
    });
  }

  const sortNode = (node: NutexbTreeNode) => {
    node.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    });
    for (const child of node.children) sortNode(child);
  };
  const assignCounts = (node: NutexbTreeNode): number => {
    if (node.kind === "file") {
      node.fileCount = 1;
      return 1;
    }
    let total = 0;
    for (const child of node.children) total += assignCounts(child);
    node.fileCount = total;
    return total;
  };
  sortNode(root);
  assignCounts(root);
  return root;
}

export function collectNutexbFilesUnder(node: NutexbTreeNode): NutexbTreeNode[] {
  const files: NutexbTreeNode[] = [];
  const visit = (current: NutexbTreeNode) => {
    if (current.kind === "file") files.push(current);
    for (const child of current.children) visit(child);
  };
  visit(node);
  return files;
}

export function flattenNutexbTree(
  root: NutexbTreeNode,
  collapsedFolderIds: ReadonlySet<string>,
  searchText: string,
): FlattenedNutexbTreeRow[] {
  const query = searchText.trim().toLowerCase();

  const nodeMatches = (node: NutexbTreeNode): boolean => {
    if (!query) return true;
    return (
      node.name.toLowerCase().includes(query) ||
      node.relativePath.toLowerCase().includes(query)
    );
  };

  const collect = (node: NutexbTreeNode, depth: number): FlattenedNutexbTreeRow[] | null => {
    const nested: FlattenedNutexbTreeRow[][] = [];
    let childIncluded = false;
    for (const child of node.children) {
      const childRows = collect(child, depth + 1);
      if (childRows) {
        childIncluded = true;
        nested.push(childRows);
      }
    }
    const includeSelf = nodeMatches(node) || childIncluded;
    if (!includeSelf) return null;
    const next: FlattenedNutexbTreeRow[] = [{ node, depth }];
    const collapsed = !query && collapsedFolderIds.has(node.id);
    if (node.kind === "folder" && !collapsed) {
      for (const childRows of nested) next.push(...childRows);
    }
    return next;
  };

  return collect(root, 0) ?? [];
}

export function findNutexbTreeNode(root: NutexbTreeNode, id: string): NutexbTreeNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNutexbTreeNode(child, id);
    if (found) return found;
  }
  return null;
}

export function collectNutexbFolderIds(node: NutexbTreeNode): string[] {
  const ids: string[] = [];
  const visit = (current: NutexbTreeNode) => {
    if (current.kind === "folder") ids.push(current.id);
    for (const child of current.children) visit(child);
  };
  visit(node);
  return ids;
}

export function visibleNutexbFiles(
  tree: NutexbTreeNode,
  selectedId: string | null,
  searchText: string,
): NutexbTreeNode[] {
  const query = searchText.trim().toLowerCase();
  if (query) {
    return collectNutexbFilesUnder(tree).filter(
      (file) =>
        file.name.toLowerCase().includes(query) ||
        file.relativePath.toLowerCase().includes(query),
    );
  }
  const scope =
    selectedId != null ? findNutexbTreeNode(tree, selectedId) ?? tree : tree;
  return collectNutexbFilesUnder(scope);
}
