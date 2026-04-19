import { BufferAttribute, BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { measureSyncDurationBudget, assertDurationWithinBudget } from "@/test/performance";
import {
  getSsbhAdaptiveDpr,
  getSsbhAdaptivePerformanceOptions,
  getSsbhPerfMonitorOptions,
  getSsbhCanvasPerformanceProfile,
  isSsbhPreviewDebugEnabled,
  measureDrawComplexity,
  shouldDisableSsbhAnimePostFx,
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

  it("uses more aggressive adaptive performance options for heavy anime scenes", () => {
    const options = getSsbhAdaptivePerformanceOptions({
      drawCount: 36,
      triangleCount: 820_000,
      motionPlaying: true,
      motionScrubbing: false,
      previewRenderStyle: "anime",
    });

    expect(options).toEqual({
      min: 0.5,
      max: 1,
      debounce: 650,
    });
  });

  it("recovers quality faster for light static scenes", () => {
    const options = getSsbhAdaptivePerformanceOptions({
      drawCount: 6,
      triangleCount: 45_000,
      motionPlaying: false,
      motionScrubbing: false,
      previewRenderStyle: "standard",
    });

    expect(options).toEqual({
      min: 0.8,
      max: 1,
      debounce: 300,
    });
  });

  it("computes adaptive dpr from the current performance budget", () => {
    expect(getSsbhAdaptiveDpr(2, 0.8)).toBe(1.6);
    expect(getSsbhAdaptiveDpr(1.25, 0.5)).toBe(1);
  });

  it("disables anime post fx only while the canvas is regressed", () => {
    expect(shouldDisableSsbhAnimePostFx("anime", 0.5)).toBe(true);
    expect(shouldDisableSsbhAnimePostFx("anime", 1)).toBe(false);
    expect(shouldDisableSsbhAnimePostFx("standard", 0.5)).toBe(false);
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
