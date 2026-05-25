import type { StageTreeNode } from "../components/StageHierarchyTree";

export function applyOutlinerOrder(
  children: readonly StageTreeNode[],
  outlinerOrder: readonly string[],
): StageTreeNode[] {
  if (outlinerOrder.length === 0) {
    return [...children];
  }

  const orderIndex = new Map(outlinerOrder.map((id, index) => [id, index]));
  return [...children].sort((left, right) => {
    const leftIndex = orderIndex.get(left.id);
    const rightIndex = orderIndex.get(right.id);
    if (leftIndex !== undefined && rightIndex !== undefined) {
      return leftIndex - rightIndex;
    }
    if (leftIndex !== undefined) return -1;
    if (rightIndex !== undefined) return 1;
    return left.label.localeCompare(right.label);
  });
}

export function mergeOutlinerOrder(
  currentOrder: readonly string[],
  nodeIds: readonly string[],
): string[] {
  const next = currentOrder.filter((id) => nodeIds.includes(id));
  for (const id of nodeIds) {
    if (!next.includes(id)) {
      next.push(id);
    }
  }
  return next;
}

export function reorderOutlinerIds(
  order: readonly string[],
  activeId: string,
  overId: string,
): string[] {
  if (activeId === overId) {
    return [...order];
  }

  const next = order.filter((id) => id !== activeId);
  const overIndex = next.indexOf(overId);
  if (overIndex === -1) {
    return [...order];
  }

  next.splice(overIndex, 0, activeId);
  return next;
}
