import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";
import { efxbnRuntime } from "./efxbnSimulation";

/**
 * The billboard-only per-particle colour paths from `efxConstructDrawBufferBillboard3rd`.
 *
 * That compute shader folds two view-dependent terms into the vertex colour before the pixel
 * shader ever runs, so neither is visible in the `efxDrawFace*` decompilations. The strip and
 * model draw-buffer shaders read neither element field, which is why these live in a
 * billboard-specific module instead of the shared simulation.
 */

/** `blendState` values, named from the D3D11 blend descriptors the engine builds. */
export const EFXBN_BLEND_STATE = {
  opaque: 0,
  alpha: 1,
  additive: 2,
  addMix: 4,
} as const;

/** `actionFlags` bit that enables the view-angle colour ramp (`_248 & 0x02000000`). */
const ACTION_FLAG_VIEW_ANGLE_COLOR = 0x0200_0000;
/** `actionFlags` bit that arms the camera-proximity fade (`_248 & 0x00400000`). */
const ACTION_FLAG_CAMERA_FADE = 0x0040_0000;
/** `extraFlags` bit that enables the camera-proximity fade (`_261 & 0x1000`). */
const EXTRA_FLAG_CAMERA_FADE = 0x1000;
/** `extraFlags` bit that flips the sort key sign on opaque blocks (`_261 & 0x2000`). */
const EXTRA_FLAG_FULL_BRIGHTNESS = 0x2000;
/** The engine's own zero test on `cameraFadeRange`. */
const CAMERA_FADE_EPSILON = 1e-5;
/** Smallest ramp span the divide may use; mirrored in the billboard vertex shader. */
export const RAMP_MIN_SPAN = 1e-5;

/**
 * The view-angle colour ramp a billboard block applies to its vertex colour.
 *
 * The `blur*` field names come from the reflected schema and are wrong: the shader never blurs.
 * It lerps the whole RGBA between two authored colours by how edge-on the quad is to the camera,
 * which is what makes a rotated quad fade out instead of showing a hard opaque sliver. Across the
 * 1,079 shipped billboard blocks that enable it the end colour's alpha is always 0.
 */
export type EfxbnViewAngleRamp = {
  /** Multiplier when the quad faces the camera (`+0x210`, reflected as `blurStartColor`). */
  startColor: readonly [number, number, number, number];
  /** Multiplier when the quad is edge-on (`+0x220`, reflected as `blurEndColor`). */
  endColor: readonly [number, number, number, number];
  /** Rim value below which the ramp stays at `startColor` (`+0x230`). */
  threshold: number;
  /** Exponent applied to the normalized rim term (`+0x234`). */
  power: number;
};

export function resolveEfxbnViewAngleRamp(block: EfxbnEffectSummary): EfxbnViewAngleRamp | null {
  if ((efxbnRuntime(block).actionFlags & ACTION_FLAG_VIEW_ANGLE_COLOR) === 0) return null;
  return {
    startColor: block.blurStartColor,
    endColor: block.blurEndColor,
    threshold: block.blurEnableRange,
    power: block.blurFadePower,
  };
}

/**
 * How far the ramp has travelled from `startColor` towards `endColor`.
 *
 * `rim` is `1 - |dot(normalize(particlePos - cameraPos), quadNormal)|`, so it is 0 for a quad
 * facing the camera and 1 for one seen exactly edge-on. The engine writes the threshold test as a
 * bit mask that zeroes the base before `exp2(log2(base) * power)`, which is this branch.
 */
/**
 * The ramp's 0..1 position for a given rim value.
 *
 * The span guard is not cosmetic: the shader computes this per vertex, and a threshold of 1 or a
 * non-finite rim would divide by zero and turn the whole vertex colour into NaN, which drops the
 * quad for that frame — a flicker rather than a wrong shade.
 */
export function efxbnViewAngleFactor(rim: number, threshold: number, power: number): number {
  if (!Number.isFinite(rim) || rim <= threshold) return 0;
  const span = Math.max(1 - threshold, RAMP_MIN_SPAN);
  return Math.pow((rim - threshold) / span, power);
}

/**
 * The camera-proximity fade range, or null when the block does not enable the fade.
 *
 * All three conditions are ANDed in the shader, and only 15 of the 25,891 shipped drawable blocks
 * satisfy them.
 */
export function resolveEfxbnCameraFadeRange(block: EfxbnEffectSummary): number | null {
  if ((block.extraFlags & EXTRA_FLAG_CAMERA_FADE) === 0) return null;
  if ((efxbnRuntime(block).actionFlags & ACTION_FLAG_CAMERA_FADE) === 0) return null;
  if (Math.abs(block.cameraFadeRange) < CAMERA_FADE_EPSILON) return null;
  return block.cameraFadeRange;
}

/**
 * Alpha scale for a particle `depth` units from the camera along the quad's own normal.
 *
 * Fully hidden inside half the range, linear from there to the full range, untouched beyond it.
 */
export function efxbnCameraFadeAlpha(depth: number, range: number): number {
  if (depth > range) return 1;
  const ratio = depth / range;
  return ratio < 0.5 ? 0 : ratio * 2 - 1;
}

/**
 * Whether the block's sort key is negated, which reverses the draw order to front-to-back.
 *
 * `efxMakeSortInfoBillboardDrawerID3rd` negates the distance only for opaque blocks that also
 * carry the full-brightness extra flag — 17 of the 25,891 shipped drawable blocks.
 */
export function efxbnParticleSortsFrontToBack(block: EfxbnEffectSummary): boolean {
  return (
    block.blendState === EFXBN_BLEND_STATE.opaque &&
    (block.extraFlags & EXTRA_FLAG_FULL_BRIGHTNESS) !== 0
  );
}

/**
 * Particle indices in draw order.
 *
 * `efxMakeSortInfoBillboardDrawerID3rd` keys each particle on its camera distance and
 * `efxSortParticle3rd` bitonically sorts that key **descending**, so the farthest particle draws
 * first. The engine's primary key is the drawer id; the preview already splits one mesh per
 * emitter pair, so only the distance key remains. The engine's `subPriority * 0.001` tiebreak
 * lives in the draw-info buffer rather than the element record and is not modelled here — ties
 * keep their simulation order instead, which `Array.prototype.sort` guarantees.
 */
export function efxbnParticleDrawOrder(
  positions: readonly (readonly [number, number, number])[],
  cameraPosition: readonly [number, number, number],
  frontToBack: boolean,
): number[] {
  const keys = positions.map((position) => {
    const dx = position[0] - cameraPosition[0];
    const dy = position[1] - cameraPosition[1];
    const dz = position[2] - cameraPosition[2];
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return frontToBack ? -distance : distance;
  });
  return keys.map((_key, index) => index).sort((left, right) => keys[right]! - keys[left]!);
}

/**
 * Whether draw order can change the rendered result for this block.
 *
 * `efxSortParticle3rd` sorts every particle unconditionally. The preview skips the sort only
 * where the outcome is provably identical, which keeps the per-frame cost off the 78% additive
 * majority:
 * - `opaque` lets the depth test alone pick the winner.
 * - `additive` is commutative, so only a depth write can make its order observable.
 * - `alpha` and `addMix` composite `over`, which is not commutative.
 */
export function efxbnRequiresParticleDepthSort(block: EfxbnEffectSummary): boolean {
  if (block.blendState === EFXBN_BLEND_STATE.opaque) return false;
  if (block.blendState === EFXBN_BLEND_STATE.additive) {
    return efxbnRuntime(block).zWriteEnable !== 0;
  }
  return true;
}
