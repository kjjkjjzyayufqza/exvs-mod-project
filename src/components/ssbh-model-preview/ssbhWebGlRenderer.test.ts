import { describe, expect, it, vi } from "vitest";
import type { WebGLRenderer } from "three";
import type { SsbhWebGlRendererParameters } from "./ssbhWebGlRenderer";
import {
  applySafeWebGlDrawingBufferSize,
  buildSsbhWebGlRendererAttempts,
  createSsbhWebGlRenderer,
  isUsableSsbhWebGlHostSize,
} from "./ssbhWebGlRenderer";

describe("ssbhWebGlRenderer", () => {
  it("rejects drawing-buffer sizes that would call setSize(0, 0)", () => {
    expect(isUsableSsbhWebGlHostSize(0, 420)).toBe(false);
    expect(isUsableSsbhWebGlHostSize(800, 0)).toBe(false);
    expect(isUsableSsbhWebGlHostSize(1, 1)).toBe(false);
    expect(isUsableSsbhWebGlHostSize(2, 2)).toBe(true);

    const gl = {
      setPixelRatio: vi.fn(),
      setSize: vi.fn(),
    };
    expect(applySafeWebGlDrawingBufferSize(gl, 0, 1080, 1)).toBe(false);
    expect(gl.setSize).not.toHaveBeenCalled();
    expect(applySafeWebGlDrawingBufferSize(gl, 1280, 720, 1.5)).toBe(true);
    expect(gl.setPixelRatio).toHaveBeenCalledWith(1.5);
    expect(gl.setSize).toHaveBeenCalledWith(1280, 720, false);
  });

  it("always disables failIfMajorPerformanceCaveat and falls back to a default-power context", () => {
    const attempts = buildSsbhWebGlRendererAttempts({
      antialias: true,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: true,
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.failIfMajorPerformanceCaveat).toBe(false);
    expect(attempts[0]?.powerPreference).toBe("high-performance");
    expect(attempts[1]?.failIfMajorPerformanceCaveat).toBe(false);
    expect(attempts[1]?.powerPreference).toBe("default");
    expect(attempts[1]?.logarithmicDepthBuffer).toBe(false);
    expect(attempts[1]?.antialias).toBe(false);
  });

  it("uses the compatibility attempt when the preferred constructor throws", () => {
    const construct = vi.fn((params: SsbhWebGlRendererParameters) => {
      if (params.powerPreference === "high-performance") {
        throw new Error("Error creating WebGL context.");
      }
      return { params } as unknown as WebGLRenderer;
    });
    const renderer = createSsbhWebGlRenderer(
      {
        antialias: true,
        powerPreference: "high-performance",
        logarithmicDepthBuffer: true,
      },
      construct,
    );
    expect(construct).toHaveBeenCalledTimes(2);
    expect((renderer as unknown as { params: SsbhWebGlRendererParameters }).params.powerPreference).toBe(
      "default",
    );
  });
});
