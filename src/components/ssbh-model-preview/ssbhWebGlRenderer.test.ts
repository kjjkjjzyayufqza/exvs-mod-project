import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { WebGLRenderer } from "three";
import type { SsbhWebGlRendererParameters } from "./ssbhWebGlRenderer";
import {
  applySafeWebGlDrawingBufferSize,
  buildSsbhWebGlRendererAttempts,
  createSsbhWebGlRenderer,
  isUsableSsbhWebGlHostSize,
} from "./ssbhWebGlRenderer";

const PREVIEW_CANVAS_SOURCES = [
  resolve(__dirname, "SsbhModelCanvas.tsx"),
  resolve(__dirname, "../../page/SceneEdit/components/MapViewport.tsx"),
  resolve(__dirname, "../../page/SceneEdit/components/havok/HktCollisionPreviewCanvas.tsx"),
];

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

  it("asks for a high-performance context that refuses a software rasterizer first", () => {
    const attempts = buildSsbhWebGlRendererAttempts({
      antialias: true,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: false,
      logarithmicDepthBuffer: true,
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.failIfMajorPerformanceCaveat).toBe(true);
    expect(attempts[0]?.powerPreference).toBe("high-performance");
    expect(attempts[1]?.failIfMajorPerformanceCaveat).toBe(false);
    expect(attempts[1]?.powerPreference).toBe("default");
    expect(attempts[1]?.logarithmicDepthBuffer).toBe(false);
    expect(attempts[1]?.antialias).toBe(false);
  });

  it("returns the GPU renderer when the first constructor succeeds", () => {
    const construct = vi.fn(
      (params: SsbhWebGlRendererParameters) => ({ params }) as unknown as WebGLRenderer,
    );
    const renderer = createSsbhWebGlRenderer(
      {
        antialias: true,
        powerPreference: "default",
        failIfMajorPerformanceCaveat: false,
        logarithmicDepthBuffer: true,
      },
      construct,
    );
    expect(construct).toHaveBeenCalledTimes(1);
    const params = construct.mock.calls[0]?.[0];
    expect(params?.powerPreference).toBe("high-performance");
    expect(params?.failIfMajorPerformanceCaveat).toBe(true);
    expect(renderer).toBe(construct.mock.results[0]?.value);
  });

  it("makes one permissive attempt only after the GPU constructor throws", () => {
    const construct = vi.fn((params: SsbhWebGlRendererParameters) => {
      if (params.failIfMajorPerformanceCaveat) {
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
    expect(construct.mock.calls[0]?.[0].failIfMajorPerformanceCaveat).toBe(true);
    expect(construct.mock.calls[0]?.[0].powerPreference).toBe("high-performance");
    expect(construct.mock.calls[1]?.[0].failIfMajorPerformanceCaveat).toBe(false);
    expect(renderer).toBe(construct.mock.results[1]?.value);
  });

  it("wires the unit-model and scene-editor canvases through that policy", () => {
    for (const file of PREVIEW_CANVAS_SOURCES) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("createSsbhWebGlRenderer");
      expect(source).not.toContain("failIfMajorPerformanceCaveat: false");
    }
    const startup = readFileSync(resolve(__dirname, "../../../src-tauri/src/main.rs"), "utf8");
    expect(startup).toContain("--enable-gpu --ignore-gpu-blocklist --enable-webgl");
    expect(startup.toLowerCase()).not.toContain("swiftshader");
    expect(startup.toLowerCase()).not.toContain("use-angle");
  });
});
