import { BufferAttribute, BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { measureSyncDurationBudget, assertDurationWithinBudget } from "@/test/performance";
import {
  getSsbhPerfMonitorOptions,
  getSsbhCanvasPerformanceProfile,
  isSsbhPreviewDebugEnabled,
  measureDrawComplexity,
} from "./ssbhCanvasPerformance";
import type { BuiltMeshDraw } from "./types";

function createDraw(key: string, vertexCount: number, indexedTriangleCount: number): BuiltMeshDraw {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertexCount * 3), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indexedTriangleCount * 3), 1));
  return {
    key,
    label: key,
    geometry,
    materialLabel: key,
    meshObjectName: key,
    meshObjectSubindex: 0,
    skin: null,
  };
}

describe("ssbhCanvasPerformance", () => {
  it("keeps preview debug logging disabled by default in development", () => {
    expect(isSsbhPreviewDebugEnabled(undefined, true)).toBe(false);
    expect(isSsbhPreviewDebugEnabled({ __SSBH_PREVIEW_DEBUG__: false }, true)).toBe(false);
    expect(isSsbhPreviewDebugEnabled({ __SSBH_PREVIEW_DEBUG__: true }, true)).toBe(true);
    expect(isSsbhPreviewDebugEnabled({ __SSBH_PREVIEW_DEBUG__: true }, false)).toBe(false);
  });

  it("reduces dpr and antialiasing for heavy animated anime scenes", () => {
    const profile = getSsbhCanvasPerformanceProfile({
      drawCount: 36,
      triangleCount: 820_000,
      motionPlaying: true,
      motionScrubbing: false,
      previewRenderStyle: "anime",
    });

    expect(profile.dpr).toEqual([1, 1.25]);
    expect(profile.antialias).toBe(false);
  });

  it("keeps higher quality for light static scenes", () => {
    const profile = getSsbhCanvasPerformanceProfile({
      drawCount: 6,
      triangleCount: 45_000,
      motionPlaying: false,
      motionScrubbing: false,
      previewRenderStyle: "standard",
    });

    expect(profile.dpr).toEqual([1, 2]);
    expect(profile.antialias).toBe(true);
  });

  it("keeps the perf monitor compact for heavy animated scenes", () => {
    const options = getSsbhPerfMonitorOptions({
      drawCount: 36,
      triangleCount: 820_000,
      motionPlaying: true,
      motionScrubbing: false,
      previewRenderStyle: "anime",
    });

    expect(options).toEqual({
      position: "top-right",
      minimal: true,
      showGraph: false,
      showLegacyStats: true,
    });
  });

  it("shows the detailed perf monitor for light static scenes", () => {
    const options = getSsbhPerfMonitorOptions({
      drawCount: 6,
      triangleCount: 45_000,
      motionPlaying: false,
      motionScrubbing: false,
      previewRenderStyle: "standard",
    });

    expect(options).toEqual({
      position: "top-right",
      minimal: false,
      showGraph: true,
      showLegacyStats: true,
    });
  });

  it("profiles draw complexity within the ms budget", () => {
    const draws = Array.from({ length: 400 }, (_, index) =>
      createDraw(`draw_${index}`, 180, 120),
    );

    const measurement = measureSyncDurationBudget(() => measureDrawComplexity(draws), {
      iterations: 12,
      warmupIterations: 2,
      label: "measureDrawComplexity",
    });

    expect(measurement.lastResult.drawCount).toBe(400);
    expect(measurement.lastResult.triangleCount).toBe(48_000);
    assertDurationWithinBudget(measurement, { averageMs: 4, maxMs: 8 });
  });
});
