import { describe, expect, test } from "vitest";

import {
  EXVS_GBUFFER_FLAG,
  EXVS_MATERIAL_CLASS,
  createDefaultExvsObjectParams,
  createDefaultExvsRenderSettings,
  readExvsObjectParams,
} from "./exvsRenderSettings";
import { packExvsFlagByte } from "./exvsGBufferMaterial";

describe("readExvsObjectParams", () => {
  test("returns the defaults when a mesh declares nothing", () => {
    // Arrange
    const userData = {};

    // Act
    const params = readExvsObjectParams(userData);

    // Assert
    expect(params).toEqual(createDefaultExvsObjectParams());
  });

  test("returns the defaults for a mesh with no userData at all", () => {
    expect(readExvsObjectParams(undefined)).toEqual(createDefaultExvsObjectParams());
    expect(readExvsObjectParams(null)).toEqual(createDefaultExvsObjectParams());
  });

  test("reads every declared field", () => {
    // Arrange
    const userData = {
      exvs: {
        materialClass: "chara",
        isShadowCaster: false,
        charaBasic: true,
        emissiveScale: 2.5,
        f0: [0.1, 0.2, 0.3],
      },
    };

    // Act
    const params = readExvsObjectParams(userData);

    // Assert
    expect(params.materialClass).toBe("chara");
    expect(params.isShadowCaster).toBe(false);
    expect(params.charaBasic).toBe(true);
    expect(params.emissiveScale).toBe(2.5);
    expect(params.f0).toEqual([0.1, 0.2, 0.3]);
    // Anything left out keeps its default.
    expect(params.isShadowReceiver).toBe(true);
  });

  test("throws when the material class is not one the renderer ships", () => {
    expect(() => readExvsObjectParams({ exvs: { materialClass: "effect" } })).toThrow(
      /unknown materialClass/,
    );
  });

  test("throws on a non-boolean switch rather than coercing it", () => {
    expect(() => readExvsObjectParams({ exvs: { isShadowCaster: 1 } })).toThrow(
      /must be a boolean/,
    );
  });

  test("throws on a non-finite scalar", () => {
    expect(() => readExvsObjectParams({ exvs: { emissiveScale: Number.NaN } })).toThrow(
      /finite number or null/,
    );
  });

  test("throws when f0 is not three numbers", () => {
    expect(() => readExvsObjectParams({ exvs: { f0: [0.1, 0.2] } })).toThrow(
      /three finite numbers or null/,
    );
  });

  test("throws when the declaration is not an object", () => {
    expect(() => readExvsObjectParams({ exvs: "chara" })).toThrow(/must be an object/);
  });

  test("round-trips a whole ExvsObjectParams", () => {
    // Both editors put a complete params object on userData rather than a sparse
    // override, so "not overridden" reaches the reader as the null the type
    // declares, not as a missing key.
    const params = createDefaultExvsObjectParams();

    const roundTripped = readExvsObjectParams({ exvs: params });

    expect(roundTripped).toEqual(params);
  });

  test("round-trips a params object that does override the nullable fields", () => {
    const params = createDefaultExvsObjectParams();
    params.materialClass = "chara";
    params.emissiveScale = 1.75;
    params.diffuseLightingAoOffset = 0.25;
    params.f0 = [0.04, 0.04, 0.04];

    expect(readExvsObjectParams({ exvs: params })).toEqual(params);
  });

  test("treats an explicit null as not overridden", () => {
    const params = readExvsObjectParams({
      exvs: { emissiveScale: null, diffuseLightingAoOffset: null, f0: null },
    });

    expect(params.emissiveScale).toBeNull();
    expect(params.diffuseLightingAoOffset).toBeNull();
    expect(params.f0).toBeNull();
  });
});

describe("packExvsFlagByte", () => {
  test("packs the material class into the high nibble", () => {
    // Arrange
    const params = createDefaultExvsObjectParams();
    params.materialClass = "chara";
    params.isShadowCaster = false;
    params.isShadowReceiver = false;

    // Act
    const flags = packExvsFlagByte(params);

    // Assert
    expect(flags).toBe(EXVS_MATERIAL_CLASS.chara);
  });

  test("packs each switch into its own bit", () => {
    // Arrange
    const params = createDefaultExvsObjectParams();
    params.useLightMap = true;
    params.isShadowCaster = true;
    params.isShadowReceiver = true;
    params.skipLighting = true;

    // Act
    const flags = packExvsFlagByte(params);

    // Assert
    expect(flags & EXVS_GBUFFER_FLAG.lightMap).toBe(EXVS_GBUFFER_FLAG.lightMap);
    expect(flags & EXVS_GBUFFER_FLAG.shadowCaster).toBe(EXVS_GBUFFER_FLAG.shadowCaster);
    expect(flags & EXVS_GBUFFER_FLAG.shadowReceiver).toBe(EXVS_GBUFFER_FLAG.shadowReceiver);
    expect(flags & EXVS_GBUFFER_FLAG.skipLighting).toBe(EXVS_GBUFFER_FLAG.skipLighting);
  });

  test("stays inside one byte so it survives the /255 round trip through the G-buffer", () => {
    // Arrange
    const params = createDefaultExvsObjectParams();
    params.materialClass = "chara";
    params.useLightMap = true;
    params.isShadowCaster = true;
    params.isShadowReceiver = true;
    params.skipLighting = true;

    // Act
    const flags = packExvsFlagByte(params);
    const roundTripped = Math.round((flags / 255) * 255);

    // Assert
    expect(flags).toBeLessThanOrEqual(255);
    expect(roundTripped).toBe(flags);
  });
});

describe("createDefaultExvsRenderSettings", () => {
  test("declares the shipped shaders' own constants", () => {
    // Act
    const settings = createDefaultExvsRenderSettings();

    // Assert
    expect(settings.objectDefaults.roughness).toBeCloseTo(0.95, 5);
    expect(settings.objectDefaults.emissiveScale).toBe(1);
    expect(settings.objectDefaults.diffuseLightingAoOffset).toBe(1);
    expect(settings.charaGBuffer.gBufferRoughnessMultiply).toBe(1);
  });

  test("leaves the bloom threshold below a full-brightness emissive texel", () => {
    // The bright pass is a strict `luma > threshold`. At 1.0 an emissive texel at
    // full brightness sits exactly on the boundary and nothing ever blooms, which
    // is what made emissive maps read as inert.
    const settings = createDefaultExvsRenderSettings();
    expect(settings.bloom.bloomThreshold).toBeLessThan(1);
    expect(settings.bloom.bloomThreshold).toBeGreaterThan(0);
  });

  test("keeps EmissiveScale at the value UpdatePerObject declares", () => {
    expect(createDefaultExvsRenderSettings().objectDefaults.emissiveScale).toBe(1);
  });

  test("returns a fresh object each call so a viewport cannot edit another's settings", () => {
    const first = createDefaultExvsRenderSettings();
    const second = createDefaultExvsRenderSettings();
    first.ibl.iblScaling = 4;
    expect(second.ibl.iblScaling).toBe(1);
  });
});
