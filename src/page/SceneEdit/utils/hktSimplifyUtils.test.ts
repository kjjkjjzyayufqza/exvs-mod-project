import { describe, expect, it } from "vitest";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import { countHavokCollisionTriangles, reductionPercent } from "./hktSimplifyUtils";

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
});
