import { describe, expect, it } from "vitest";
import { shouldRenderPreviewSkeletonLines } from "./ssbhPreviewSkeletonVisibility";
import type { SsbhModelPreviewInstance } from "./types";

function createPreviewInstance(id: string, skel: unknown | null): SsbhModelPreviewInstance {
  return {
    id,
    modlPath: `${id}.numdlb`,
    displayLabel: id,
    bundle: {
      rootFolder: `/${id}`,
      modlPath: `/${id}/${id}.numdlb`,
      meshPath: `/${id}/${id}.numshb`,
      skelPath: skel ? `/${id}/${id}.nusktb` : null,
      matlPaths: [],
      modl: {},
      mesh: {},
      skel,
      matl: null,
      textureRefs: [],
      resolvedNutexbPaths: [],
      textureResolve: [],
      warnings: [],
      sourceKind: "disk",
    },
  };
}

describe("shouldRenderPreviewSkeletonLines", () => {
  it("returns true when skeleton rendering is enabled and any loaded instance has a skeleton", () => {
    const instances = [
      createPreviewInstance("inactive-with-skel", { bones: [{ name: "Root", transform: [], parent_index: null, billboard_type: null }] }),
      createPreviewInstance("active-without-skel", null),
    ];

    expect(shouldRenderPreviewSkeletonLines(true, instances)).toBe(true);
  });

  it("returns false when skeleton rendering is disabled", () => {
    const instances = [createPreviewInstance("with-skel", { bones: [] })];

    expect(shouldRenderPreviewSkeletonLines(false, instances)).toBe(false);
  });

  it("returns false when no loaded instance has a skeleton", () => {
    const instances = [createPreviewInstance("without-skel", null)];

    expect(shouldRenderPreviewSkeletonLines(true, instances)).toBe(false);
  });
});
