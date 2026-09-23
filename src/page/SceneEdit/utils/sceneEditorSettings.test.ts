import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENE_GIZMO_SIZE,
  MAX_SCENE_GIZMO_SIZE,
  MIN_SCENE_GIZMO_SIZE,
  normalizePreviewRenderStyle,
  normalizeSceneGizmoSize,
  normalizeSceneTexturesEnabled,
} from "./sceneEditorSettings";

describe("sceneEditorSettings", () => {
  it("normalizes missing and invalid gizmo sizes to the default", () => {
    expect(normalizeSceneGizmoSize(undefined)).toBe(DEFAULT_SCENE_GIZMO_SIZE);
    expect(normalizeSceneGizmoSize(null)).toBe(DEFAULT_SCENE_GIZMO_SIZE);
    expect(normalizeSceneGizmoSize(Number.NaN)).toBe(DEFAULT_SCENE_GIZMO_SIZE);
    expect(normalizeSceneGizmoSize("large")).toBe(DEFAULT_SCENE_GIZMO_SIZE);
  });

  it("clamps persisted gizmo sizes to the supported editor range", () => {
    expect(normalizeSceneGizmoSize(0.01)).toBe(MIN_SCENE_GIZMO_SIZE);
    expect(normalizeSceneGizmoSize(99)).toBe(MAX_SCENE_GIZMO_SIZE);
    expect(normalizeSceneGizmoSize("2.5")).toBe(2.5);
  });

  it("normalizes scene texture toggle persistence", () => {
    expect(normalizeSceneTexturesEnabled(undefined)).toBe(true);
    expect(normalizeSceneTexturesEnabled(false)).toBe(false);
    expect(normalizeSceneTexturesEnabled(true)).toBe(true);
  });

  it("normalizes preview render style persistence", () => {
    expect(normalizePreviewRenderStyle("anime")).toBe("anime");
    expect(normalizePreviewRenderStyle("exvs2")).toBe("exvs2");
    expect(normalizePreviewRenderStyle("standard")).toBe("standard");
    expect(normalizePreviewRenderStyle("missing", "standard")).toBe("standard");
  });
});
