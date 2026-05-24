import { describe, expect, it } from "vitest";
import type { PlacementRow } from "../types/placement";
import { patchPlacementRawFieldsForNumericField } from "./patchPlacementRawFields";

const baseRow: PlacementRow = {
  vdkType: "OBJECT",
  objectNumber: null,
  posX: 0,
  posY: 0,
  posZ: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  rawFields: ["VDK_TYPE", "OBJECT"],
};

describe("patchPlacementRawFieldsForNumericField", () => {
  it("inserts missing kv transform fields when editing", () => {
    const next = patchPlacementRawFieldsForNumericField(baseRow, "scaleX", 2.5, {});
    expect(next.rawFields).toEqual(["VDK_TYPE", "OBJECT", "VDK_SCALE_X", "2.5"]);
    expect(next.scaleX).toBe(2.5);
  });

  it("updates existing kv transform fields", () => {
    const row = {
      ...baseRow,
      rawFields: ["VDK_TYPE", "OBJECT", "VDK_POSITION_X", "1"],
    };
    const next = patchPlacementRawFieldsForNumericField(row, "posX", 9, {});
    expect(next.rawFields).toEqual(["VDK_TYPE", "OBJECT", "VDK_POSITION_X", "9"]);
    expect(next.posX).toBe(9);
  });
});
