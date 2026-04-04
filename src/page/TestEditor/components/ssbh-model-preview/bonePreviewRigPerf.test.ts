import { describe, expect, it } from "vitest";
import { shouldRecomputeNormalsDuringSkinning } from "./bonePreviewRigPerf";

describe("shouldRecomputeNormalsDuringSkinning", () => {
  it("returns false while dragging", () => {
    expect(shouldRecomputeNormalsDuringSkinning(true, false)).toBe(false);
  });

  it("returns false while motion is driving", () => {
    expect(shouldRecomputeNormalsDuringSkinning(false, true)).toBe(false);
  });

  it("returns true when idle edit frame", () => {
    expect(shouldRecomputeNormalsDuringSkinning(false, false)).toBe(true);
  });
});
