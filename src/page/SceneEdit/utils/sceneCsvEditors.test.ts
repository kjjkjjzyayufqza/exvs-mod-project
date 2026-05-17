import { describe, expect, test } from "vitest";
import {
  addGraphicParam,
  applyGraphicParamSelection,
  deleteGraphicParamAt,
  replacePlacementRawField,
  updateGraphicParamValue,
} from "./sceneCsvEditors";
import type { GraphicParam } from "../components/GraphicParamPanel";
import type { PlacementRow } from "../components/PlacementPanel";

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
