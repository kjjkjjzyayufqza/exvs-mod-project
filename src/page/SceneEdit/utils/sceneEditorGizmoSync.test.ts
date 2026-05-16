import { describe, expect, it } from "vitest";
import {
  shouldRenderGizmoControls,
  shouldInvalidateViewportForGizmoEvent,
  shouldSyncSceneStateForGizmoEvent,
} from "./sceneEditorGizmoSync";

describe("sceneEditorGizmoSync", () => {
  it("does not sync React scene state during high-frequency drag frames", () => {
    expect(shouldSyncSceneStateForGizmoEvent("drag")).toBe(false);
  });

  it("syncs React scene state when a gizmo drag commits", () => {
    expect(shouldSyncSceneStateForGizmoEvent("commit")).toBe(true);
  });

  it("keeps the viewport repainting during drag and commit events", () => {
    expect(shouldInvalidateViewportForGizmoEvent("drag")).toBe(true);
    expect(shouldInvalidateViewportForGizmoEvent("commit")).toBe(true);
  });

  it("renders gizmo controls when selected actor has a commit handler even without a drag-frame sync handler", () => {
    expect(
      shouldRenderGizmoControls({
        isSelected: true,
        hasCommitHandler: true,
      }),
    ).toBe(true);
  });

  it("does not render gizmo controls for unselected actors or actors without commit support", () => {
    expect(
      shouldRenderGizmoControls({
        isSelected: false,
        hasCommitHandler: true,
      }),
    ).toBe(false);
    expect(
      shouldRenderGizmoControls({
        isSelected: true,
        hasCommitHandler: false,
      }),
    ).toBe(false);
  });
});
