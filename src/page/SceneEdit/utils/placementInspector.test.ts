import { describe, expect, it } from "vitest";
import type { PlacementRow } from "../types/placement";
import {
  formatPlacementFieldLabel,
  getPlacementDisplayName,
  summarizePlacementRow,
} from "./placementInspector";

const row: PlacementRow = {
  vdkType: "EFFECT",
  objectNumber: null,
  posX: 0,
  posY: 10,
  posZ: 0,
  rotX: 0,
  rotY: 90,
  rotZ: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  rawFields: [
    "VDK_TYPE",
    "EFFECT",
    "VDK_EFFECT_ID",
    "EFF_TEST",
    "VDK_PLACEMENT_NAME",
    "Spawn A",
  ],
};

describe("placementInspector", () => {
  it("formats VDK keys as readable labels", () => {
    expect(formatPlacementFieldLabel("VDK_EFFECT_ID")).toBe("Effect id");
    expect(formatPlacementFieldLabel("VDK_ATTACH_EFFECT_0_ID")).toBe("Attach Effect 0 Id");
  });

  it("reads placement display name from raw fields", () => {
    expect(getPlacementDisplayName(row)).toBe("Spawn A");
  });

  it("summarizes rows with custom names and object folders", () => {
    expect(summarizePlacementRow(row, 2, [])).toBe("Spawn A");
    expect(
      summarizePlacementRow(
        { ...row, vdkType: "OBJECT", objectNumber: 1, rawFields: ["VDK_TYPE", "OBJECT"] },
        0,
        [{ folderName: "building_a", objectIndex: 1 }],
      ),
    ).toBe("building_a");
  });
});
