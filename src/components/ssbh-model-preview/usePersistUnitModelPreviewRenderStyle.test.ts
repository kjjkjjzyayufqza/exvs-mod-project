import { describe, expect, it } from "vitest";

import { persistedPreviewRenderStyleNeedsApply } from "./usePersistUnitModelPreviewRenderStyle";

describe("persistedPreviewRenderStyleNeedsApply", () => {
  it("applies a preset the viewport did not capture on first paint", () => {
    expect(persistedPreviewRenderStyleNeedsApply(null, "exvs2", "standard")).toBe(true);
  });

  it("does not re-apply a preset the viewport already shows", () => {
    expect(persistedPreviewRenderStyleNeedsApply(null, "exvs2", "exvs2")).toBe(false);
  });

  it("does not overwrite a viewport edit with the store value already applied", () => {
    expect(persistedPreviewRenderStyleNeedsApply("exvs2", "exvs2", "anime")).toBe(false);
  });

  it("applies a later store change over the live viewport style", () => {
    expect(persistedPreviewRenderStyleNeedsApply("exvs2", "standard", "exvs2")).toBe(true);
  });
});
