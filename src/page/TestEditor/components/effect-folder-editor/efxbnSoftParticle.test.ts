import { describe, expect, it } from "vitest";
import { Group, Object3D } from "three";
import {
  DRAW_SCHEME_SOFT_COLOR_SCALE,
  DRAW_SCHEME_SOFT_PARTICLE,
  EFFECT_SCENE_DEPTH_LAYER,
  EFXBN_SCENE_DEPTH_EMPTY,
  applyEffectSceneDepthLayer,
  efxbnSoftParticleAlphaFactor,
  efxbnUsesSoftParticle,
  resolveEfxbnSoftParticleRange,
  resolveEffectSceneDepthTargetSize,
} from "./efxbnSoftParticle";
import { makeEfxbnEffectBlock, makeEfxbnRuntime } from "./efxbnTestFactory";

describe("efxbnUsesSoftParticle", () => {
  it("reads the draw-scheme bit rather than the authored enableSoftParticle field", () => {
    // The producer is `enableSoftParticle != 0`, but the block the preview draws is the
    // normalized one, and only `runtime.drawScheme.flag` carries the resolved bit.
    const block = makeEfxbnEffectBlock({
      enableSoftParticle: 0,
      runtime: makeEfxbnRuntime({ drawScheme: { flag: DRAW_SCHEME_SOFT_PARTICLE, meshMultiUvFlag: 0 } }),
    });
    expect(efxbnUsesSoftParticle(block)).toBe(true);
  });

  it("is false when the flag word carries other variants but not Soft", () => {
    const block = makeEfxbnEffectBlock({
      enableSoftParticle: 1,
      runtime: makeEfxbnRuntime({ drawScheme: { flag: 0x80 | 0x40, meshMultiUvFlag: 0 } }),
    });
    expect(efxbnUsesSoftParticle(block)).toBe(false);
  });

  it("does not confuse the colour-scaling half of the Soft variant with the alpha half", () => {
    // 0x10001 selects the Soft pixel shader, but its two terms are independently gated.
    const block = makeEfxbnEffectBlock({
      runtime: makeEfxbnRuntime({
        drawScheme: { flag: DRAW_SCHEME_SOFT_COLOR_SCALE, meshMultiUvFlag: 0 },
      }),
    });
    expect(efxbnUsesSoftParticle(block)).toBe(false);
  });
});

describe("resolveEfxbnSoftParticleRange", () => {
  it("returns the runtime range, which already substitutes 8 for an authored 0", () => {
    const block = makeEfxbnEffectBlock({ softParticleRange: 0 });
    expect(resolveEfxbnSoftParticleRange(block)).toBe(8);
  });

  it("returns the authored range when it is non-zero", () => {
    const block = makeEfxbnEffectBlock({ softParticleRange: 5 });
    expect(resolveEfxbnSoftParticleRange(block)).toBe(5);
  });

  it("throws rather than substituting a default when the range is not usable", () => {
    const block = makeEfxbnEffectBlock({
      runtime: makeEfxbnRuntime({ softParticleRange: -3 }),
    });
    expect(() => resolveEfxbnSoftParticleRange(block)).toThrow(/softParticleRange/);
  });
});

describe("efxbnSoftParticleAlphaFactor", () => {
  // efxDrawModelSoftPS.yyadorigi.hlsl:66
  //   clamp(((CB0_m0[1].x / (depth - CB0_m0[0].w)) - TEXCOORD_2.w) / CB1_m0[1].z, 0, 1)
  // The division reconstructs the linear view depth of whatever wrote the depth buffer, and
  // TEXCOORD_2.w is the fragment's own clip w, which for a perspective projection is its
  // linear view depth. So the whole term is (sceneViewDepth - fragmentViewDepth) / range.
  it("fades to nothing where the particle sits exactly on the surface behind it", () => {
    expect(efxbnSoftParticleAlphaFactor(10, 10, 5)).toBe(0);
  });

  it("ramps linearly across the authored range", () => {
    expect(efxbnSoftParticleAlphaFactor(10, 8, 4)).toBeCloseTo(0.5, 6);
    expect(efxbnSoftParticleAlphaFactor(10, 9, 4)).toBeCloseTo(0.25, 6);
  });

  it("saturates to 1 once the particle clears the range", () => {
    expect(efxbnSoftParticleAlphaFactor(20, 10, 5)).toBe(1);
  });

  it("clamps to 0 for a particle behind the surface instead of going negative", () => {
    expect(efxbnSoftParticleAlphaFactor(10, 14, 5)).toBe(0);
  });

  it("treats an untouched depth pixel as infinitely far, which is what a cleared buffer means", () => {
    // The pass clears the target to 0 and only depth writers overwrite it. In game the depth
    // buffer is cleared to the far plane, where the term saturates — same result, and the
    // sentinel avoids depending on a float clear colour surviving the render target format.
    expect(efxbnSoftParticleAlphaFactor(EFXBN_SCENE_DEPTH_EMPTY, 3, 5)).toBe(1);
  });

  it("rejects a non-positive range rather than dividing by zero", () => {
    expect(() => efxbnSoftParticleAlphaFactor(10, 5, 0)).toThrow(/range/);
  });
});

describe("resolveEffectSceneDepthTargetSize", () => {
  it("mirrors the drawing buffer so the screen-space lookup lands on the same pixel", () => {
    expect(resolveEffectSceneDepthTargetSize(1280, 720)).toEqual([1280, 720]);
  });

  it("rounds fractional device-pixel-ratio sizes to whole texels", () => {
    expect(resolveEffectSceneDepthTargetSize(1279.5, 719.2)).toEqual([1280, 719]);
  });

  it("never produces a zero-sized target for a collapsed panel", () => {
    expect(resolveEffectSceneDepthTargetSize(0, 0)).toEqual([1, 1]);
  });

  it("rejects a size that is not a finite number", () => {
    expect(() => resolveEffectSceneDepthTargetSize(Number.NaN, 720)).toThrow(/size/);
  });
});

describe("applyEffectSceneDepthLayer", () => {
  function makeHost(): { root: Group; child: Object3D } {
    const root = new Group();
    const child = new Object3D();
    root.add(child);
    return { root, child };
  }

  it("enables the pass layer on the whole subtree, not just the root", () => {
    const { root, child } = makeHost();
    applyEffectSceneDepthLayer(null, root);
    expect(root.layers.isEnabled(EFFECT_SCENE_DEPTH_LAYER)).toBe(true);
    expect(child.layers.isEnabled(EFFECT_SCENE_DEPTH_LAYER)).toBe(true);
  });

  it("keeps the subtree on the default layer so the main render is unchanged", () => {
    const { root, child } = makeHost();
    applyEffectSceneDepthLayer(null, root);
    expect(child.layers.isEnabled(0)).toBe(true);
  });

  it("removes the previous host so a swapped-out model stops occluding particles", () => {
    const previous = makeHost();
    const next = makeHost();
    applyEffectSceneDepthLayer(null, previous.root);
    applyEffectSceneDepthLayer(previous.root, next.root);
    expect(previous.child.layers.isEnabled(EFFECT_SCENE_DEPTH_LAYER)).toBe(false);
    expect(next.child.layers.isEnabled(EFFECT_SCENE_DEPTH_LAYER)).toBe(true);
  });

  it("clears the layer when the host is removed entirely", () => {
    const { root, child } = makeHost();
    applyEffectSceneDepthLayer(null, root);
    applyEffectSceneDepthLayer(root, null);
    expect(child.layers.isEnabled(EFFECT_SCENE_DEPTH_LAYER)).toBe(false);
  });

  it("is idempotent when the host has not changed", () => {
    const { root, child } = makeHost();
    applyEffectSceneDepthLayer(null, root);
    applyEffectSceneDepthLayer(root, root);
    expect(child.layers.isEnabled(EFFECT_SCENE_DEPTH_LAYER)).toBe(true);
  });

  it("covers meshes added after the first call, which is how async draws arrive", () => {
    const { root } = makeHost();
    applyEffectSceneDepthLayer(null, root);
    const late = new Object3D();
    root.add(late);
    expect(late.layers.isEnabled(EFFECT_SCENE_DEPTH_LAYER)).toBe(false);
    applyEffectSceneDepthLayer(root, root);
    expect(late.layers.isEnabled(EFFECT_SCENE_DEPTH_LAYER)).toBe(true);
  });
});
