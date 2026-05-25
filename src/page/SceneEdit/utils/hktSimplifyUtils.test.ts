import { describe, expect, it } from "vitest";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import {
  countHavokCollisionTriangles,
  DEFAULT_HKT_SIMPLIFY,
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
});
