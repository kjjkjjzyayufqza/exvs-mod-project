import { describe, expect, it } from "vitest";
import {
  SCENE_SELECTION_WIREFRAME_COLOR,
  getSelectionWireframeOverlayProps,
} from "./sceneSelectionOverlay";

describe("scene selection overlay", () => {
  it("uses a wireframe overlay instead of shader-driven selection color", () => {
    expect(getSelectionWireframeOverlayProps(true)).toEqual({
      visible: true,
      color: SCENE_SELECTION_WIREFRAME_COLOR,
      depthTest: false,
      transparent: true,
      opacity: 0.45,
      wireframe: true,
    });
  });

  it("hides the overlay completely when an object is not selected", () => {
    expect(getSelectionWireframeOverlayProps(false).visible).toBe(false);
  });
});
