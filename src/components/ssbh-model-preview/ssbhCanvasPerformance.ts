import type { BufferGeometry } from "three";
import type { PreviewRenderStyle } from "./SsbhModelPreviewContext";

type DrawGeometryLike = {
  geometry: BufferGeometry;
};

export type SsbhCanvasDrawComplexity = {
  drawCount: number;
  triangleCount: number;
  vertexCount: number;
};

export type SsbhCanvasPerformanceProfile = {
  dpr: [number, number];
  antialias: boolean;
};

export type SsbhAdaptivePerformanceOptions = {
  min: number;
  max: number;
  debounce: number;
};

export type SsbhPerfMonitorOptions = {
  position: "top-right";
  minimal: boolean;
  showGraph: boolean;
  showLegacyStats: boolean;
};

type SsbhCanvasPerformanceParams = {
  drawCount: number;
  triangleCount: number;
  motionPlaying: boolean;
  motionScrubbing: boolean;
  previewRenderStyle: PreviewRenderStyle;
};

function geometryTriangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) {
    return Math.floor(index.count / 3);
  }
  const positions = geometry.getAttribute("position");
  return positions ? Math.floor(positions.count / 3) : 0;
}

function geometryVertexCount(geometry: BufferGeometry): number {
  const positions = geometry.getAttribute("position");
  return positions?.count ?? 0;
}

export function measureDrawComplexity(draws: readonly DrawGeometryLike[]): SsbhCanvasDrawComplexity {
  let triangleCount = 0;
  let vertexCount = 0;
  for (const draw of draws) {
    triangleCount += geometryTriangleCount(draw.geometry);
    vertexCount += geometryVertexCount(draw.geometry);
  }
  return {
    drawCount: draws.length,
    triangleCount,
    vertexCount,
  };
}

function getSceneComplexityFlags(params: SsbhCanvasPerformanceParams) {
  const motionActive = params.motionPlaying || params.motionScrubbing;
  const heavyScene = params.drawCount >= 24 || params.triangleCount >= 250_000;
  const veryHeavyScene = params.drawCount >= 48 || params.triangleCount >= 750_000;
  const animePipeline = params.previewRenderStyle === "anime";

  return {
    motionActive,
    heavyScene,
    veryHeavyScene,
    animePipeline,
  };
}

export function getSsbhAdaptivePerformanceOptions(
  params: SsbhCanvasPerformanceParams,
): SsbhAdaptivePerformanceOptions {
  const { heavyScene, veryHeavyScene, animePipeline } = getSceneComplexityFlags(params);

  if (veryHeavyScene || animePipeline) {
    return {
      min: 0.5,
      max: 1,
      debounce: 650,
    };
  }
  if (heavyScene) {
    return {
      min: 0.65,
      max: 1,
      debounce: 500,
    };
  }
  return {
    min: 0.8,
    max: 1,
    debounce: 300,
  };
}

export function getSsbhCanvasPerformanceProfile(
  params: SsbhCanvasPerformanceParams,
): SsbhCanvasPerformanceProfile {
  const { motionActive, heavyScene, veryHeavyScene, animePipeline } = getSceneComplexityFlags(params);

  let maxDpr = animePipeline ? 1.5 : 2;
  let antialias = true;

  if (heavyScene) {
    maxDpr = Math.min(maxDpr, 1.5);
  }
  if (veryHeavyScene) {
    maxDpr = Math.min(maxDpr, 1.25);
    antialias = false;
  }
  if (motionActive) {
    maxDpr = Math.min(maxDpr, 1.25);
    if (animePipeline || heavyScene) {
      antialias = false;
    }
  }

  return {
    dpr: [1, maxDpr],
    antialias,
  };
}

export function getSsbhAdaptiveDpr(baseMaxDpr: number, performanceCurrent: number): number {
  if (!Number.isFinite(baseMaxDpr) || baseMaxDpr <= 0) {
    throw new Error(`Adaptive DPR requires a positive finite base max DPR, got ${baseMaxDpr}.`);
  }
  if (!Number.isFinite(performanceCurrent) || performanceCurrent <= 0) {
    throw new Error(`Adaptive DPR requires a positive finite performance current, got ${performanceCurrent}.`);
  }
  return Math.min(baseMaxDpr, Math.max(1, Number((baseMaxDpr * performanceCurrent).toFixed(2))));
}

export function shouldDisableSsbhAnimePostFx(
  previewRenderStyle: PreviewRenderStyle,
  performanceCurrent: number,
): boolean {
  if (!Number.isFinite(performanceCurrent) || performanceCurrent <= 0) {
    throw new Error(`Anime post FX gating requires a positive finite performance current, got ${performanceCurrent}.`);
  }
  // Anime bloom + warm-light look is a user-selected preview style. Motion
  // playback switches the canvas to an always-on frameloop; OrbitControls
  // damping and motion regression keep performance.current below 1 for the
  // whole clip, so gating EffectComposer on that value made glow vanish until
  // pause.
  if (previewRenderStyle !== "anime") {
    return false;
  }
  return false;
}

export function getSsbhPerfMonitorOptions(
  params: SsbhCanvasPerformanceParams,
): SsbhPerfMonitorOptions {
  const { motionActive, heavyScene, veryHeavyScene } = getSceneComplexityFlags(params);

  return {
    position: "top-right",
    minimal: motionActive || heavyScene,
    showGraph: !motionActive && !veryHeavyScene,
    showLegacyStats: true,
  };
}

export function isSsbhPreviewDebugEnabled(
  globalValue: { __SSBH_PREVIEW_DEBUG__?: boolean } | undefined,
  isDev: boolean,
): boolean {
  return isDev && globalValue?.__SSBH_PREVIEW_DEBUG__ === true;
}
