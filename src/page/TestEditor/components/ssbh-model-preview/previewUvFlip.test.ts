import { BufferAttribute, BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { applyPreviewUvFlip } from "./previewUvFlip";

describe("applyPreviewUvFlip", () => {
  it("mirrors U from a stable base when toggling", () => {
    const g = new BufferGeometry();
    const uv = new Float32Array([0, 0, 1, 1]);
    g.setAttribute("uv", new BufferAttribute(uv, 2));

    applyPreviewUvFlip(g, true, false);
    expect(Array.from(uv)).toEqual([1, 0, 0, 1]);

    applyPreviewUvFlip(g, false, false);
    expect(Array.from(uv)).toEqual([0, 0, 1, 1]);
  });

  it("applies uv2 independently when present", () => {
    const g = new BufferGeometry();
    const uv = new Float32Array([0, 0, 1, 0]);
    const uv2 = new Float32Array([0.25, 0.25, 0.75, 0.75]);
    g.setAttribute("uv", new BufferAttribute(uv, 2));
    g.setAttribute("uv2", new BufferAttribute(uv2, 2));

    applyPreviewUvFlip(g, true, false);
    expect(Array.from(uv)).toEqual([1, 0, 0, 0]);
    expect(Array.from(uv2)).toEqual([0.75, 0.25, 0.25, 0.75]);

    applyPreviewUvFlip(g, false, false);
    expect(Array.from(uv)).toEqual([0, 0, 1, 0]);
    expect(Array.from(uv2)).toEqual([0.25, 0.25, 0.75, 0.75]);
  });
});
