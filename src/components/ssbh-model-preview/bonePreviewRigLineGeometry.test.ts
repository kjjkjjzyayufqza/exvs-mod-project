import { BufferAttribute, BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { refreshDynamicLineGeometryBounds } from "./bonePreviewRigLineGeometry";

describe("refreshDynamicLineGeometryBounds", () => {
  it("recomputes bounding volumes after dynamic line vertices move away from the origin", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(6), 3));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const positions = geometry.getAttribute("position") as BufferAttribute;
    const array = positions.array as Float32Array;
    array[0] = 10;
    array[1] = 0;
    array[2] = 0;
    array[3] = 20;
    array[4] = 0;
    array[5] = 0;

    refreshDynamicLineGeometryBounds(geometry);

    expect(geometry.boundingBox?.min.x).toBe(10);
    expect(geometry.boundingBox?.max.x).toBe(20);
    expect(geometry.boundingSphere?.center.x).toBeCloseTo(15, 6);
    expect(geometry.boundingSphere?.radius).toBeCloseTo(5, 6);
  });
});
