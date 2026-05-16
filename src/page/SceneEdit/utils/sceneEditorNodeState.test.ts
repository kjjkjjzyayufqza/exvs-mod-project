import { describe, expect, it } from "vitest";
import {
  canEditSceneNode,
  canRenderSceneNode,
  isSceneNodeLocked,
  isSceneNodeVisible,
} from "./sceneEditorNodeState";

describe("sceneEditorNodeState", () => {
  it("treats nodes as visible and unlocked by default", () => {
    expect(isSceneNodeVisible("actor", {})).toBe(true);
    expect(isSceneNodeLocked("actor", {})).toBe(false);
    expect(canRenderSceneNode("actor", {}, {})).toBe(true);
    expect(canEditSceneNode("actor", {}, {})).toBe(true);
  });

  it("prevents hidden nodes from rendering and editing", () => {
    const visibility = { actor: false };
    expect(canRenderSceneNode("actor", visibility, {})).toBe(false);
    expect(canEditSceneNode("actor", visibility, {})).toBe(false);
  });

  it("keeps locked nodes visible but blocks editing", () => {
    const locks = { actor: true };
    expect(canRenderSceneNode("actor", {}, locks)).toBe(true);
    expect(canEditSceneNode("actor", {}, locks)).toBe(false);
  });
});
