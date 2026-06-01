import { describe, expect, it } from "vitest";
import type { PlacementRow } from "../types/placement";
import {
  getRequestedSceneNodeIds,
  normalizePlacementObjectNumber,
  resolveNodeIdForPlacementIndex,
  resolveSelectionForSceneNode,
  resolveSubModelObjectIndex,
  resolveSubModelPlacementRef,
} from "./sceneEditorSelection";
import { formatPlacementViewportNodeId } from "./placementNodeId";

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

const subModels = [
  { folderName: "201stage201_obj_000", objectIndex: 0 },
  { folderName: "201stage201_obj_001", objectIndex: 1 },
];

describe("scene editor selection helpers", () => {
  it("resolves sub-model object index from manifest when stream chunk omits camelCase field", () => {
    const manifest = [
      { folderName: "box_a", objectIndex: 0 },
      { folderName: "box_b", objectIndex: 1 },
    ];
    expect(
      resolveSubModelObjectIndex("box_b", {}, manifest, 99),
    ).toBe(1);
    expect(
      resolveSubModelObjectIndex("box_b", { object_index: 3 }, manifest, 99),
    ).toBe(3);
    expect(
      resolveSubModelObjectIndex("missing", {}, manifest, 5),
    ).toBe(5);
  });

  it("resolves folder name from manifest order and bundle rootFolder for stream chunks", () => {
    const manifest = [
      { folderName: "201stage201_obj_000", objectIndex: 0 },
      { folderName: "201stage201_obj_001", objectIndex: 1 },
    ];
    expect(
      resolveSubModelPlacementRef(
        { object_index: 1 },
        manifest,
        1,
      ),
    ).toEqual({
      folderName: "201stage201_obj_001",
      objectIndex: 1,
    });
    expect(
      resolveSubModelPlacementRef(
        {
          objectIndex: 0,
          bundle: { rootFolder: "D:/stage/0/0/sky_model" },
        },
        manifest,
        99,
      ),
    ).toEqual({
      folderName: "sky_model",
      objectIndex: 0,
    });
  });

  it("normalizes missing placement object numbers to null", () => {
    expect(normalizePlacementObjectNumber(undefined)).toBeNull();
    expect(normalizePlacementObjectNumber(null)).toBeNull();
    expect(normalizePlacementObjectNumber(2)).toBe(2);
  });

  it("resolves viewport placement node ids to page selection and placement row state", () => {
    const rows = [placement("OBJECT", 0), placement("EFFECT", null)];
    const nodeId = formatPlacementViewportNodeId("201stage201_obj_000", 0);

    expect(resolveSelectionForSceneNode(nodeId, subModels, rows)).toEqual({
      selectedNodeId: nodeId,
      selectedPlacementIdx: 0,
    });
  });

  it("resolves effect node ids without falling back to global object ids", () => {
    const rows = [placement("OBJECT", 0), placement("EFFECT", null)];

    expect(resolveSelectionForSceneNode("__effect__1", subModels, rows)).toEqual({
      selectedNodeId: "__effect__1",
      selectedPlacementIdx: 1,
    });
  });

  it("maps placement row selection back to the exact outliner node id", () => {
    const rows = [placement("OBJECT", 1), placement("PROP", null)];

    expect(resolveNodeIdForPlacementIndex(0, rows, subModels)).toBe(
      formatPlacementViewportNodeId("201stage201_obj_001", 0),
    );
    expect(resolveNodeIdForPlacementIndex(1, rows, subModels)).toBe("__effect__1");
  });

  it("uses multi-selection from the outliner before the page primary selection for commands", () => {
    const nodeIds = getRequestedSceneNodeIds({
      explicitIds: undefined,
      storeSelectedIds: ["base", formatPlacementViewportNodeId("201stage201_obj_001", 0)],
      selectedNodeId: "__effect__1",
      selectedPlacementIdx: 1,
      nodeIdForPlacementIndex: (idx) => `__effect__${idx}`,
    });

    expect(nodeIds).toEqual(["base", formatPlacementViewportNodeId("201stage201_obj_001", 0)]);
  });
});
