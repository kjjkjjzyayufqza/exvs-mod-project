import { describe, expect, it } from "vitest";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import {
  countHavokCollisionTriangles,
  DEFAULT_HKT_SIMPLIFY,
  HIGH_PRECISION_HKT_SIMPLIFY,
  HKT_HULL_PRESET_FACES,
  HKT_SAFE_TARGET_TRIANGLES,
  hktHullConfigFromPreset,
  hktSimplifyConfigFromPreset,
  normalizeHktSimplifyConfig,
  reductionPercent,
  serializeHktPreviewConfigKey,
} from "./hktSimplifyUtils";
import type { ImportConfig } from "./sceneSessionService";

describe("hktSimplifyUtils", () => {
  it("counts triangle and quad primitives from Havok mesh data", () => {
    const mesh: HavokMeshData = {
      vertices: [],
      quads: [
        [0, 1, 2, 3],
        [4, 5, 6, 6],
      ],
      aabb: { min: [0, 0, 0], max: [1, 1, 1] },
      bodies: [],
    };
    expect(countHavokCollisionTriangles(mesh)).toBe(3);
  });

  it("maps preset values for none, medium, high, and heavy", () => {
    expect(hktSimplifyConfigFromPreset("none").enabled).toBe(false);
    expect(hktSimplifyConfigFromPreset("medium").enabled).toBe(true);
    expect(hktSimplifyConfigFromPreset("medium").quadMergeEnabled).toBe(true);
    expect(hktSimplifyConfigFromPreset("medium").planarityAngleDeg).toBe(15);
    expect(hktSimplifyConfigFromPreset("high").planarityAngleDeg).toBe(15);
    expect(hktSimplifyConfigFromPreset("high").targetTriangleRatio).toBeNull();
    expect(hktSimplifyConfigFromPreset("high").maxTargetTriangles).toBe(
      HKT_SAFE_TARGET_TRIANGLES,
    );
    expect(hktSimplifyConfigFromPreset("heavy").planarityAngleDeg).toBe(45);
    expect(hktSimplifyConfigFromPreset("heavy").weldEpsilon).toBe(0.01);
    expect(hktSimplifyConfigFromPreset("heavy").targetTriangleRatio).toBe(0.05);
    expect(hktSimplifyConfigFromPreset("heavy").maxTargetTriangles).toBe(
      HKT_SAFE_TARGET_TRIANGLES,
    );
  });

  it("defaults to medium preset with simplification enabled", () => {
    expect(DEFAULT_HKT_SIMPLIFY.preset).toBe("medium");
    expect(DEFAULT_HKT_SIMPLIFY.enabled).toBe(true);
  });

  it("exposes high precision as the current-builder 32k shape-preserving preset", () => {
    expect(HIGH_PRECISION_HKT_SIMPLIFY).toEqual(hktSimplifyConfigFromPreset("high"));
    expect(HIGH_PRECISION_HKT_SIMPLIFY.strategy).toBe("shapePreserving");
    expect(HIGH_PRECISION_HKT_SIMPLIFY.maxTargetTriangles).toBe(HKT_SAFE_TARGET_TRIANGLES);
  });

  it("computes reduction percentage from merged and simplified counts", () => {
    expect(reductionPercent(100, 25)).toBe(75);
    expect(reductionPercent(0, 0)).toBeNull();
  });

  it("serializes HKT preview config by value, not object identity", () => {
    const ssbhA = {
      baseFilename: "model",
      scaleFactor: 1,
      upAxis: "y_up",
      writeNumdlb: true,
      writeNumshb: true,
      writeNusktb: true,
      writeNumatb: true,
      writeJnttbl: false,
      writeMayaProfile: true,
      materialTemplate: null,
    };
    const importConfigA: Pick<ImportConfig, "generateHkt" | "convertToSsbh" | "ssbhConfig"> = {
      generateHkt: true,
      convertToSsbh: true,
      ssbhConfig: ssbhA,
    };
    const importConfigB: Pick<ImportConfig, "generateHkt" | "convertToSsbh" | "ssbhConfig"> = {
      generateHkt: true,
      convertToSsbh: true,
      ssbhConfig: { ...ssbhA },
    };

    expect(serializeHktPreviewConfigKey(importConfigA, DEFAULT_HKT_SIMPLIFY)).toBe(
      serializeHktPreviewConfigKey(importConfigB, DEFAULT_HKT_SIMPLIFY),
    );
  });

  it("shape-preserving presets default to the shapePreserving strategy", () => {
    expect(hktSimplifyConfigFromPreset("medium").strategy).toBe("shapePreserving");
    expect(hktSimplifyConfigFromPreset("medium").hullTargetFaces).toBeNull();
  });

  it("maps hull presets to a convexHull strategy with a face budget", () => {
    const coarse = hktHullConfigFromPreset("coarse");
    expect(coarse.strategy).toBe("convexHull");
    expect(coarse.enabled).toBe(true);
    expect(coarse.hullPreset).toBe("coarse");
    expect(coarse.hullTargetFaces).toBe(HKT_HULL_PRESET_FACES.coarse);
    expect(hktHullConfigFromPreset("fine").hullTargetFaces).toBe(HKT_HULL_PRESET_FACES.fine);
  });

  it("normalize preserves a convexHull strategy and its hull preset", () => {
    const normalized = normalizeHktSimplifyConfig({ strategy: "convexHull", hullPreset: "balanced" });
    expect(normalized.strategy).toBe("convexHull");
    expect(normalized.hullPreset).toBe("balanced");
    expect(normalized.hullTargetFaces).toBe(HKT_HULL_PRESET_FACES.balanced);
  });

  it("normalize preserves the authored quad merge toggle", () => {
    const normalized = normalizeHktSimplifyConfig({
      preset: "medium",
      quadMergeEnabled: false,
    });
    expect(normalized.preset).toBe("medium");
    expect(normalized.quadMergeEnabled).toBe(false);
  });

  it("preview key changes when the strategy changes", () => {
    const importConfig = { generateHkt: true, convertToSsbh: false, ssbhConfig: null } as const;
    const shape = serializeHktPreviewConfigKey(importConfig, DEFAULT_HKT_SIMPLIFY);
    const hull = serializeHktPreviewConfigKey(importConfig, hktHullConfigFromPreset("coarse"));
    expect(shape).not.toBe(hull);
  });

  it("preview key changes when authored quad merging changes", () => {
    const importConfig = { generateHkt: true, convertToSsbh: false, ssbhConfig: null } as const;
    const quads = serializeHktPreviewConfigKey(importConfig, DEFAULT_HKT_SIMPLIFY);
    const triangles = serializeHktPreviewConfigKey(importConfig, {
      ...DEFAULT_HKT_SIMPLIFY,
      quadMergeEnabled: false,
    });
    expect(quads).not.toBe(triangles);
  });
});
