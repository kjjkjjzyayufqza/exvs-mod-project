import type { StageTreeNode } from "../components/StageHierarchyTree";
import type { PlacementRow } from "../types/placement";
import { formatPlacementViewportNodeId } from "./placementNodeId";

export function buildSubModelOutlinerNode(
  subModelNode: StageTreeNode,
  placementEntries: readonly PlacementRow[],
): StageTreeNode {
  if (subModelNode.objectIndex == null) {
    return subModelNode;
  }

  const instances = placementEntries
    .map((entry, idx) => ({ entry, idx }))
    .filter(
      ({ entry }) =>
        entry.vdkType.toUpperCase() === "OBJECT" &&
        entry.objectNumber === subModelNode.objectIndex,
    );

  if (instances.length === 0) {
    return subModelNode;
  }

  return {
    ...subModelNode,
    children: instances.map(({ idx }, instanceIndex) => ({
      id: formatPlacementViewportNodeId(subModelNode.id, idx),
      label: `(${instanceIndex + 1})`,
      role: "placement" as const,
      objectIndex: subModelNode.objectIndex,
    })),
  };
}
