import { WebGLRenderer, type WebGLRendererParameters } from "three";

export const MIN_SSBH_WEBGL_DRAWING_BUFFER_SIZE = 2;

/** Three's published params omit this getContext flag; the runtime constructor honors it. */
export type SsbhWebGlRendererParameters = WebGLRendererParameters & {
  failIfMajorPerformanceCaveat?: boolean;
};

type DrawingBufferTarget = {
  setPixelRatio: (ratio: number) => void;
  setSize: (width: number, height: number, updateStyle?: boolean) => void;
};

export function isUsableSsbhWebGlHostSize(width: number, height: number): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= MIN_SSBH_WEBGL_DRAWING_BUFFER_SIZE &&
    height >= MIN_SSBH_WEBGL_DRAWING_BUFFER_SIZE
  );
}

/**
 * Skip 0×0 / fractional layouts. WebView2 can lose the WebGL context when
 * `setSize(0, 0)` runs on first paint (common in release, where DevTools is not
 * open to force a later resize).
 */
export function applySafeWebGlDrawingBufferSize(
  gl: DrawingBufferTarget,
  width: number,
  height: number,
  pixelRatio: number,
): boolean {
  if (!isUsableSsbhWebGlHostSize(width, height)) {
    return false;
  }
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new Error(`Drawing buffer pixel ratio must be a positive finite number, got ${pixelRatio}`);
  }
  gl.setPixelRatio(pixelRatio);
  gl.setSize(width, height, false);
  return true;
}

export function buildSsbhWebGlRendererAttempts(
  defaults: SsbhWebGlRendererParameters,
): SsbhWebGlRendererParameters[] {
  const preferred: SsbhWebGlRendererParameters = {
    ...defaults,
    alpha: false,
    failIfMajorPerformanceCaveat: false,
    logarithmicDepthBuffer: defaults.logarithmicDepthBuffer ?? true,
    powerPreference: defaults.powerPreference ?? "high-performance",
  };
  const compatible: SsbhWebGlRendererParameters = {
    ...defaults,
    alpha: false,
    antialias: false,
    failIfMajorPerformanceCaveat: false,
    logarithmicDepthBuffer: false,
    powerPreference: "default",
  };
  return [preferred, compatible];
}

export function createSsbhWebGlRenderer(
  defaults: SsbhWebGlRendererParameters,
  construct: (params: SsbhWebGlRendererParameters) => WebGLRenderer = (params) =>
    new WebGLRenderer(params),
): WebGLRenderer {
  const attempts = buildSsbhWebGlRendererAttempts(defaults);
  let lastError: unknown;
  for (const params of attempts) {
    try {
      return construct(params);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error("Failed to create a WebGL renderer for the SSBH preview");
}
