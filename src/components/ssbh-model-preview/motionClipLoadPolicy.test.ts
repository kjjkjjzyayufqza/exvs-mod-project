import { describe, expect, it } from "vitest";
import { shouldStartMotionClipLoad } from "./motionClipLoadPolicy";

describe("shouldStartMotionClipLoad", () => {
  it("does not retry the same failed model and clip pair until its load key changes", () => {
    expect(
      shouldStartMotionClipLoad({
        loadKey: "model-a\nclip-a\n0",
        attemptedLoadKey: "model-a\nclip-a\n0",
        hasClip: false,
        sampling: false,
        sampleError: "NUANMB skeleton mismatch",
      }),
    ).toBe(false);
  });

  it("starts a load when the model, clip, or reload nonce changes the key", () => {
    expect(
      shouldStartMotionClipLoad({
        loadKey: "model-a\nclip-b\n1",
        attemptedLoadKey: "model-a\nclip-a\n0",
        hasClip: false,
        sampling: false,
        sampleError: null,
      }),
    ).toBe(true);
  });

  it("does not overlap an in-flight load", () => {
    expect(
      shouldStartMotionClipLoad({
        loadKey: "model-a\nclip-a\n0",
        attemptedLoadKey: null,
        hasClip: false,
        sampling: true,
        sampleError: null,
      }),
    ).toBe(false);
  });
});
