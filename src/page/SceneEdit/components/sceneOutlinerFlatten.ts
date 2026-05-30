import type { OutlinerGroup } from "../store/sceneEditorStore";
import type { StageTreeNode } from "./StageHierarchyTree";

/** Fixed row height for Scene Outliner virtualization (py-[3px] + text-xs line). */
export const OUTLINER_ROW_HEIGHT = 24;

/** Horizontal indent per tree depth level. */
export const OUTLINER_INDENT_PX = 14;

export type OutlinerFlatRow =
  | { kind: "group-header"; group: OutlinerGroup; key: string }
  | { kind: "group-child"; node: StageTreeNode; depth: number; key: string }
  | {
      kind: "root";
      node: StageTreeNode;
      depth: number;
      hasChildren: boolean;
      key: string;
    }
  | {
      kind: "node";
      node: StageTreeNode;
      depth: number;
      hasChildren: boolean;
      key: string;
    };

function buildGroupedIdSet(groups: OutlinerGroup[]): Set<string> {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const childId of group.children) {
      ids.add(childId);
    }
  }
  return ids;
}

function findNode(root: StageTreeNode, id: string): StageTreeNode | null {
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function defaultExpanded(depth: number): boolean {
  return depth < 2;
}

function isNodeExpanded(
  nodeId: string,
  depth: number,
  expandedById: Record<string, boolean>,
): boolean {
  if (nodeId in expandedById) return expandedById[nodeId];
  return defaultExpanded(depth);
}

function visibleChildren(
  node: StageTreeNode,
  groupedIds: Set<string>,
): StageTreeNode[] {
  return (node.children ?? []).filter((child) => !groupedIds.has(child.id));
}

function appendTreeRows(
  node: StageTreeNode,
  depth: number,
  groupedIds: Set<string>,
  expandedById: Record<string, boolean>,
  out: OutlinerFlatRow[],
): void {
  const children = visibleChildren(node, groupedIds);
  const hasChildren = children.length > 0;

  if (node.id === "root") {
    out.push({ kind: "root", node, depth, hasChildren, key: "root" });
    if (isNodeExpanded(node.id, depth, expandedById) && hasChildren) {
      for (const child of children) {
        appendTreeRows(child, depth + 1, groupedIds, expandedById, out);
      }
    }
    return;
  }

  if (groupedIds.has(node.id)) return;

  out.push({ kind: "node", node, depth, hasChildren, key: node.id });
  if (isNodeExpanded(node.id, depth, expandedById) && hasChildren) {
    for (const child of children) {
      appendTreeRows(child, depth + 1, groupedIds, expandedById, out);
    }
  }
}

/** Depth-first flat list of visible outliner rows (groups + expanded tree). */
export function flattenSceneOutliner(params: {
  root: StageTreeNode;
  groups: OutlinerGroup[];
  expandedById: Record<string, boolean>;
}): OutlinerFlatRow[] {
  const { root, groups, expandedById } = params;
  const groupedIds = buildGroupedIdSet(groups);
  const out: OutlinerFlatRow[] = [];

  for (const group of groups) {
    out.push({ kind: "group-header", group, key: `group:${group.id}` });
    if (!group.collapsed) {
      for (const childId of group.children) {
        const child = findNode(root, childId);
        if (child) {
          out.push({
            kind: "group-child",
            node: child,
            depth: 1,
            key: `group-child:${child.id}`,
          });
        }
      }
    }
  }

  appendTreeRows(root, 0, groupedIds, expandedById, out);
  return out;
}
