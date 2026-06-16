import { normalizePackFolderName } from "./packName";
import type { FolderChangePayload, TestTreeNode } from "../types";

type RawTreeNode = Partial<TestTreeNode> & {
  id: string;
  name: string;
  path: string;
  isDir?: boolean;
  is_dir?: boolean;
  mtimeMs?: number;
  mtime_ms?: number;
  size?: number;
  children?: RawTreeNode[];
};

export function normalizeNode(node: RawTreeNode): TestTreeNode {
  const isDir = node.isDir ?? node.is_dir ?? false;
  const children = node.children?.map(normalizeNode);
  const mtimeRaw = node.mtimeMs ?? node.mtime_ms;
  const mtimeMs = typeof mtimeRaw === "number" && Number.isFinite(mtimeRaw) ? mtimeRaw : undefined;
  const sizeRaw = node.size;
  const size =
    typeof sizeRaw === "number" && Number.isFinite(sizeRaw) && sizeRaw >= 0 ? sizeRaw : undefined;
  return {
    id: node.id,
    name: node.name,
    path: node.path,
    isDir,
    mtimeMs,
    size,
    children: isDir ? children ?? [] : undefined,
  };
}

export function normalizeTree(nodes: RawTreeNode[] = []): TestTreeNode[] {
  return nodes.map(normalizeNode);
}

export function findNode(nodes: TestTreeNode[], id: string | null): TestTreeNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const child = findNode(node.children, id);
      if (child) return child;
    }
  }
  return null;
}

export function normalizePathForTreeMatch(input: string): string {
  return input
    .trim()
    .replace(/^\\\\\?\\/, "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function findTreeNodeByPath(
  nodes: TestTreeNode[],
  targetPath: string,
  rootDir?: string,
): TestTreeNode | null {
  const normalizedTarget = normalizePathForTreeMatch(targetPath);
  if (!normalizedTarget) return null;

  const walk = (items: TestTreeNode[]): TestTreeNode | null => {
    for (const node of items) {
      if (!node.isDir) continue;
      if (normalizePathForTreeMatch(node.path) === normalizedTarget) return node;
      if (node.children?.length) {
        const found = walk(node.children);
        if (found) return found;
      }
    }
    return null;
  };

  const direct = walk(nodes);
  if (direct) return direct;

  if (!rootDir) return null;
  const normalizedRoot = normalizePathForTreeMatch(rootDir);
  if (!normalizedTarget.startsWith(`${normalizedRoot}/`) && normalizedTarget !== normalizedRoot) {
    return null;
  }

  const folderName = targetPath.replace(/[\\/]+$/, "").split(/[/\\]/).pop();
  if (!folderName) return null;
  const normalizedFolder = folderName.toLowerCase();

  const walkByName = (items: TestTreeNode[]): TestTreeNode | null => {
    for (const node of items) {
      if (!node.isDir) continue;
      if (node.name.toLowerCase() !== normalizedFolder) {
        if (node.children?.length) {
          const found = walkByName(node.children);
          if (found) return found;
        }
        continue;
      }
      const normalizedNodePath = normalizePathForTreeMatch(node.path);
      if (normalizedNodePath.startsWith(normalizedRoot)) return node;
      if (node.children?.length) {
        const found = walkByName(node.children);
        if (found) return found;
      }
    }
    return null;
  };

  return walkByName(nodes);
}

function removeNode(nodes: TestTreeNode[], targetId: string): TestTreeNode[] {
  let changed = false;
  const filtered = nodes
    .map((node) => {
      if (node.id === targetId) {
        changed = true;
        return null;
      }
      if (node.children) {
        const nextChildren = removeNode(node.children, targetId);
        if (nextChildren !== node.children) {
          changed = true;
          return { ...node, children: nextChildren };
        }
      }
      return node;
    })
    .filter(Boolean) as TestTreeNode[];
  return changed ? filtered : nodes;
}

function upsertNode(nodes: TestTreeNode[], incoming: TestTreeNode, parentId?: string): TestTreeNode[] {
  if (!parentId) {
    const existingIndex = nodes.findIndex((n) => n.id === incoming.id);
    if (existingIndex >= 0) {
      const next = [...nodes];
      next[existingIndex] = incoming;
      return next;
    }
    return [...nodes, incoming];
  }

  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id === parentId) {
      const children = node.children ? [...node.children] : [];
      const idx = children.findIndex((c) => c.id === incoming.id);
      if (idx >= 0) {
        children[idx] = incoming;
      } else {
        children.push(incoming);
      }
      changed = true;
      return { ...node, children };
    }
    if (node.children) {
      const nextChildren = upsertNode(node.children, incoming, parentId);
      if (nextChildren !== node.children) {
        changed = true;
        return { ...node, children: nextChildren };
      }
    }
    return node;
  });

  return changed ? nextNodes : nodes;
}

export function applyPayload(current: TestTreeNode[], payload?: FolderChangePayload): TestTreeNode[] {
  if (!payload) return current;
  if (payload.fullTree) return normalizeTree(payload.fullTree);
  if (!payload.ops) return current;

  return payload.ops.reduce((acc, op) => {
    if (op.type === "remove") {
      return removeNode(acc, op.node.id);
    }
    return upsertNode(acc, normalizeNode(op.node), op.parentId);
  }, current);
}

/** Applies a batch of watcher payloads in order (same contract as the Test Editor folder-change queue flush). */
export function applyPayloadQueue(current: TestTreeNode[], queued: FolderChangePayload[]): TestTreeNode[] {
  return queued.reduce((acc, payload) => applyPayload(acc, payload), current);
}

export function filterTree(nodes: TestTreeNode[], term: string): TestTreeNode[] {
  if (!term) return nodes;
  const lower = term.toLowerCase();

  const walk = (items: TestTreeNode[], includeAll: boolean): TestTreeNode[] => {
    const next: TestTreeNode[] = [];
    for (const item of items) {
      const nameHit = item.name.toLowerCase().includes(lower);
      const childHits = item.children ? walk(item.children, includeAll || nameHit) : [];
      const hasChildHits = childHits.length > 0;
      if (nameHit || hasChildHits) {
        const children = nameHit ? item.children ?? [] : childHits;
        next.push({ ...item, children, isLeaf: !item.isDir });
      }
    }
    return next;
  };

  return walk(nodes, false);
}

function normalizeSlashes(input: string): string {
  return input.replace(/\\/g, "/");
}

export function getTopLevelFolderName(
  nodePath: string,
  rootPath: string,
  isDir?: boolean,
): string | null {
  if (!nodePath || !rootPath) return null;
  const normalizedRoot = normalizeSlashes(rootPath).replace(/\/+$/, "");
  const normalizedNode = normalizeSlashes(nodePath);
  if (!normalizedNode.startsWith(normalizedRoot)) return null;
  const relative = normalizedNode.slice(normalizedRoot.length).replace(/^\/+/, "");
  if (!relative) return null;
  const segments = relative.split("/");
  if (segments.length === 1 && !relative.includes("/")) {
    return isDir === false ? null : segments[0];
  }
  return segments[0] ?? null;
}

export function getDirtyFolderNameFromPath(
  nodePath: string,
  rootPath: string,
  isDir?: boolean,
): string | null {
  const topLevel = getTopLevelFolderName(nodePath, rootPath, isDir);
  if (topLevel) return normalizePackFolderName(topLevel);

  if (isDir === false && nodePath && rootPath) {
    const normalizedRoot = normalizeSlashes(rootPath).replace(/\/+$/, "");
    const normalizedNode = normalizeSlashes(nodePath);
    if (!normalizedNode.startsWith(normalizedRoot)) return null;
    const relative = normalizedNode.slice(normalizedRoot.length).replace(/^\/+/, "");
    if (!relative || relative.includes("/")) return null;
    const lower = relative.toLowerCase();
    const suffix = "_structure.json";
    if (!lower.endsWith(suffix)) return null;
    const base = relative.slice(0, -suffix.length);
    if (!base) return null;
    return normalizePackFolderName(base);
  }

  return null;
}

export type { RawTreeNode };
