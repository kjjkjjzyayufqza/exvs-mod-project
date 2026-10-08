import type { TestTreeNode } from "../types";
import { applyFileTreeViewSort, type FileTreeViewOptions } from "./fileTreeViewSort";
import { normalizePathForStar, sortTreeByStarOrder } from "./fileTreeStars";
import { filterTree } from "./testEditorTreeOps";

/**
 * View-sort, then search, then pin starred siblings to the front of each
 * folder. Starred paths stay in their own parent; they are not hoisted to
 * the tree root, and a query that misses their name does not drop them.
 */
export function visibleFileTreeNodes(
  nodes: TestTreeNode[],
  term: string,
  viewOptions: FileTreeViewOptions,
  starOrder: string[],
): TestTreeNode[] {
  const starred = new Set(starOrder.map((path) => normalizePathForStar(path)));
  const filtered = filterTree(nodes, term, (node) => starred.has(normalizePathForStar(node.path)));
  return sortTreeByStarOrder(applyFileTreeViewSort(filtered, viewOptions), starOrder);
}
