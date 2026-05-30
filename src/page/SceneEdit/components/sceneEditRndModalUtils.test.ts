import { describe, expect, it } from "vitest";
import {
  clampRndSizeToConstraints,
  clampSceneEditModalPosition,
  getDetailViewModalDimensions,
  getSceneEditCascadePosition,
} from "./sceneEditRndModalUtils";

describe("sceneEditRndModalUtils", () => {
  it("clamps modal position inside viewport margins", () => {
    const clamped = clampSceneEditModalPosition({ x: -100, y: 9999 }, { width: 760, height: 720 });
    expect(clamped.x).toBeGreaterThanOrEqual(24);
    expect(clamped.y).toBeLessThanOrEqual(800 - 720 - 24);
  });

  it("offsets cascade windows without leaving the viewport", () => {
    const dims = getDetailViewModalDimensions();
    const first = getSceneEditCascadePosition({ width: dims.width, height: dims.height }, 0);
    const second = getSceneEditCascadePosition({ width: dims.width, height: dims.height }, 1);
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
  });

  it("clamps rnd size to min and max constraints", () => {
    const dims = getDetailViewModalDimensions();
    const clamped = clampRndSizeToConstraints(
      { width: 10, height: 99999 },
      dims,
    );
    expect(clamped.width).toBe(dims.minWidth);
    expect(clamped.height).toBe(dims.maxHeight);
  });
});
