import { describe, expect, it } from "vitest";
import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";
import type { EfxbnPreviewParticle } from "./efxbnSimulation";
import { buildEfxbnStripMeshData } from "./efxbnStripGeometry";

describe("EFXBN strip ribbon geometry", () => {
  it("subdivides history into paired ribbon vertices and fades tail to head", () => {
    const particle = {
      history: [[0, 0, 0], [1, 0, 0], [2, 1, 0]],
      size: [0.2, 0.1],
      color: [1, 0.5, 0.25, 0.8],
    } as EfxbnPreviewParticle;
    const target = {
      stripSegmentSplitNum: 2,
      stripTailAlphaRate: 0,
      stripHeadAlphaRate: 1,
    } as EfxbnEffectSummary;

    const data = buildEfxbnStripMeshData([particle], target, 100);

    expect(data.sides).toHaveLength(10);
    expect(data.indices).toHaveLength(24);
    expect(data.widths[0]).toBeCloseTo(0.1, 6);
    expect(data.colors[3]).toBe(0);
    expect(data.colors.at(-1)).toBeCloseTo(0.8, 6);
    expect(data.uvs.slice(-2)).toEqual([1, 1]);
  });
});
