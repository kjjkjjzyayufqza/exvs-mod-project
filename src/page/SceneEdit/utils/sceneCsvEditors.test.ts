import { describe, expect, test } from "vitest";
import {
  addGraphicParam,
  applyGraphicParamSelection,
  createPlacementRowForType,
  deleteGraphicParamAt,
  replacePlacementRawField,
  updateGraphicParamValue,
} from "./sceneCsvEditors";
import { syncParsedFieldsFromRaw } from "./patchPlacementRawFields";
import type { GraphicParam } from "../components/GraphicParamPanel";
import type { PlacementRow } from "../types/placement";

describe("scene CSV editor helpers", () => {
  test("applies only selected graphic_param rows", () => {
    const rows: GraphicParam[] = [
      { key: "directional_lighting_intensity", value: "5.5" },
      { key: "pfx_bloom_enable", value: "1" },
    ];

    expect(applyGraphicParamSelection(rows, new Set(["pfx_bloom_enable"]))).toEqual([
      { key: "pfx_bloom_enable", value: "1" },
    ]);
  });

  test("adds, updates, and deletes graphic_param rows without mutating the original list", () => {
    const rows: GraphicParam[] = [{ key: "fog_alpha_boost", value: "0.56" }];
    const added = addGraphicParam(rows, "fog_rgb_boost", "1.5");
    const updated = updateGraphicParamValue(added, 0, "0.75");
    const deleted = deleteGraphicParamAt(updated, 1);

    expect(rows).toEqual([{ key: "fog_alpha_boost", value: "0.56" }]);
    expect(deleted).toEqual([{ key: "fog_alpha_boost", value: "0.75" }]);
  });

  test("replaces repeated placement key-value fields by occurrence", () => {
    const row: PlacementRow = {
      vdkType: "OBJECT",
      objectNumber: 6,
      posX: 0,
      posY: 0,
      posZ: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      rawFields: [
        "VDK_TYPE",
        "OBJECT",
        "VDK_SUBSTITUTE_PLACEMENT",
        "37",
        "VDK_SUBSTITUTE_PLACEMENT",
        "41",
      ],
    };

    expect(replacePlacementRawField(row, 4, "42").rawFields).toEqual([
      "VDK_TYPE",
      "OBJECT",
      "VDK_SUBSTITUTE_PLACEMENT",
      "37",
      "VDK_SUBSTITUTE_PLACEMENT",
      "42",
    ]);
  });
});

describe("createPlacementRowForType", () => {
  test("creates an OBJECT row with transform and objectNumber fields", () => {
    const row = createPlacementRowForType("OBJECT");
    expect(row.vdkType).toBe("OBJECT");
    expect(row.objectNumber).toBeNull();
    expect(row.posX).toBe(0);
    expect(row.scaleX).toBe(1);
    expect(row.rawFields).toContain("VDK_TYPE");
    expect(row.rawFields).toContain("OBJECT");
    expect(row.rawFields).toContain("VDK_OBJECTNUMBER");
  });

  test("creates an EFFECT row without objectNumber field", () => {
    const row = createPlacementRowForType("EFFECT");
    expect(row.vdkType).toBe("EFFECT");
    expect(row.objectNumber).toBeNull();
    expect(row.rawFields).toContain("EFFECT");
    expect(row.rawFields).not.toContain("VDK_OBJECTNUMBER");
  });

  test("creates a SKY row without objectNumber field", () => {
    const row = createPlacementRowForType("SKY");
    expect(row.vdkType).toBe("SKY");
    expect(row.rawFields).toContain("SKY");
    expect(row.rawFields).not.toContain("VDK_OBJECTNUMBER");
  });

  test("defaults to OBJECT for unknown type", () => {
    const row = createPlacementRowForType("UNKNOWN");
    expect(row.vdkType).toBe("UNKNOWN");
    expect(row.rawFields[1]).toBe("UNKNOWN");
  });
});

describe("syncParsedFieldsFromRaw", () => {
  test("syncs objectNumber when VDK_OBJECTNUMBER rawField is edited", () => {
    const row = createPlacementRowForType("OBJECT");
    expect(row.objectNumber).toBeNull();

    const rawFields = [...row.rawFields];
    const objNumIdx = rawFields.indexOf("VDK_OBJECTNUMBER");
    rawFields[objNumIdx + 1] = "0";

    const synced = syncParsedFieldsFromRaw({ ...row, rawFields });
    expect(synced.objectNumber).toBe(0);
  });

  test("syncs vdkType when VDK_TYPE rawField is edited", () => {
    const row = createPlacementRowForType("OBJECT");
    const rawFields = [...row.rawFields];
    rawFields[1] = "EFFECT";

    const synced = syncParsedFieldsFromRaw({ ...row, rawFields });
    expect(synced.vdkType).toBe("EFFECT");
  });

  test("syncs transform fields from rawFields", () => {
    const row = createPlacementRowForType("OBJECT");
    const rawFields = [...row.rawFields];
    const posXIdx = rawFields.indexOf("VDK_POSITION_X");
    rawFields[posXIdx + 1] = "42.5";

    const synced = syncParsedFieldsFromRaw({ ...row, rawFields });
    expect(synced.posX).toBe(42.5);
  });
});
