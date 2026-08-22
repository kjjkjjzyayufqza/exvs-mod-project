import type {
  EfxbnDrawScheme,
  EfxbnEffectSummary,
  EfxbnModelControlSummary,
  EfxbnRuntimeNormalization,
} from "@/services/effectFolder/effectFolderService";

/**
 * TypeScript mirror of the loader normalization (`sub_140146590` + `sub_1401470F0`), which the
 * Rust parser implements as `normalize_efxbn_block` / `efxbn_draw_scheme`.
 *
 * The editor needs this because `runtime` is **derived, never authored**: after an edit the
 * preview must see the normalized values without a disk round-trip, and a preview that reads a
 * stale `runtime` shows a file that does not exist. Every renderer and simulation path in this
 * folder reads `runtime`, so getting this wrong is invisible until the game disagrees.
 *
 * Two mirrors of one rule set is a drift risk, which is why `assertEfxbnRuntimeParity` runs this
 * derivation against the backend's own output for every block of every file the editor opens.
 */

const NORMALIZE_EPSILON = 0.000_001;
const DEFAULT_SOFT_PARTICLE_RANGE = 8;
const DEFAULT_STRIP_ALPHA_RATE = 0.3;
const STRIP_SEGMENT_LIFE_FACTOR = 16;

const ACTION_FLAG_LOOP = 0x1;
const ACTION_FLAG_FORCE_LOOP = 0x0800_0000;
const ACTION_FLAG_CLEAR_LOOP = 0x0080_0000;
const ACTION_FLAG_DRAW_800 = 0x800;
const ACTION_FLAG_DRAW_1000000 = 0x0100_0000;
const ACTION_FLAG_DRAW_2000000 = 0x0200_0000;

const EXTRA_FLAG_FULL_BRIGHTNESS = 0x2000;
const EXTRA_FLAG_DEPTH_EMISSION = 0x0004_0000;

const LIGHTING_FLAG_DIRECTIONAL = 0x1;
const LIGHTING_FLAG_REFLECTION = 0x4;
const LIGHTING_FLAG_NORMAL_MAP = 0x8;

const BLEND_STATE_ADD_MIX = 4;
const MODEL_CONTROL_INPUT_SOURCE_BOUND = 1;

const DRAW_SCHEME_ENABLED_TYPES = new Set([1, 3, 5]);

const SCHEME_SOFT_PARTICLE = 0x1;
const SCHEME_ACTION_800 = 0x2;
const SCHEME_LIGHTING_1 = 0x4;
const SCHEME_NORMAL_MAP = 0x8;
const SCHEME_Z_TEST = 0x10;
const SCHEME_Z_WRITE = 0x20;
const SCHEME_ADD_MIX = 0x40;
const SCHEME_UV_OFFSET_MAP = 0x80;
const SCHEME_ACTION_1000000 = 0x100;
const SCHEME_COLOR_MAP_SOURCED = 0x200;
const SCHEME_ACTION_2000000 = 0x400;
const SCHEME_LIGHTING_4 = 0x800;
const SCHEME_MULTI_UV = 0x1000;
const SCHEME_MULTI_UV_OFFSET_MAP = 0x2000;
const SCHEME_MULTI_UV_COLOR_MAP = 0x4000;
const SCHEME_EXTRA_2000 = 0x8000;
const SCHEME_EXTRA_40000 = 0x1_0000;
const SCHEME_LIGHTING_8 = 0x2_0000;
const SCHEME_FULL_BRIGHTNESS = 0x4_0000;

/** Wrapper types adopt a type derived from their first child, and the mapping is not identity. */
const WRAPPER_ADOPTED_TYPE: Readonly<Record<number, number>> = {
  1: 0,
  3: 2,
  5: 4,
  6: 7,
};

function boundColorMap(controls: readonly EfxbnModelControlSummary[], slot: number): boolean {
  if (slot < 0) return false;
  const control = controls[slot];
  return control !== undefined && control.inputSourceType === MODEL_CONTROL_INPUT_SOURCE_BOUND;
}

function deriveDrawScheme(
  block: EfxbnEffectSummary,
  elementType: number,
  modelControls: readonly EfxbnModelControlSummary[],
): EfxbnDrawScheme {
  // The gate reads the AUTHORED type; the mesh walk below reads the normalized one.
  if (!DRAW_SCHEME_ENABLED_TYPES.has(block.effectType)) {
    return { flag: 0, meshMultiUvFlag: 0 };
  }

  let flag = 0;
  if (block.enableSoftParticle !== 0) flag |= SCHEME_SOFT_PARTICLE;
  if ((block.actionFlags & ACTION_FLAG_DRAW_800) !== 0) flag |= SCHEME_ACTION_800;
  if ((block.lightingFlags & LIGHTING_FLAG_DIRECTIONAL) !== 0) flag |= SCHEME_LIGHTING_1;
  if (block.normalMapHash !== 0) flag |= SCHEME_NORMAL_MAP;
  if (block.zTestEnable !== 0) flag |= SCHEME_Z_TEST;
  // Authored, not normalized: the producer runs before the zWrite override in the corpus data.
  if (block.zWriteEnable !== 0) flag |= SCHEME_Z_WRITE;
  if (block.blendState === BLEND_STATE_ADD_MIX) flag |= SCHEME_ADD_MIX;
  if (block.uvTextureParameterIndex[0] !== -1) flag |= SCHEME_UV_OFFSET_MAP;
  if ((block.actionFlags & ACTION_FLAG_DRAW_1000000) !== 0) flag |= SCHEME_ACTION_1000000;
  if ((block.actionFlags & ACTION_FLAG_DRAW_2000000) !== 0) flag |= SCHEME_ACTION_2000000;
  if ((block.lightingFlags & LIGHTING_FLAG_REFLECTION) !== 0) flag |= SCHEME_LIGHTING_4;
  if ((block.extraFlags & EXTRA_FLAG_FULL_BRIGHTNESS) !== 0) {
    // 0x8000 and 0x40000 test the same extraFlags bit; confirmed at instruction level.
    flag |= SCHEME_EXTRA_2000 | SCHEME_FULL_BRIGHTNESS;
  }
  if ((block.extraFlags & EXTRA_FLAG_DEPTH_EMISSION) !== 0) flag |= SCHEME_EXTRA_40000;
  if ((block.lightingFlags & LIGHTING_FLAG_NORMAL_MAP) !== 0) flag |= SCHEME_LIGHTING_8;
  if (boundColorMap(modelControls, block.colorTextureParameterIndex[0])) {
    flag |= SCHEME_COLOR_MAP_SOURCED;
  }

  let meshMultiUvFlag = 0;
  if (elementType === 3) {
    meshMultiUvFlag |= SCHEME_MULTI_UV;
    if (block.uvTextureParameterIndex[1] !== -1) meshMultiUvFlag |= SCHEME_MULTI_UV_OFFSET_MAP;
    if (boundColorMap(modelControls, block.colorTextureParameterIndex[1])) {
      meshMultiUvFlag |= SCHEME_MULTI_UV_COLOR_MAP;
    }
  }

  return { flag: flag >>> 0, meshMultiUvFlag: meshMultiUvFlag >>> 0 };
}

/**
 * Recomputes one block's `runtime` from its authored fields.
 *
 * `firstChild` is only consulted for type-9 wrappers, which adopt a type from their first child.
 */
export function deriveEfxbnRuntime(
  block: EfxbnEffectSummary,
  firstChild: EfxbnEffectSummary | null,
  modelControls: readonly EfxbnModelControlSummary[],
): EfxbnRuntimeNormalization {
  let elementType = block.effectType;
  if (block.childIndexSize !== 0 && elementType === 9 && firstChild) {
    const adopted = WRAPPER_ADOPTED_TYPE[firstChild.effectType];
    if (adopted !== undefined) elementType = adopted;
  }

  let zWriteEnable = block.zWriteEnable;
  if (block.blendState === 0) zWriteEnable = 1;
  if (block.enableSoftParticle !== 0) zWriteEnable = 0;

  const softParticleRange =
    Math.abs(block.softParticleRange) < NORMALIZE_EPSILON
      ? DEFAULT_SOFT_PARTICLE_RANGE
      : block.softParticleRange;

  let actionFlags = block.actionFlags;
  let deleteSettings = block.deleteSettings;
  if ((actionFlags & ACTION_FLAG_FORCE_LOOP) !== 0) actionFlags |= ACTION_FLAG_LOOP;
  if ((actionFlags & ACTION_FLAG_CLEAR_LOOP) !== 0) {
    deleteSettings &= ~2;
    actionFlags &= ~ACTION_FLAG_LOOP;
  }

  const isStrip = elementType === 5;
  const stripSegmentLife =
    isStrip && block.stripSegmentLife < 0
      ? block.stripSegmentInterval * STRIP_SEGMENT_LIFE_FACTOR
      : block.stripSegmentLife;
  const stripTailAlphaRate =
    isStrip && Math.abs(block.stripTailAlphaRate) < NORMALIZE_EPSILON
      ? DEFAULT_STRIP_ALPHA_RATE
      : block.stripTailAlphaRate;
  const stripHeadAlphaRate =
    isStrip && Math.abs(block.stripHeadAlphaRate) < NORMALIZE_EPSILON
      ? DEFAULT_STRIP_ALPHA_RATE
      : block.stripHeadAlphaRate;

  if (elementType === 10 && block.postEffectType !== 2) actionFlags &= ~ACTION_FLAG_LOOP;

  return {
    elementType,
    actionFlags: actionFlags >>> 0,
    deleteSettings: deleteSettings >>> 0,
    zWriteEnable,
    softParticleRange,
    stripSegmentLife,
    stripTailAlphaRate,
    stripHeadAlphaRate,
    internalElementDataIndex: block.index,
    drawScheme: deriveDrawScheme(block, elementType, modelControls),
  };
}

function sameRuntime(
  left: EfxbnRuntimeNormalization | undefined,
  right: EfxbnRuntimeNormalization,
): boolean {
  if (!left) return false;
  return (
    left.elementType === right.elementType &&
    left.actionFlags === right.actionFlags &&
    left.deleteSettings === right.deleteSettings &&
    left.zWriteEnable === right.zWriteEnable &&
    left.internalElementDataIndex === right.internalElementDataIndex &&
    Object.is(left.softParticleRange, right.softParticleRange) &&
    Object.is(left.stripSegmentLife, right.stripSegmentLife) &&
    Object.is(left.stripTailAlphaRate, right.stripTailAlphaRate) &&
    Object.is(left.stripHeadAlphaRate, right.stripHeadAlphaRate) &&
    left.drawScheme.flag === right.drawScheme.flag &&
    left.drawScheme.meshMultiUvFlag === right.drawScheme.meshMultiUvFlag
  );
}

/**
 * Re-derives `runtime` for every block, resolving each wrapper's first child by index.
 *
 * A block whose derived runtime is unchanged is returned **by identity**. Every consumer
 * downstream — the preview plan, the R3F draw memoization, the dirty ledger — keys off object
 * identity, so rebuilding all of them on every keystroke would remount the scene for an edit that
 * touched one field. Full re-derivation is still correct: a type-9 wrapper adopts its first
 * child's type, so an edit really can change another block's runtime.
 */
export function deriveEfxbnRuntimeForAll(
  blocks: readonly EfxbnEffectSummary[],
  modelControls: readonly EfxbnModelControlSummary[],
): EfxbnEffectSummary[] {
  return blocks.map((block) => {
    const firstChildIndex = block.childIndexSize > 0 ? block.childIndexArray[0] : -1;
    const firstChild =
      firstChildIndex >= 0 && firstChildIndex < blocks.length
        ? (blocks[firstChildIndex] ?? null)
        : null;
    const runtime = deriveEfxbnRuntime(block, firstChild, modelControls);
    return sameRuntime(block.runtime, runtime) ? block : { ...block, runtime };
  });
}

/**
 * Float comparison for the three normalized float fields.
 *
 * The backend computes these in `f32` and JSON-decodes them into `f64`, so an exact comparison
 * would flag a ULP difference in `stripSegmentInterval * 16` as drift.
 */
function floatsAgree(left: number, right: number): boolean {
  if (Object.is(left, right)) return true;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= 1e-5 * Math.max(1, Math.abs(left), Math.abs(right));
}

/**
 * Fails loudly when this mirror disagrees with the backend's own normalization.
 *
 * Runs over every block of every file the editor opens, so drift between the two implementations
 * surfaces as an error on the file that exposes it rather than as a preview that quietly shows
 * something the game will not.
 */
export function assertEfxbnRuntimeParity(
  blocks: readonly EfxbnEffectSummary[],
  modelControls: readonly EfxbnModelControlSummary[],
): void {
  const derived = deriveEfxbnRuntimeForAll(blocks, modelControls);
  for (let index = 0; index < blocks.length; index += 1) {
    const backend = blocks[index]?.runtime;
    const mirror = derived[index]?.runtime;
    if (!backend || !mirror) continue;
    const exact: (keyof EfxbnRuntimeNormalization)[] = [
      "elementType",
      "actionFlags",
      "deleteSettings",
      "zWriteEnable",
      "internalElementDataIndex",
    ];
    for (const field of exact) {
      if (backend[field] !== mirror[field]) {
        throw new Error(
          `EFXBN runtime mirror disagrees with the backend on block ${index} field ${field}: ` +
            `backend ${String(backend[field])}, mirror ${String(mirror[field])}`,
        );
      }
    }
    if (
      backend.drawScheme.flag !== mirror.drawScheme.flag ||
      backend.drawScheme.meshMultiUvFlag !== mirror.drawScheme.meshMultiUvFlag
    ) {
      throw new Error(
        `EFXBN runtime mirror disagrees with the backend on block ${index} drawScheme: ` +
          `backend 0x${backend.drawScheme.flag.toString(16)}/` +
          `0x${backend.drawScheme.meshMultiUvFlag.toString(16)}, ` +
          `mirror 0x${mirror.drawScheme.flag.toString(16)}/` +
          `0x${mirror.drawScheme.meshMultiUvFlag.toString(16)}`,
      );
    }
    const floats: (keyof EfxbnRuntimeNormalization)[] = [
      "softParticleRange",
      "stripSegmentLife",
      "stripTailAlphaRate",
      "stripHeadAlphaRate",
    ];
    for (const field of floats) {
      if (!floatsAgree(backend[field] as number, mirror[field] as number)) {
        throw new Error(
          `EFXBN runtime mirror disagrees with the backend on block ${index} field ${field}: ` +
            `backend ${String(backend[field])}, mirror ${String(mirror[field])}`,
        );
      }
    }
  }
}
