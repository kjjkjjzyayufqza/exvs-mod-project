import { describe, expect, test } from "vitest";
import { makeEfxbnEffectBlock } from "./efxbnTestFactory";
import {
  EFXBN_BLEND_STATE,
  efxbnCameraFadeAlpha,
  efxbnParticleDrawOrder,
  efxbnParticleSortsFrontToBack,
  efxbnRequiresParticleDepthSort,
  efxbnViewAngleFactor,
  resolveEfxbnCameraFadeRange,
  resolveEfxbnViewAngleRamp,
} from "./efxbnBillboardShading";

const ACTION_FLAG_VIEW_ANGLE_COLOR = 0x0200_0000;
const ACTION_FLAG_CAMERA_FADE = 0x0040_0000;
const EXTRA_FLAG_CAMERA_FADE = 0x1000;
const EXTRA_FLAG_FULL_BRIGHTNESS = 0x2000;

describe("resolveEfxbnViewAngleRamp", () => {
  test("returns null when the block does not enable the view-angle ramp", () => {
    const block = makeEfxbnEffectBlock({
      blurStartColor: [1, 1, 1, 1],
      blurEndColor: [1, 1, 1, 0],
    });

    expect(resolveEfxbnViewAngleRamp(block)).toBeNull();
  });

  test("reads the ramp endpoints, threshold and power when the action flag is set", () => {
    const block = makeEfxbnEffectBlock({
      actionFlags: ACTION_FLAG_VIEW_ANGLE_COLOR,
      blurStartColor: [1, 1, 1, 1],
      blurEndColor: [1, 1, 1, 0],
      blurEnableRange: 0,
      blurFadePower: 2,
    });

    expect(resolveEfxbnViewAngleRamp(block)).toEqual({
      startColor: [1, 1, 1, 1],
      endColor: [1, 1, 1, 0],
      threshold: 0,
      power: 2,
    });
  });
});

describe("efxbnViewAngleFactor", () => {
  test("returns 0 for a quad facing the camera so the ramp keeps the start colour", () => {
    expect(efxbnViewAngleFactor(0, 0, 2)).toBe(0);
  });

  test("returns 1 for a quad seen edge-on so the ramp reaches the end colour", () => {
    expect(efxbnViewAngleFactor(1, 0, 2)).toBe(1);
  });

  test("stays finite when the threshold leaves no ramp span to divide by", () => {
    // A threshold of 1 makes the shader's (rim - t) / (1 - t) a division by zero, which turns
    // the whole vertex colour into NaN and drops the quad for that frame.
    expect(efxbnViewAngleFactor(1, 1, 2)).toBe(0);
    expect(Number.isFinite(efxbnViewAngleFactor(1.5, 1, 2))).toBe(true);
  });

  test("never returns a negative or NaN factor for out-of-range rim values", () => {
    expect(efxbnViewAngleFactor(-1, 0, 2)).toBe(0);
    expect(Number.isFinite(efxbnViewAngleFactor(Number.NaN, 0, 2))).toBe(true);
  });

  test("raises the normalized rim term to the authored power", () => {
    expect(efxbnViewAngleFactor(0.5, 0, 2)).toBeCloseTo(0.25, 6);
    expect(efxbnViewAngleFactor(0.5, 0, 3)).toBeCloseTo(0.125, 6);
  });

  test("stays at 0 until the rim term passes the threshold", () => {
    expect(efxbnViewAngleFactor(0.2, 0.5, 2)).toBe(0);
    expect(efxbnViewAngleFactor(0.5, 0.5, 2)).toBe(0);
    expect(efxbnViewAngleFactor(0.75, 0.5, 1)).toBeCloseTo(0.5, 6);
  });
});

describe("resolveEfxbnCameraFadeRange", () => {
  test("requires the extra flag, the action flag and a non-zero range together", () => {
    const armed = makeEfxbnEffectBlock({
      actionFlags: ACTION_FLAG_CAMERA_FADE,
      extraFlags: EXTRA_FLAG_CAMERA_FADE,
      cameraFadeRange: 10,
    });
    expect(resolveEfxbnCameraFadeRange(armed)).toBe(10);

    expect(
      resolveEfxbnCameraFadeRange(
        makeEfxbnEffectBlock({ actionFlags: ACTION_FLAG_CAMERA_FADE, cameraFadeRange: 10 }),
      ),
    ).toBeNull();
    expect(
      resolveEfxbnCameraFadeRange(
        makeEfxbnEffectBlock({ extraFlags: EXTRA_FLAG_CAMERA_FADE, cameraFadeRange: 10 }),
      ),
    ).toBeNull();
    expect(
      resolveEfxbnCameraFadeRange(
        makeEfxbnEffectBlock({
          actionFlags: ACTION_FLAG_CAMERA_FADE,
          extraFlags: EXTRA_FLAG_CAMERA_FADE,
          cameraFadeRange: 0,
        }),
      ),
    ).toBeNull();
  });
});

describe("efxbnCameraFadeAlpha", () => {
  test("keeps the particle opaque beyond the fade range", () => {
    expect(efxbnCameraFadeAlpha(20, 10)).toBe(1);
  });

  test("hides the particle inside half the fade range", () => {
    expect(efxbnCameraFadeAlpha(4, 10)).toBe(0);
  });

  test("ramps linearly from half the fade range up to the full range", () => {
    expect(efxbnCameraFadeAlpha(7.5, 10)).toBeCloseTo(0.5, 6);
    expect(efxbnCameraFadeAlpha(10, 10)).toBeCloseTo(1, 6);
  });
});

describe("efxbnParticleSortsFrontToBack", () => {
  test("is true only for opaque blocks that also carry the full-brightness extra flag", () => {
    expect(
      efxbnParticleSortsFrontToBack(
        makeEfxbnEffectBlock({
          blendState: EFXBN_BLEND_STATE.opaque,
          extraFlags: EXTRA_FLAG_FULL_BRIGHTNESS,
        }),
      ),
    ).toBe(true);
    expect(
      efxbnParticleSortsFrontToBack(
        makeEfxbnEffectBlock({ blendState: EFXBN_BLEND_STATE.opaque }),
      ),
    ).toBe(false);
    expect(
      efxbnParticleSortsFrontToBack(
        makeEfxbnEffectBlock({
          blendState: EFXBN_BLEND_STATE.additive,
          extraFlags: EXTRA_FLAG_FULL_BRIGHTNESS,
        }),
      ),
    ).toBe(false);
  });
});

describe("efxbnParticleDrawOrder", () => {
  const positions: [number, number, number][] = [
    [0, 0, 1],
    [0, 0, 3],
    [0, 0, 2],
  ];

  test("draws the farthest particle first so transparent quads composite back to front", () => {
    expect(efxbnParticleDrawOrder(positions, [0, 0, 0], false)).toEqual([1, 2, 0]);
  });

  test("draws the nearest particle first when the block sorts front to back", () => {
    expect(efxbnParticleDrawOrder(positions, [0, 0, 0], true)).toEqual([0, 2, 1]);
  });

  test("keeps equidistant particles in their original order", () => {
    const tied: [number, number, number][] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];

    expect(efxbnParticleDrawOrder(tied, [0, 0, 0], false)).toEqual([0, 1, 2]);
  });
});

describe("efxbnRequiresParticleDepthSort", () => {
  test("skips the sort for additive blocks that do not write depth", () => {
    expect(
      efxbnRequiresParticleDepthSort(
        makeEfxbnEffectBlock({ blendState: EFXBN_BLEND_STATE.additive }),
      ),
    ).toBe(false);
  });

  test("sorts additive blocks that write depth", () => {
    expect(
      efxbnRequiresParticleDepthSort(
        makeEfxbnEffectBlock({ blendState: EFXBN_BLEND_STATE.additive, zWriteEnable: 1 }),
      ),
    ).toBe(true);
  });

  test("sorts every block that composites over", () => {
    expect(
      efxbnRequiresParticleDepthSort(
        makeEfxbnEffectBlock({ blendState: EFXBN_BLEND_STATE.alpha }),
      ),
    ).toBe(true);
    expect(
      efxbnRequiresParticleDepthSort(
        makeEfxbnEffectBlock({ blendState: EFXBN_BLEND_STATE.addMix }),
      ),
    ).toBe(true);
  });

  test("skips the sort for opaque blocks, which the depth test alone resolves", () => {
    expect(
      efxbnRequiresParticleDepthSort(
        makeEfxbnEffectBlock({ blendState: EFXBN_BLEND_STATE.opaque }),
      ),
    ).toBe(false);
  });
});
