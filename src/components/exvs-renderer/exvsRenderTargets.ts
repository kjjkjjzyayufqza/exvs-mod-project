/**
 * Every render target the pipeline owns, and the rules for resizing them.
 *
 * The G-buffer and the two light accumulation buffers are half float. The normal
 * lives in two channels of an equal-area projection, and at eight bits per
 * channel that projection bands visibly across a smooth surface, so the format is
 * not negotiable for target 0; the rest share it because three.js clones one
 * texture description across a multi-target attachment.
 *
 * Ambient occlusion runs at full resolution and only its sample taps read a half
 * resolution depth buffer, which is how the shipped pass is wired: it loads the
 * depth and the normal at the pixel it is shading and only the taps are cheap.
 */

import {
  ClampToEdgeWrapping,
  DepthTexture,
  FloatType,
  HalfFloatType,
  LessEqualCompare,
  LinearFilter,
  NearestFilter,
  RGBAFormat,
  UnsignedIntType,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";

export type ExvsTargetSize = {
  width: number;
  height: number;
};

/** Smallest edge a target is allowed to have, so a collapsed panel cannot make a zero-sized attachment. */
const MIN_TARGET_EDGE = 2;

function clampEdge(value: number): number {
  return Math.max(MIN_TARGET_EDGE, Math.floor(value));
}

function createColorTarget(
  width: number,
  height: number,
  count: number,
  filter: typeof NearestFilter | typeof LinearFilter,
  depthBuffer = false,
): WebGLRenderTarget {
  const target = new WebGLRenderTarget(clampEdge(width), clampEdge(height), {
    count,
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: filter,
    magFilter: filter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  return target;
}

/**
 * The scene G-buffer plus the depth attachment every screen-space pass reads.
 *
 * The depth texture is `UnsignedIntType` rather than a float, because that is
 * what a WebGL2 depth attachment can also be sampled as without an extension.
 */
export function createExvsGBufferTarget(width: number, height: number): WebGLRenderTarget {
  const target = new WebGLRenderTarget(clampEdge(width), clampEdge(height), {
    count: 4,
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    wrapS: ClampToEdgeWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
  });

  const depthTexture = new DepthTexture(clampEdge(width), clampEdge(height));
  depthTexture.type = UnsignedIntType;
  depthTexture.minFilter = NearestFilter;
  depthTexture.magFilter = NearestFilter;
  target.depthTexture = depthTexture;

  for (const texture of target.textures) texture.generateMipmaps = false;
  return target;
}

/** The 2x2 shadow atlas. Depth only, sampled through a comparison sampler. */
export function createExvsShadowAtlasTarget(atlasSize: number): WebGLRenderTarget {
  const size = clampEdge(atlasSize);
  const target = new WebGLRenderTarget(size, size, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
  });

  const depthTexture = new DepthTexture(size, size);
  depthTexture.type = UnsignedIntType;
  depthTexture.minFilter = LinearFilter;
  depthTexture.magFilter = LinearFilter;
  // A comparison sampler is what turns the four-tap hardware filter into the
  // percentage-closer filter the resolve expects.
  depthTexture.compareFunction = LessEqualCompare;
  target.depthTexture = depthTexture;

  return target;
}

/**
 * Owns the whole target set and keeps it sized to the drawing buffer.
 *
 * Resizing reallocates, so it only happens when a dimension actually changes.
 */
export class ExvsRenderTargets {
  gBuffer: WebGLRenderTarget;
  lightAccumulation: WebGLRenderTarget;
  sceneColor: WebGLRenderTarget;
  postPing: WebGLRenderTarget;
  postPong: WebGLRenderTarget;
  halfDepth: WebGLRenderTarget;
  ssao: WebGLRenderTarget;
  ssaoBlur: WebGLRenderTarget;
  shadowAtlas: WebGLRenderTarget;
  bloomChain: WebGLRenderTarget[];
  bloomBlur: WebGLRenderTarget[];
  depthReduceChain: WebGLRenderTarget[];

  private width: number;
  private height: number;
  private atlasSize: number;
  private bloomIterations: number;

  constructor(width: number, height: number, atlasSize: number, bloomIterations: number) {
    this.width = clampEdge(width);
    this.height = clampEdge(height);
    this.atlasSize = clampEdge(atlasSize);
    this.bloomIterations = Math.max(1, bloomIterations);

    this.gBuffer = createExvsGBufferTarget(this.width, this.height);
    this.lightAccumulation = createColorTarget(this.width, this.height, 2, NearestFilter);
    // The composite writes gl_FragDepth into this attachment, which is what lets
    // the additive rim pass and the forward pass after it depth test correctly.
    this.sceneColor = createColorTarget(this.width, this.height, 1, LinearFilter, true);
    this.postPing = createColorTarget(this.width, this.height, 1, LinearFilter);
    this.postPong = createColorTarget(this.width, this.height, 1, LinearFilter);
    this.halfDepth = createColorTarget(this.width >> 1, this.height >> 1, 1, LinearFilter);
    this.ssao = createColorTarget(this.width, this.height, 1, NearestFilter);
    this.ssaoBlur = createColorTarget(this.width, this.height, 1, NearestFilter);
    this.shadowAtlas = createExvsShadowAtlasTarget(this.atlasSize);
    this.bloomChain = [];
    this.bloomBlur = [];
    this.depthReduceChain = [];
    this.rebuildBloomChain();
    this.rebuildDepthReduceChain();
  }

  setSize(width: number, height: number): void {
    const nextWidth = clampEdge(width);
    const nextHeight = clampEdge(height);
    if (nextWidth === this.width && nextHeight === this.height) return;

    this.width = nextWidth;
    this.height = nextHeight;

    this.gBuffer.setSize(nextWidth, nextHeight);
    this.lightAccumulation.setSize(nextWidth, nextHeight);
    this.sceneColor.setSize(nextWidth, nextHeight);
    this.postPing.setSize(nextWidth, nextHeight);
    this.postPong.setSize(nextWidth, nextHeight);
    this.halfDepth.setSize(clampEdge(nextWidth >> 1), clampEdge(nextHeight >> 1));
    this.ssao.setSize(nextWidth, nextHeight);
    this.ssaoBlur.setSize(nextWidth, nextHeight);

    this.rebuildBloomChain();
    this.rebuildDepthReduceChain();
  }

  setShadowAtlasSize(atlasSize: number): void {
    const size = clampEdge(atlasSize);
    if (size === this.atlasSize) return;
    this.atlasSize = size;
    this.shadowAtlas.setSize(size, size);
  }

  setBloomIterations(iterations: number): void {
    const next = Math.max(1, iterations);
    if (next === this.bloomIterations) return;
    this.bloomIterations = next;
    this.rebuildBloomChain();
  }

  getSize(): ExvsTargetSize {
    return { width: this.width, height: this.height };
  }

  dispose(): void {
    this.gBuffer.depthTexture?.dispose();
    this.gBuffer.dispose();
    this.lightAccumulation.dispose();
    this.sceneColor.dispose();
    this.postPing.dispose();
    this.postPong.dispose();
    this.halfDepth.dispose();
    this.ssao.dispose();
    this.ssaoBlur.dispose();
    this.shadowAtlas.depthTexture?.dispose();
    this.shadowAtlas.dispose();
    for (const target of this.bloomChain) target.dispose();
    for (const target of this.bloomBlur) target.dispose();
    for (const target of this.depthReduceChain) target.dispose();
    this.bloomChain.length = 0;
    this.bloomBlur.length = 0;
    this.depthReduceChain.length = 0;
  }

  private rebuildBloomChain(): void {
    for (const target of this.bloomChain) target.dispose();
    for (const target of this.bloomBlur) target.dispose();
    this.bloomChain = [];
    this.bloomBlur = [];

    let width = this.width >> 1;
    let height = this.height >> 1;
    for (let i = 0; i < this.bloomIterations; i += 1) {
      this.bloomChain.push(createColorTarget(width, height, 1, LinearFilter));
      this.bloomBlur.push(createColorTarget(width, height, 1, LinearFilter));
      width = Math.max(MIN_TARGET_EDGE, width >> 1);
      height = Math.max(MIN_TARGET_EDGE, height >> 1);
    }
  }

  /**
   * The halving chain the depth reduction walks down to a single texel, which is
   * where the shadow partitions read the frame's near and far bounds.
   *
   * Full float rather than half: the far value is a view distance in world units
   * and half float runs out of mantissa well before a large stage does.
   */
  private rebuildDepthReduceChain(): void {
    for (const target of this.depthReduceChain) target.dispose();
    this.depthReduceChain = [];

    let width = Math.max(1, this.width >> 1);
    let height = Math.max(1, this.height >> 1);
    while (true) {
      const target = new WebGLRenderTarget(clampEdge(width), clampEdge(height), {
        type: FloatType,
        format: RGBAFormat,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: false,
      });
      this.depthReduceChain.push(target);
      if (width <= MIN_TARGET_EDGE && height <= MIN_TARGET_EDGE) break;
      width = Math.max(1, width >> 1);
      height = Math.max(1, height >> 1);
    }
  }
}

/** Half float render targets need the colour buffer float extension to be linear-filterable. */
export function assertExvsRendererCapabilities(renderer: WebGLRenderer): void {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const drawBuffers = gl.getParameter(gl.MAX_DRAW_BUFFERS) as number;
  if (drawBuffers < 4) {
    throw new Error(
      `ExvsRenderPipeline requires at least 4 draw buffers, this context reports ${drawBuffers}`,
    );
  }
  if (!renderer.extensions.has("EXT_color_buffer_half_float")) {
    throw new Error(
      "ExvsRenderPipeline requires EXT_color_buffer_half_float for its G-buffer attachments",
    );
  }
  if (!renderer.extensions.has("EXT_color_buffer_float")) {
    throw new Error(
      "ExvsRenderPipeline requires EXT_color_buffer_float for the shadow depth reduction",
    );
  }
}
