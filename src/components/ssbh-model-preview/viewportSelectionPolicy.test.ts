import { describe, expect, it } from "vitest";
import {
  expandSingleViewWithAttachments,
  resolveViewportActiveInstancePick,
  shouldIsolateMotionTarget,
  shouldShowPreviewSelectionOutline,
} from "./viewportSelectionPolicy";

describe("resolveViewportActiveInstancePick", () => {
  it("keeps the current active model on empty viewport pick", () => {
    const result = resolveViewportActiveInstancePick([], "body-instance");
    expect(result).toEqual({
      nextActiveId: "body-instance",
      clearBoneSelection: true,
    });
  });

  it("keeps null active on empty pick when nothing was selected", () => {
    const result = resolveViewportActiveInstancePick([], null);
    expect(result).toEqual({
      nextActiveId: null,
      clearBoneSelection: true,
    });
  });

  it("switches active to the last multi-pick id", () => {
    const result = resolveViewportActiveInstancePick(["a", "b", "c"], "a");
    expect(result).toEqual({
      nextActiveId: "c",
      clearBoneSelection: false,
    });
  });

  it("switches active on a single model pick", () => {
    const result = resolveViewportActiveInstancePick(["weapon"], "body");
    expect(result).toEqual({
      nextActiveId: "weapon",
      clearBoneSelection: false,
    });
  });
});

describe("shouldIsolateMotionTarget", () => {
  it("isolates only when multiple models are loaded", () => {
    expect(shouldIsolateMotionTarget(0)).toBe(false);
    expect(shouldIsolateMotionTarget(1)).toBe(false);
    expect(shouldIsolateMotionTarget(2)).toBe(true);
  });
});

describe("expandSingleViewWithAttachments", () => {
  it("keeps active host and its attached guests visible", () => {
    const keep = expandSingleViewWithAttachments("body", [
      { parentInstanceId: "body", childInstanceId: "brifle" },
      { parentInstanceId: "other", childInstanceId: "x" },
    ]);
    expect([...keep].sort()).toEqual(["body", "brifle"]);
  });

  it("keeps active guest and its host visible", () => {
    const keep = expandSingleViewWithAttachments("brifle", [
      { parentInstanceId: "body", childInstanceId: "brifle" },
    ]);
    expect([...keep].sort()).toEqual(["body", "brifle"]);
  });

  it("returns empty when no active instance", () => {
    expect(expandSingleViewWithAttachments(null, [{ parentInstanceId: "a", childInstanceId: "b" }]).size).toBe(
      0,
    );
  });
});

describe("shouldShowPreviewSelectionOutline", () => {
  it("shows yellow only when active and Inspect explicitly enabled the outline", () => {
    expect(
      shouldShowPreviewSelectionOutline({
        isActive: true,
        selectionOutlineEnabled: true,
      }),
    ).toBe(true);
  });

  it("hides outline when inactive even if Inspect flag is on", () => {
    expect(
      shouldShowPreviewSelectionOutline({
        isActive: false,
        selectionOutlineEnabled: true,
      }),
    ).toBe(false);
  });

  it("hides outline when active but Inspect flag is off (motion / open folder)", () => {
    expect(
      shouldShowPreviewSelectionOutline({
        isActive: true,
        selectionOutlineEnabled: false,
      }),
    ).toBe(false);
  });
});
