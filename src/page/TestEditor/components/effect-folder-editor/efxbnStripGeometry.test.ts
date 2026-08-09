import { describe, expect, it } from "vitest";
import {
  AdditiveBlending,
  BackSide,
  ClampToEdgeWrapping,
  CustomBlending,
  DoubleSide,
  FrontSide,
  MirroredRepeatWrapping,
  NoBlending,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RepeatWrapping,
} from "three";
import { EFXBN_ADDRESS_MODE } from "./effectFolderPreviewPlan";
import {
  efxbnBillboardQuadSize,
  efxbnCustomBlendFactors,
  threeBlendState,
  threeSideForEfxbnCullingType,
  threeWrapForEfxbnAddressMode,
  usesEfxbnBorderAddressing,
} from "./EfxbnParticlePreview";
import { EFXBN_BILLBOARD_BASIS, resolveEfxbnBillboardBasis } from "./efxbnSimulation";
import type { EfxbnPreviewParticle, EfxbnStripHistoryNode } from "./efxbnSimulation";
import { buildEfxbnStripMeshData } from "./efxbnStripGeometry";
import { makeEfxbnEffectBlock, makeEfxbnRuntime } from "./efxbnTestFactory";

function stripNode(
  position: [number, number, number],
  width: number,
  color: [number, number, number, number],
): EfxbnStripHistoryNode {
  return { position, width, color };
}

describe("EFXBN strip ribbon geometry", () => {
  it("subdivides history into paired ribbon vertices and fades tail to head", () => {
    const particle = {
      history: [
        stripNode([0, 0, 0], 0.1, [1, 0.5, 0.25, 0.8]),
        stripNode([1, 0, 0], 0.1, [1, 0.5, 0.25, 0.8]),
        stripNode([2, 1, 0], 0.1, [1, 0.5, 0.25, 0.8]),
      ],
      size: [0.2, 0.1],
      color: [1, 0.5, 0.25, 0.8],
    } as EfxbnPreviewParticle;
    // Strip blocks are element type 5; the loader defaults a zero tail rate to 0.3, so
    // this fixture pins the rates explicitly through the runtime record.
    const target = makeEfxbnEffectBlock({
      effectType: 5,
      stripSegmentSplitNum: 2,
      stripTailAlphaRate: 0,
      stripHeadAlphaRate: 1,
      runtime: makeEfxbnRuntime({ stripTailAlphaRate: 0, stripHeadAlphaRate: 1 }),
    });

    const data = buildEfxbnStripMeshData([particle], target, 100);

    expect(data.sides).toHaveLength(10);
    expect(data.indices).toHaveLength(24);
    expect(data.widths[0]).toBeCloseTo(0.1, 6);
    expect(data.colors[3]).toBe(0);
    expect(data.colors.at(-1)).toBeCloseTo(0.8, 6);
  });

  /**
   * `efxConstructDrawBufferStrip3rd` emits one quad per node pair and writes
   * `(uv_prev_u | uv_current_u, edgeV)` into each vertex's UV, where the two edge V values are
   * `base` and `base + 1`. So U runs along the ribbon and V runs across its width.
   */
  it("runs U along the ribbon and V across its width", () => {
    const particle = {
      history: [
        stripNode([0, 0, 0], 0.1, [1, 1, 1, 1]),
        stripNode([1, 0, 0], 0.1, [1, 1, 1, 1]),
      ],
      size: [0.2, 0.1],
      color: [1, 1, 1, 1],
    } as EfxbnPreviewParticle;
    const target = makeEfxbnEffectBlock({ effectType: 5, stripSegmentSplitNum: 1 });

    const data = buildEfxbnStripMeshData([particle], target, 100);

    // Node 0 (tail) at u = 0 on both edges, node 1 (head) at u = 1 on both edges.
    expect(data.uvs.slice(0, 4)).toEqual([0, 0, 0, 1]);
    expect(data.uvs.slice(4, 8)).toEqual([1, 0, 1, 1]);
  });

  /** `EfxExtractedDrawInfoStrip3rd` carries prev/current endpoints and alpha per node. */
  it("uses each node's own width and colour instead of the head particle's", () => {
    const particle = {
      history: [
        stripNode([0, 0, 0], 0.05, [1, 0, 0, 0.25]),
        stripNode([1, 0, 0], 0.4, [0, 0, 1, 1]),
      ],
      size: [0.8, 0.8],
      color: [0, 0, 1, 1],
    } as EfxbnPreviewParticle;
    const target = makeEfxbnEffectBlock({
      effectType: 5,
      stripSegmentSplitNum: 1,
      runtime: makeEfxbnRuntime({ stripTailAlphaRate: 1, stripHeadAlphaRate: 1 }),
    });

    const data = buildEfxbnStripMeshData([particle], target, 100);

    expect(data.widths[0]).toBeCloseTo(0.05, 6);
    expect(data.widths[2]).toBeCloseTo(0.4, 6);
    expect(data.colors.slice(0, 4)).toEqual([1, 0, 0, 0.25]);
    expect(data.colors.slice(8, 12)).toEqual([0, 0, 1, 1]);
  });
});

describe("ColorEx UV-offset distortion", () => {
  /**
   * Mirrors `efxDrawFaceColorExPS` under draw-scheme bit `0x80`, which every ColorEx call site
   * implements in GLSL:
   *
   *   d        = offset.a * (offset.rg - 0.5)
   *   colorUv += d * (distortionU, distortionV)
   *   alpha   *= offset.a
   */
  function colorExSample(
    colorUv: readonly [number, number],
    offsetTexel: readonly [number, number, number, number],
    distortion: readonly [number, number],
    baseAlpha: number,
  ): { colorUv: [number, number]; alpha: number } {
    const [r, g, , a] = offsetTexel;
    return {
      colorUv: [
        colorUv[0] + a * (r - 0.5) * distortion[0],
        colorUv[1] + a * (g - 0.5) * distortion[1],
      ],
      alpha: baseAlpha * a,
    };
  }

  it("displaces the colour UV by the signed offset scaled by alpha and distortion power", () => {
    // A mid-grey offset texel is the neutral point: rg == 0.5 means no displacement.
    expect(colorExSample([0.25, 0.75], [0.5, 0.5, 0, 1], [0.32, 0.32], 1)).toEqual({
      colorUv: [0.25, 0.75],
      alpha: 1,
    });
    // Full red/zero green at full alpha pushes +0.5 * distortion on U and -0.5 on V.
    expect(colorExSample([0.25, 0.75], [1, 0, 0, 1], [0.32, 0.16], 1)).toEqual({
      colorUv: [0.25 + 0.16, 0.75 - 0.08],
      alpha: 1,
    });
  });

  it("scales displacement and alpha by the offset map alpha", () => {
    const half = colorExSample([0, 0], [1, 1, 0, 0.5], [1, 1], 0.8);
    expect(half.colorUv).toEqual([0.25, 0.25]);
    expect(half.alpha).toBeCloseTo(0.4, 6);
    // A fully transparent offset texel kills the particle, which is what discards it.
    expect(colorExSample([0, 0], [1, 1, 0, 0], [1, 1], 1)).toEqual({ colorUv: [0, 0], alpha: 0 });
  });
});

describe("EFXBN billboard basis", () => {
  const withFlags = (actionFlags: number) =>
    makeEfxbnEffectBlock({ effectType: 1, actionFlags, runtime: makeEfxbnRuntime({ actionFlags }) });

  it("selects the basis efxConstructDrawBufferBillboard3rd would pick", () => {
    expect(resolveEfxbnBillboardBasis(withFlags(0))).toBe(EFXBN_BILLBOARD_BASIS.cameraFacing);
    expect(resolveEfxbnBillboardBasis(withFlags(0x80))).toBe(
      EFXBN_BILLBOARD_BASIS.elementRotation,
    );
    expect(resolveEfxbnBillboardBasis(withFlags(0x20))).toBe(EFXBN_BILLBOARD_BASIS.cameraAxis);
    expect(resolveEfxbnBillboardBasis(withFlags(0x2000_0000))).toBe(
      EFXBN_BILLBOARD_BASIS.cameraAxis,
    );
    // The axis test runs first, so it wins over 0x80.
    expect(resolveEfxbnBillboardBasis(withFlags(0xa0))).toBe(EFXBN_BILLBOARD_BASIS.cameraAxis);
  });
});

describe("EFXBN billboard quad size", () => {
  it("keeps the authored sign and magnitude instead of clamping to a positive floor", () => {
    expect(efxbnBillboardQuadSize([-0.4, 0.2], 1)).toEqual([-0.4, 0.2]);
    expect(efxbnBillboardQuadSize([0.001, 0.001], 1)).toEqual([0.001, 0.001]);
    expect(efxbnBillboardQuadSize([0.5, 0.25], 2)).toEqual([1, 0.5]);
  });
});

describe("AddMix variant", () => {
  /**
   * `efxDrawFaceAddMixPS`, read from the DXBC rather than paraphrased:
   *
   * ```text
   * r1        = texel * particleColor
   * r0.x      = 0.8 < max3(r1.xyz)          ; bright
   * discard if r1.w < 0.01
   * r1.xyz    = r1.w * r1.xyz               ; premultiply
   * o0.w      = bright ? 0 : r1.w
   * ```
   *
   * Which is why `blendState == 4` pairs it with ONE / INV_SRC_ALPHA: the shader premultiplies.
   */
  function addMixSample(
    color: readonly [number, number, number, number],
  ): [number, number, number, number] {
    const bright = Math.max(color[0], color[1], color[2]) > 0.8;
    return [color[0] * color[3], color[1] * color[3], color[2] * color[3], bright ? 0 : color[3]];
  }

  it("premultiplies rgb and drops alpha once the texel is bright", () => {
    expect(addMixSample([1, 1, 1, 0.5])).toEqual([0.5, 0.5, 0.5, 0]);
    expect(addMixSample([0.4, 0.2, 0.1, 0.5])).toEqual([0.2, 0.1, 0.05, 0.5]);
    // Exactly at the threshold is not bright: the test is a strict `<`.
    expect(addMixSample([0.8, 0, 0, 1])[3]).toBe(1);
  });
});

describe("blendState and cullingType render state", () => {
  /**
   * `nu::BlendState_x64`'s constructor `sub_140087530` resolves the descriptor through
   * `dword_141AA7CD8` (a D3D11_BLEND permutation) and `dword_141AA7D18` (D3D11_BLEND_OP), which
   * is what proves the namespace. Resolving each preset plus its patch gives ONE/ZERO,
   * SRC_ALPHA/INV_SRC_ALPHA, SRC_ALPHA/ONE and ONE/INV_SRC_ALPHA for blendState 0, 1, 2 and 4.
   */
  it("maps every blendState the shipped corpus contains", () => {
    expect(threeBlendState(0)).toBe(NoBlending);
    expect(threeBlendState(1)).toBe(NormalBlending);
    expect(threeBlendState(2)).toBe(AdditiveBlending);
    expect(threeBlendState(4)).toBe(CustomBlending);
  });

  it("rejects blendState 3, which occurs in none of the 40,309 shipped blocks", () => {
    expect(() => threeBlendState(3)).toThrow(/blendState: 3/);
    expect(() => threeBlendState(9)).toThrow();
  });

  it("gives blendState 4 the premultiplied factors its AddMix pixel shader expects", () => {
    expect(efxbnCustomBlendFactors(4)).toEqual({
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendEquation: expect.any(Number),
    });
    expect(efxbnCustomBlendFactors(2)).toBeNull();
  });

  /** `sub_140177660` remaps 0/1/2 to 2/0/1, and `dword_141AA7C88 = [3, 2, 1]` is D3D11_CULL_MODE. */
  it("maps cullingType through the engine cull table", () => {
    expect(threeSideForEfxbnCullingType(0)).toBe(DoubleSide);
    expect(threeSideForEfxbnCullingType(1)).toBe(FrontSide);
    expect(threeSideForEfxbnCullingType(2)).toBe(BackSide);
    expect(() => threeSideForEfxbnCullingType(3)).toThrow(/cullingType: 3/);
  });
});

describe("hkImageAddressMode mapping", () => {
  it("maps every mode the shipped corpus actually uses", () => {
    // Name table at 0x1415CB9B0: 0 WRAP, 1 MIRROR, 2 CLAMP, 3 BORDER, 4 MIRROR_ONCE.
    // sub_1401777A0 copies the authored value straight into the sampler's U/V/W modes.
    expect(threeWrapForEfxbnAddressMode(EFXBN_ADDRESS_MODE.wrap)).toBe(RepeatWrapping);
    expect(threeWrapForEfxbnAddressMode(EFXBN_ADDRESS_MODE.mirror)).toBe(MirroredRepeatWrapping);
    expect(threeWrapForEfxbnAddressMode(EFXBN_ADDRESS_MODE.clamp)).toBe(ClampToEdgeWrapping);
    // BORDER clamps in WebGL and the shaders zero alpha outside the range instead.
    expect(threeWrapForEfxbnAddressMode(EFXBN_ADDRESS_MODE.border)).toBe(ClampToEdgeWrapping);
    expect(usesEfxbnBorderAddressing(EFXBN_ADDRESS_MODE.border)).toBe(true);
    expect(usesEfxbnBorderAddressing(EFXBN_ADDRESS_MODE.clamp)).toBe(false);
  });

  it("rejects modes it cannot reproduce instead of silently repeating", () => {
    // MIRROR_ONCE has no WebGL equivalent and occurs in zero shipped files.
    expect(() => threeWrapForEfxbnAddressMode(EFXBN_ADDRESS_MODE.mirrorOnce)).toThrow();
    expect(() => threeWrapForEfxbnAddressMode(9)).toThrow();
  });
});
