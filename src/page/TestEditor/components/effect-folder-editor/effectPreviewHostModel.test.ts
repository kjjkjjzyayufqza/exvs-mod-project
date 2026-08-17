import { describe, expect, it } from "vitest";
import {
  effectPreviewHostModelLabel,
  planEffectPreviewModelLoad,
} from "./effectPreviewHostModel";

describe("planEffectPreviewModelLoad", () => {
  it("loads only the effect models when no host is configured", () => {
    const plan = planEffectPreviewModelLoad(["a/ring.numdlb", "b/sphere.numdlb"], null);
    expect(plan.paths).toEqual(["a/ring.numdlb", "b/sphere.numdlb"]);
    expect(plan.hostPathIndex).toBeNull();
  });

  it("appends the host last so effect slots keep their existing indices", () => {
    // `EffectFolderPreviewScene` maps returned instances to model slots positionally; appending
    // keeps that mapping untouched instead of shifting every effect block by one.
    const plan = planEffectPreviewModelLoad(["a/ring.numdlb"], "unit/body.numdlb");
    expect(plan.paths).toEqual(["a/ring.numdlb", "unit/body.numdlb"]);
    expect(plan.hostPathIndex).toBe(1);
  });

  it("loads the host alone for an effect that draws no models of its own", () => {
    const plan = planEffectPreviewModelLoad([], "unit/body.numdlb");
    expect(plan.paths).toEqual(["unit/body.numdlb"]);
    expect(plan.hostPathIndex).toBe(0);
  });

  it("treats a blank host path as no host rather than loading an empty path", () => {
    const plan = planEffectPreviewModelLoad(["a/ring.numdlb"], "   ");
    expect(plan.paths).toEqual(["a/ring.numdlb"]);
    expect(plan.hostPathIndex).toBeNull();
  });

  it("keeps a host that is also an effect model as a second, independent instance", () => {
    // Deduplicating would silently drop the static reference model the user asked to see.
    const plan = planEffectPreviewModelLoad(["a/ring.numdlb"], "a/ring.numdlb");
    expect(plan.paths).toEqual(["a/ring.numdlb", "a/ring.numdlb"]);
    expect(plan.hostPathIndex).toBe(1);
  });

  it("rejects a host that is not a numdlb instead of letting the loader fail later", () => {
    expect(() => planEffectPreviewModelLoad([], "unit/body.numshb")).toThrow(/numdlb/i);
  });
});

describe("effectPreviewHostModelLabel", () => {
  it("keeps the owning folder so two body.numdlb files stay distinguishable", () => {
    expect(effectPreviewHostModelLabel("E:/XB/mod/unit/wing_zero/body.numdlb")).toBe(
      "wing_zero/body.numdlb",
    );
  });

  it("handles backslash paths from the Windows file dialog", () => {
    expect(effectPreviewHostModelLabel("E:\\XB\\mod\\unit\\wing_zero\\body.numdlb")).toBe(
      "wing_zero/body.numdlb",
    );
  });

  it("falls back to the bare file name when there is no parent folder", () => {
    expect(effectPreviewHostModelLabel("body.numdlb")).toBe("body.numdlb");
  });
});
