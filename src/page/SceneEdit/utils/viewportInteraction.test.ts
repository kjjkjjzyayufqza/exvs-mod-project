import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  computeDragDistancePx,
  getViewportSelectModifiers,
  isScreenPointInsideRect,
  normalizeScreenRect,
  shouldBlockViewportPick,
} from "./viewportInteraction";

describe("viewportInteraction", () => {
  it("detects ctrl/meta modifiers", () => {
    expect(getViewportSelectModifiers({ ctrlKey: true, shiftKey: false, metaKey: false } as MouseEvent).ctrl).toBe(true);
    expect(getViewportSelectModifiers({ ctrlKey: false, shiftKey: false, metaKey: true } as MouseEvent).ctrl).toBe(true);
  });

  it("blocks pick while orbiting or marquee dragging", () => {
    expect(
      shouldBlockViewportPick({
        clickPickSelectionEnabled: true,
        orbitActive: true,
        dragDistancePx: 0,
      }),
    ).toBe(true);
    expect(
      shouldBlockViewportPick({
        clickPickSelectionEnabled: true,
        marqueeActive: true,
        dragDistancePx: 0,
      }),
    ).toBe(true);
  });

  it("allows short click pick on empty background", () => {
    expect(
      shouldBlockViewportPick({
        clickPickSelectionEnabled: true,
        dragDistancePx: 2,
      }),
    ).toBe(false);
  });

  it("normalizes screen rect coordinates", () => {
    expect(normalizeScreenRect(10, 20, 5, 15)).toEqual({
      left: 5,
      top: 15,
      right: 10,
      bottom: 20,
    });
  });

  it("computes drag distance", () => {
    expect(computeDragDistancePx(0, 0, 3, 4)).toBe(5);
  });

  it("checks screen point inclusion", () => {
    const rect = normalizeScreenRect(0, 0, 100, 100);
    expect(isScreenPointInsideRect(50, 50, rect)).toBe(true);
    expect(isScreenPointInsideRect(120, 50, rect)).toBe(false);
  });
});
