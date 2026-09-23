import { describe, expect, test } from "vitest";
import {
  defaultAppliedSunKeys,
  deriveSceneLightingFromGraphicParams,
} from "./graphicParamSceneLighting";

describe("deriveSceneLightingFromGraphicParams", () => {
  test("uses the engine sun when a stage has no directional keys", () => {
    const lighting = deriveSceneLightingFromGraphicParams([]);
    expect(lighting.usesGraphicParamLighting).toBe(false);
    expect(lighting.primaryPosition[1]).toBeGreaterThan(40);
    expect(lighting.shadowFar).toBe(2500);
  });

  test("keeps sampled stage suns above the horizon", () => {
    const samples = [
      [-45, 45, 0],
      [-50, 153, 0],
      [-40, 142, 0],
      [-51.813, -66.936, 3.971],
    ];
    for (const [rotX, rotY, rotZ] of samples) {
      const lighting = deriveSceneLightingFromGraphicParams([
        { key: "directional_lighting_rot_x", value: String(rotX) },
        { key: "directional_lighting_rot_y", value: String(rotY) },
        { key: "directional_lighting_rot_z", value: String(rotZ) },
      ]);
      expect(lighting.primaryPosition[1]).toBeGreaterThan(20);
    }
  });

  test("scales a brighter game intensity above the 3.14 reference", () => {
    const reference = deriveSceneLightingFromGraphicParams([
      { key: "directional_lighting_intensity", value: "3.14" },
    ]);
    const bright = deriveSceneLightingFromGraphicParams([
      { key: "directional_lighting_intensity", value: "5.5" },
    ]);
    expect(bright.directionalIntensity).toBeGreaterThan(reference.directionalIntensity);
  });

  test("reads shadow far and shadow color from the stage", () => {
    const lighting = deriveSceneLightingFromGraphicParams([
      { key: "shadow_culling_far", value: "1800" },
      { key: "shadowing_color_r", value: "0.12" },
      { key: "shadowing_color_g", value: "0.1" },
      { key: "shadowing_color_b", value: "0.11" },
    ]);
    expect(lighting.shadowFar).toBe(1800);
    expect(lighting.shadowColor[0]).toBeCloseTo(0.12);
  });
});

describe("defaultAppliedSunKeys", () => {
  test("selects the sun and leaves unrelated rows unchecked", () => {
    const keys = defaultAppliedSunKeys([
      { key: "directional_lighting_intensity", value: "5.5" },
      { key: "ibl_lighting_intensity", value: "1" },
      { key: "pfx_bloom_enable", value: "1" },
    ]);
    expect([...keys]).toEqual([
      "directional_lighting_intensity",
      "ibl_lighting_intensity",
    ]);
  });
});
