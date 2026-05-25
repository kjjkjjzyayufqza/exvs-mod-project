import { describe, expect, it } from "vitest";

import type { StageTreeNode } from "../components/StageHierarchyTree";
import type { PlacementRow } from "../types/placement";
import { formatPlacementViewportNodeId } from "./placementNodeId";
import { buildSubModelOutlinerNode } from "./sceneOutlinerTree";

function placement(type: string, objectNumber: number | null): PlacementRow {
  return {
    vdkType: type,
    objectNumber,
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    rawFields: [],
  };
}

function subModelNode(id: string, objectIndex: number): StageTreeNode {
  return { id, label: id, role: "sub_model", objectIndex };
}

describe("buildSubModelOutlinerNode", () => {
  const folderName = "001stage001_object_box01";

  it("returns the sub_model leaf when there are no OBJECT placement instances", () => {
    const node = subModelNode(folderName, 3);
    const rows = [placement("EFFECT", null), placement("OBJECT", 99)];

    expect(buildSubModelOutlinerNode(node, rows)).toEqual(node);
  });

  it("nests OBJECT placement instances under the sub_model parent", () => {
    const node = subModelNode(folderName, 3);
    const rows = [
      placement("OBJECT", 3),
      placement("OBJECT", 3),
      placement("OBJECT", 99),
      placement("OBJECT", 3),
    ];

    const result = buildSubModelOutlinerNode(node, rows);

    expect(result.id).toBe(folderName);
    expect(result.role).toBe("sub_model");
    expect(result.objectIndex).toBe(3);
    expect(result.children?.map((child) => child.id)).toEqual([
      formatPlacementViewportNodeId(folderName, 0),
      formatPlacementViewportNodeId(folderName, 1),
      formatPlacementViewportNodeId(folderName, 3),
    ]);
    expect(result.children?.map((child) => child.label)).toEqual(["(1)", "(2)", "(3)"]);
    expect(result.children?.every((child) => child.role === "placement")).toBe(true);
  });

  it("keeps a single OBJECT placement instance as a nested child", () => {
    const node = subModelNode(folderName, 1);
    const rows = [placement("EFFECT", null), placement("OBJECT", 1)];

    const result = buildSubModelOutlinerNode(node, rows);

    expect(result.children).toEqual([
      {
        id: formatPlacementViewportNodeId(folderName, 1),
        label: "(1)",
        role: "placement",
        objectIndex: 1,
      },
    ]);
  });
});
