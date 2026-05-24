import { describe, expect, it } from "vitest";
import type { PlacementRow } from "../types/placement";
import {
  groupPlacementFields,
  listCatalogKeysNotInRow,
  listPlacementFields,
  suggestFieldDefault,
} from "./placementFieldModel";

const sampleRow: PlacementRow = {
  vdkType: "OBJECT",
  objectNumber: 3,
  posX: 1,
  posY: 2,
  posZ: 3,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  rawFields: [
    "VDK_TYPE",
    "OBJECT",
    "VDK_OBJECTNUMBER",
    "3",
    "VDK_POSITION_X",
    "1",
    "VDK_CUSTOM_FLAG",
    "TRUE",
  ],
};

describe("placementFieldModel", () => {
  it("lists kv fields with editable keys", () => {
    const fields = listPlacementFields(sampleRow, []);
    expect(fields.some((field) => field.key === "VDK_CUSTOM_FLAG" && !field.known)).toBe(true);
    expect(fields.every((field) => field.editableKey)).toBe(true);
  });

  it("groups fields by category", () => {
    const groups = groupPlacementFields(listPlacementFields(sampleRow, []));
    expect(groups.some((group) => group.category === "identity")).toBe(true);
    expect(groups.some((group) => group.category === "other")).toBe(true);
  });

  it("suggests defaults from catalog metadata", () => {
    expect(suggestFieldDefault("VDK_INITIAL_SPAWN")).toBe("TRUE");
    expect(suggestFieldDefault("VDK_PROP_LIFE_MAX")).toBeTruthy();
  });

  it("lists catalog keys missing from a row", () => {
    const missing = listCatalogKeysNotInRow(sampleRow, []);
    expect(missing).toContain("VDK_EFFECT_ID");
    expect(missing).not.toContain("VDK_OBJECTNUMBER");
  });

  it("reads header format rows as column values", () => {
    const header = ["VDK_TYPE", "VDK_OBJECTNUMBER", "VDK_POSITION_X"];
    const row: PlacementRow = {
      ...sampleRow,
      rawFields: ["OBJECT", "3", "9"],
    };
    const fields = listPlacementFields(row, header);
    expect(fields).toHaveLength(3);
    expect(fields[2].value).toBe("9");
    expect(fields[2].editableKey).toBe(false);
  });
});
