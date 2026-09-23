import { describe, expect, test } from "vitest";

import type { ResolvedMaterialBinding } from "@/components/ssbh-model-preview/meshFromSsbh";

import { exvsObjectParamsFromBinding } from "./exvsObjectParamsFromBinding";

function makeBinding(overrides: Partial<ResolvedMaterialBinding> = {}): ResolvedMaterialBinding {
  const sampling = {
    wrapS: "Repeat",
    wrapT: "Repeat",
    uvTransform: null,
  } as ResolvedMaterialBinding["sampling"]["map"];

  return {
    materialLabel: "body",
    shaderLabel: "vsngCharaBasic_opaque",
    shaderFamily: "vsngCharaBasic",
    textureRefs: {
      map: "Texture0",
      normal: null,
      roughness: null,
      metalness: null,
      emissive: null,
      ao: null,
      cube: null,
    },
    texturePaths: {} as ResolvedMaterialBinding["texturePaths"],
    renderHints: { isTransparent: false, isSparkle: false },
    uniforms: { fresnelType4V16Hex: null, roughnessScalar: null, metalnessScalar: null },
    sampling: {
      map: sampling,
      normal: sampling,
      roughness: sampling,
      metalness: sampling,
      emissive: sampling,
      ao: sampling,
    },
    ...overrides,
  };
}

describe("exvsObjectParamsFromBinding", () => {
  test("classifies a vsngCharaBasic material as a character that takes the rim pass", () => {
    // Arrange
    const binding = makeBinding();

    // Act
    const params = exvsObjectParamsFromBinding(binding);

    // Assert
    expect(params.materialClass).toBe("chara");
    expect(params.charaBasic).toBe(true);
  });

  test("classifies a vsngCharaSparkle material the same way", () => {
    const binding = makeBinding({
      shaderFamily: "vsngCharaSparkle",
      shaderLabel: "vsngCharaSparkle_opaque",
    });
    const params = exvsObjectParamsFromBinding(binding);
    expect(params.materialClass).toBe("chara");
    expect(params.charaBasic).toBe(true);
  });

  test("classifies anything else as background and skips the rim pass", () => {
    const binding = makeBinding({ shaderFamily: "generic", shaderLabel: "stage_opaque" });
    const params = exvsObjectParamsFromBinding(binding);
    expect(params.materialClass).toBe("background");
    expect(params.charaBasic).toBe(false);
  });

  test("a forced character class does not give background geometry the rim pass", () => {
    // A unit model with no character shader label is still character geometry for
    // the tone curve, but nothing says it reflects like one.
    const binding = makeBinding({ shaderFamily: "generic", shaderLabel: "stage_opaque" });
    const params = exvsObjectParamsFromBinding(binding, { materialClass: "chara" });
    expect(params.materialClass).toBe("chara");
    expect(params.charaBasic).toBe(false);
  });

  test("never infers EnableAlphaTest from the binding", () => {
    // The flag selects the engine's hard 0.95 cutoff, which erases a material that
    // never asked for one. A resolved binding does not carry the numatb flag, so
    // guessing it from "opaque and textured" is not safe; a draw without it still
    // cuts at its own material's alphaTest.
    expect(exvsObjectParamsFromBinding(makeBinding()).enableAlphaTest).toBe(false);

    const blended = makeBinding({ renderHints: { isTransparent: true, isSparkle: false } });
    expect(exvsObjectParamsFromBinding(blended).enableAlphaTest).toBe(false);

    const untextured = makeBinding({
      textureRefs: {
        map: null,
        normal: null,
        roughness: null,
        metalness: null,
        emissive: null,
        ao: null,
        cube: null,
      },
    });
    expect(exvsObjectParamsFromBinding(untextured).enableAlphaTest).toBe(false);
  });

  test("falls back to background with no binding at all", () => {
    const params = exvsObjectParamsFromBinding(null);
    expect(params.materialClass).toBe("background");
    expect(params.charaBasic).toBe(false);
    expect(params.enableAlphaTest).toBe(false);
  });

  test("applies the shadow and light map overrides", () => {
    const params = exvsObjectParamsFromBinding(null, {
      isShadowCaster: false,
      isShadowReceiver: false,
      useLightMap: true,
    });
    expect(params.isShadowCaster).toBe(false);
    expect(params.isShadowReceiver).toBe(false);
    expect(params.useLightMap).toBe(true);
  });
});
