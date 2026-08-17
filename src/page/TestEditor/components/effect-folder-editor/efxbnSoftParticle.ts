import type { Object3D } from "three";
import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";
import { efxbnRuntime } from "./efxbnSimulation";

/**
 * The two independently gated terms of the `Soft` pixel-shader variant.
 *
 * `sub_1401470F0` produces `0x1` from `enableSoftParticle != 0` and `0x10000` from
 * `extraFlags & 0x40000`; `sub_140188E30` selects the variant when the flag word shares any bit
 * with the `0x10001` mask. Corpus split over the 3,761 drawable blocks in `E:/XB/mod/006effect`:
 * `0x1` on 2,495 (66.3%), `0x10000` on 19 (0.5%).
 */
export const DRAW_SCHEME_SOFT_PARTICLE = 0x1;
export const DRAW_SCHEME_SOFT_COLOR_SCALE = 0x10000;

/**
 * Value the scene-depth target holds where nothing wrote depth.
 *
 * The pass clears to zero and only depth writers overwrite it. In game the term is computed
 * against a depth buffer cleared to the far plane, which linearizes to a value far beyond any
 * particle and saturates the ramp to 1 — so an untouched texel means "infinitely far", not
 * "coincident surface". Encoding that as 0 rather than a large clear colour keeps the pass
 * independent of whether a float clear colour survives the render-target format.
 */
export const EFXBN_SCENE_DEPTH_EMPTY = 0;

/** True when the block's alpha must fade as it approaches whatever is behind it. */
export function efxbnUsesSoftParticle(block: EfxbnEffectSummary): boolean {
  return (efxbnRuntime(block).drawScheme.flag & DRAW_SCHEME_SOFT_PARTICLE) !== 0;
}

/**
 * The fade distance in world units, read through the runtime normalization so an authored 0
 * becomes the loader's 8. No shipped block authors 0, but reading the authored field directly
 * would still be wrong.
 */
export function resolveEfxbnSoftParticleRange(block: EfxbnEffectSummary): number {
  const range = efxbnRuntime(block).softParticleRange;
  if (!Number.isFinite(range) || range <= 0) {
    throw new Error(`EFXBN block ${block.index} has an unusable softParticleRange: ${range}`);
  }
  return range;
}

/**
 * `efxDrawModelSoftPS.yyadorigi.hlsl:66`, with the depth reconstruction already done.
 *
 * ```text
 * linearScene = CB0_m0[1].x / (depthSample - CB0_m0[0].w)     // hardware depth -> view depth
 * alpha      *= clamp((linearScene - TEXCOORD_2.w) / CB1_m0[1].z, 0, 1)
 * ```
 *
 * `TEXCOORD_2.w` is the fragment's clip `w`, which under a perspective projection is its own
 * linear view depth, and `CB1_m0[1].z` is `softParticleRange`. The preview renders view depth
 * into the target directly, so the `A / (z - B)` reconstruction has no counterpart here.
 *
 * The factor multiplies the already-composed alpha (texel × vertex colour × ColorEx) and is
 * applied *before* the `< 0.01` discard — the combined shader discards on the faded value.
 */
export function efxbnSoftParticleAlphaFactor(
  sceneViewDepth: number,
  fragmentViewDepth: number,
  range: number,
): number {
  if (!Number.isFinite(range) || range <= 0) {
    throw new Error(`Soft particle range must be a positive number, received ${range}`);
  }
  if (sceneViewDepth === EFXBN_SCENE_DEPTH_EMPTY) return 1;
  const ratio = (sceneViewDepth - fragmentViewDepth) / range;
  return Math.min(1, Math.max(0, ratio));
}

/**
 * Texel dimensions for the scene-depth target.
 *
 * The lookup is `gl_Position.xy / gl_Position.w`, so the target has to match the drawing buffer
 * one-to-one or the sampled depth belongs to a different pixel.
 */
export function resolveEffectSceneDepthTargetSize(
  width: number,
  height: number,
): [number, number] {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Scene depth target size must be finite, received ${width}x${height}`);
  }
  return [Math.max(1, Math.round(width)), Math.max(1, Math.round(height))];
}

/**
 * Layer reserved for the depth pre-pass. Members keep layer 0, so this only adds a second
 * channel the pass camera can select; the main render is unaffected.
 */
export const EFFECT_SCENE_DEPTH_LAYER = 7;

/**
 * Moves the depth-contributing subtree from one root to another.
 *
 * Both halves matter: without the disable, a model the user swapped away from keeps occluding
 * particles from wherever it used to stand, and the fade then reads as a bug in the simulation.
 */
export function applyEffectSceneDepthLayer(
  previousRoot: Object3D | null,
  nextRoot: Object3D | null,
  layer: number = EFFECT_SCENE_DEPTH_LAYER,
): void {
  if (previousRoot && previousRoot !== nextRoot) {
    previousRoot.traverse((object) => object.layers.disable(layer));
  }
  nextRoot?.traverse((object) => object.layers.enable(layer));
}
