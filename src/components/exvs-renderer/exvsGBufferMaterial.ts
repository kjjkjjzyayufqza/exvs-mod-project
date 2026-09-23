/**
 * Builds and caches the materials the G-buffer and depth passes draw with.
 *
 * Nothing here changes how a mesh is created. The pipeline swaps a mesh's
 * material for the cached G-buffer material for the duration of one pass and puts
 * the original back, so every existing editor path — numatb binding, texture
 * pooling, skinning, selection highlighting — keeps owning the source material.
 * What the source material carries is read out of it here and re-expressed in the
 * shipped renderer's own terms.
 */

import {
  AdditiveBlending,
  BackSide,
  DoubleSide,
  FrontSide,
  GLSL3,
  Matrix3,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
  type CubeTexture,
  type Material,
  type Side,
  type Texture,
} from "three";

import {
  EXVS_GBUFFER_FLAG,
  EXVS_MATERIAL_CLASS,
  type ExvsObjectParams,
  type ExvsRenderSettings,
} from "./exvsRenderSettings";
import {
  EXVS_ALPHA_TEST_THRESHOLD,
  EXVS_DEPTH_ONLY_FRAGMENT_GLSL,
  EXVS_DEPTH_ONLY_VERTEX_GLSL,
  EXVS_GBUFFER_FRAGMENT_GLSL,
  EXVS_GBUFFER_VERTEX_GLSL,
} from "./shaders/exvsGBufferShader";
import {
  EXVS_CHARA_BASIC_FRAGMENT_GLSL,
  EXVS_CHARA_BASIC_VERTEX_GLSL,
} from "./shaders/exvsCharaBasicShader";

/** The subset of a source material the G-buffer pass reads. */
type ExvsSourceMaterialView = {
  map: Texture | null;
  normalMap: Texture | null;
  roughnessMap: Texture | null;
  metalnessMap: Texture | null;
  emissiveMap: Texture | null;
  aoMap: Texture | null;
  aoMapIntensity: number;
  alphaTest: number;
  lightMap: Texture | null;
  roughness: number;
  metalness: number;
  emissiveIntensity: number;
  baseColorFactor: [number, number, number];
  side: Side;
  wireframe: boolean;
};

const IDENTITY_UV_TRANSFORM = new Matrix3();

function readNumber(source: Record<string, unknown>, key: string, fallback: number): number {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readTexture(source: Record<string, unknown>, key: string): Texture | null {
  const value = source[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || (value as Texture).isTexture !== true) return null;
  return value as Texture;
}

function readSourceMaterial(material: Material): ExvsSourceMaterialView {
  const source = material as unknown as Record<string, unknown>;
  const color = source.color as { r: number; g: number; b: number } | undefined;
  const side = (source.side as Side | undefined) ?? FrontSide;
  return {
    map: readTexture(source, "map"),
    normalMap: readTexture(source, "normalMap"),
    roughnessMap: readTexture(source, "roughnessMap"),
    metalnessMap: readTexture(source, "metalnessMap"),
    emissiveMap: readTexture(source, "emissiveMap"),
    aoMap: readTexture(source, "aoMap"),
    aoMapIntensity: readNumber(source, "aoMapIntensity", 1),
    alphaTest: readNumber(source, "alphaTest", 0),
    lightMap: readTexture(source, "lightMap"),
    roughness: readNumber(source, "roughness", 1),
    metalness: readNumber(source, "metalness", 0),
    emissiveIntensity: readNumber(source, "emissiveIntensity", 1),
    baseColorFactor:
      color === undefined ? [1, 1, 1] : [color.r, color.g, color.b],
    side: side === BackSide || side === DoubleSide ? side : FrontSide,
    wireframe: source.wireframe === true,
  };
}

/**
 * Packs the G-buffer flag byte.
 *
 * The high nibble is the material class the composite and the ambient occlusion
 * blur branch on; the low bits are the per-object switches the lighting and
 * shadow passes read back.
 */
export function packExvsFlagByte(params: ExvsObjectParams): number {
  let flags = EXVS_MATERIAL_CLASS[params.materialClass];
  if (params.useLightMap) flags |= EXVS_GBUFFER_FLAG.lightMap;
  if (params.isShadowCaster) flags |= EXVS_GBUFFER_FLAG.shadowCaster;
  if (params.isShadowReceiver) flags |= EXVS_GBUFFER_FLAG.shadowReceiver;
  if (params.skipLighting) flags |= EXVS_GBUFFER_FLAG.skipLighting;
  return flags;
}

/**
 * The cutoff a draw discards below.
 *
 * A mesh that declares `EnableAlphaTest` gets the engine's own hard 0.95. Anything
 * else cuts at its material's `alphaTest`, so a cutout texture punches the same
 * holes here as it does in the other render styles. Zero disables the test.
 */
function alphaTestThresholdOf(view: ExvsSourceMaterialView, enableAlphaTest: boolean): number {
  return enableAlphaTest ? EXVS_ALPHA_TEST_THRESHOLD : view.alphaTest;
}

function uvTransformOf(texture: Texture | null): Matrix3 {
  if (!texture) return IDENTITY_UV_TRANSFORM;
  texture.updateMatrix();
  return texture.matrix;
}

function variantKey(params: ExvsObjectParams, hasUv1: boolean): string {
  const lightMap = params.useLightMap && hasUv1;
  return [
    params.materialClass,
    lightMap ? "lm" : "-",
    hasUv1 ? "uv1" : "-",
    params.normalMapBc5 ? "bc5" : "-",
    params.enableAlphaTest ? "at" : "-",
    packExvsFlagByte(params),
  ].join("|");
}

/** Values every rim-pass material shares, pushed once per frame. */
export type ExvsCharaBasicFrameState = {
  gBufferNormal: Texture;
  bariSpecularMap: CubeTexture;
  specularMipCount: number;
  keyLightDirection: Vector3;
  viewInverseRotation: Matrix3;
};

/**
 * Caches one material per (source material, variant) pair for each pass that
 * needs its own. Keyed weakly on the source, so a material the editor drops takes
 * its derived materials with it rather than leaking a shader program.
 */
export class ExvsMaterialCache {
  private readonly gBuffer = new WeakMap<Material, Map<string, ShaderMaterial>>();
  private readonly depthOnly = new WeakMap<Material, Map<string, ShaderMaterial>>();
  private readonly charaBasic = new WeakMap<Material, ShaderMaterial>();
  private readonly owned = new Set<ShaderMaterial>();

  getGBufferMaterial(
    source: Material,
    geometry: BufferGeometry,
    params: ExvsObjectParams,
    settings: ExvsRenderSettings,
  ): ShaderMaterial {
    const hasUv1 = geometry.getAttribute("uv2") !== undefined;
    const key = variantKey(params, hasUv1);
    let byVariant = this.gBuffer.get(source);
    if (!byVariant) {
      byVariant = new Map();
      this.gBuffer.set(source, byVariant);
    }
    let material = byVariant.get(key);
    if (!material) {
      material = this.createGBufferMaterial(params, hasUv1);
      byVariant.set(key, material);
      this.owned.add(material);
    }
    this.syncGBufferUniforms(material, source, params, settings, hasUv1);
    return material;
  }

  getDepthOnlyMaterial(source: Material, params: ExvsObjectParams): ShaderMaterial {
    const key = params.enableAlphaTest ? "at" : "-";
    let byVariant = this.depthOnly.get(source);
    if (!byVariant) {
      byVariant = new Map();
      this.depthOnly.set(source, byVariant);
    }
    let material = byVariant.get(key);
    if (!material) {
      material = new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: EXVS_DEPTH_ONLY_VERTEX_GLSL,
        fragmentShader: EXVS_DEPTH_ONLY_FRAGMENT_GLSL,
        uniforms: {
          uBaseColorMap: { value: null },
          uLayer0UVTransform: { value: new Matrix3() },
          uHasBaseColorMap: { value: false },
          uEnableAlphaTest: { value: false },
          uAlphaTestThreshold: { value: 0 },
        },
      });
      material.name = "ExvsDepthOnly";
      byVariant.set(key, material);
      this.owned.add(material);
    }
    const view = readSourceMaterial(source);
    material.uniforms.uBaseColorMap.value = view.map;
    material.uniforms.uHasBaseColorMap.value = view.map !== null;
    (material.uniforms.uLayer0UVTransform.value as Matrix3).copy(uvTransformOf(view.map));
    const depthThreshold = alphaTestThresholdOf(view, params.enableAlphaTest);
    material.uniforms.uEnableAlphaTest.value = depthThreshold > 0;
    material.uniforms.uAlphaTestThreshold.value = depthThreshold;
    material.side = view.side;
    return material;
  }

  /**
   * The additive rim material for one source material.
   *
   * One instance per source rather than one shared instance, so a whole model's
   * meshes still draw in a single pass instead of one render per mesh.
   */
  getCharaBasicMaterial(
    source: Material,
    params: ExvsObjectParams,
    settings: ExvsRenderSettings,
    frame: ExvsCharaBasicFrameState,
  ): ShaderMaterial {
    let material = this.charaBasic.get(source);
    if (!material) {
      material = new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: EXVS_CHARA_BASIC_VERTEX_GLSL,
        fragmentShader: EXVS_CHARA_BASIC_FRAGMENT_GLSL,
        uniforms: {
          uBaseColorMap: { value: null },
          uRoughnesAndMaskMap: { value: null },
          uGBufferNormal: { value: null },
          uBariSpecularMap: { value: null },
          uLayer0UVTransform: { value: new Matrix3() },
          uHasBaseColorMap: { value: false },
          uHasRoughnesAndMaskMap: { value: false },
          uEnableAlphaTest: { value: false },
          uAlphaTestThreshold: { value: 0 },
          uRoughness: { value: 0.5 },
          uSpecularMipCount: { value: 1 },
          uFresnelBias: { value: 0 },
          uFresnelPower: { value: 1 },
          uReflectionScale: { value: 1 },
          uRimlightColor: { value: [0, 0, 0, 0] },
          uRimlightPower: { value: 3 },
          uFresnelRatio: { value: 1 },
          uKeyLightDirection: { value: new Vector3(0, 1, 0) },
          uViewInverseRotation: { value: new Matrix3() },
        },
      });
      material.name = "ExvsCharaBasic";
      material.blending = AdditiveBlending;
      material.depthWrite = false;
      this.charaBasic.set(source, material);
      this.owned.add(material);
    }

    const view = readSourceMaterial(source);
    const basic = settings.charaBasic;
    const u = material.uniforms;

    u.uBaseColorMap.value = view.map;
    u.uHasBaseColorMap.value = view.map !== null;
    u.uRoughnesAndMaskMap.value = view.roughnessMap;
    u.uHasRoughnesAndMaskMap.value = view.roughnessMap !== null;
    u.uRoughness.value = view.roughness;
    const rimThreshold = alphaTestThresholdOf(
      view,
      params.enableAlphaTest || settings.objectDefaults.enableAlphaTest,
    );
    u.uEnableAlphaTest.value = rimThreshold > 0;
    u.uAlphaTestThreshold.value = rimThreshold;
    (u.uLayer0UVTransform.value as Matrix3).copy(uvTransformOf(view.map));

    u.uGBufferNormal.value = frame.gBufferNormal;
    u.uBariSpecularMap.value = frame.bariSpecularMap;
    u.uSpecularMipCount.value = frame.specularMipCount;
    (u.uKeyLightDirection.value as Vector3).copy(frame.keyLightDirection);
    (u.uViewInverseRotation.value as Matrix3).copy(frame.viewInverseRotation);

    u.uFresnelBias.value = basic.fresnelBias;
    u.uFresnelPower.value = basic.fresnelPower;
    u.uReflectionScale.value = basic.reflectionScale;
    u.uRimlightColor.value = basic.rimlightColor;
    u.uRimlightPower.value = basic.rimlightPower;
    u.uFresnelRatio.value = basic.fresnelRatio;

    material.side = view.side;
    return material;
  }

  dispose(): void {
    for (const material of this.owned) material.dispose();
    this.owned.clear();
  }

  private createGBufferMaterial(params: ExvsObjectParams, hasUv1: boolean): ShaderMaterial {
    const defines: Record<string, string> = {};
    if (params.materialClass === "chara") defines.EXVS_CHARA = "1";
    if (hasUv1) defines.EXVS_HAS_UV1 = "1";
    if (params.useLightMap && hasUv1) defines.EXVS_LIGHT_MAP = "1";

    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      defines,
      vertexShader: EXVS_GBUFFER_VERTEX_GLSL,
      fragmentShader: EXVS_GBUFFER_FRAGMENT_GLSL,
      uniforms: {
        uLayer0UVTransform: { value: new Matrix3() },
        uBaseColorMap: { value: null },
        uNormalMap: { value: null },
        uMetallicMap: { value: null },
        uRoughnessMap: { value: null },
        uAmbientOcclusionMap: { value: null },
        uEmissiveMap: { value: null },
        uLightMap: { value: null },
        uHasBaseColorMap: { value: false },
        uUseNormalMap: { value: false },
        uUseBC5NormalMap: { value: false },
        uUseMetallicMap: { value: false },
        uUseRoughnessMap: { value: false },
        uUseAO: { value: false },
        uUseEmissiveMap: { value: false },
        uEnableAlphaTest: { value: false },
        uAlphaTestThreshold: { value: 0 },
        uF0: { value: [0.7, 0.7, 0.7] },
        uRoughness: { value: 0.95 },
        uEmissiveScale: { value: 1 },
        uDiffuseLightingAOOffset: { value: 1 },
        uBaseColorFactor: { value: [1, 1, 1] },
        uAoMapIntensity: { value: 1 },
        uFlagByte: { value: 0 },
        uGBufferDiffuseMultiply: { value: [1, 1, 1, 0] },
        uGBufferEmissiveColorMultiply: { value: [1, 1, 1, 1] },
        uGBufferRoughnessMultiply: { value: 1 },
        uGBufferDamage: { value: [1, 0.15, 0.1, 0] },
      },
    });
    material.name = params.materialClass === "chara" ? "ExvsGBufferChara" : "ExvsGBufferStage";
    return material;
  }

  private syncGBufferUniforms(
    material: ShaderMaterial,
    source: Material,
    params: ExvsObjectParams,
    settings: ExvsRenderSettings,
    hasUv1: boolean,
  ): void {
    const view = readSourceMaterial(source);
    const defaults = settings.objectDefaults;
    const chara = settings.charaGBuffer;
    const u = material.uniforms;

    (u.uLayer0UVTransform.value as Matrix3).copy(uvTransformOf(view.map));

    u.uBaseColorMap.value = view.map;
    u.uNormalMap.value = view.normalMap;
    u.uMetallicMap.value = view.metalnessMap;
    u.uRoughnessMap.value = view.roughnessMap;
    u.uAmbientOcclusionMap.value = view.aoMap;
    u.uEmissiveMap.value = view.emissiveMap;
    u.uLightMap.value = view.lightMap ?? view.emissiveMap;

    u.uHasBaseColorMap.value = view.map !== null;
    u.uUseNormalMap.value = view.normalMap !== null;
    u.uUseBC5NormalMap.value = params.normalMapBc5;
    u.uUseMetallicMap.value = view.metalnessMap !== null;
    u.uUseRoughnessMap.value = view.roughnessMap !== null;
    u.uUseAO.value = view.aoMap !== null;
    u.uAoMapIntensity.value = view.aoMapIntensity;
    u.uUseEmissiveMap.value = view.emissiveMap !== null;
    const alphaTestThreshold = alphaTestThresholdOf(
      view,
      params.enableAlphaTest || defaults.enableAlphaTest,
    );
    u.uEnableAlphaTest.value = alphaTestThreshold > 0;
    u.uAlphaTestThreshold.value = alphaTestThreshold;

    // A source material with no metalness map still carries a scalar; the shipped
    // shader stores it in the same channel it would store F0's red in.
    const f0 = params.f0 ?? [
      view.metalnessMap !== null ? defaults.f0[0] : view.metalness,
      view.metalnessMap !== null ? defaults.f0[1] : view.metalness,
      view.metalnessMap !== null ? defaults.f0[2] : view.metalness,
    ];
    (u.uF0.value as number[])[0] = f0[0];
    (u.uF0.value as number[])[1] = f0[1];
    (u.uF0.value as number[])[2] = f0[2];

    u.uRoughness.value = view.roughness;
    u.uEmissiveScale.value = params.emissiveScale ?? view.emissiveIntensity;
    u.uDiffuseLightingAOOffset.value =
      params.diffuseLightingAoOffset ?? defaults.diffuseLightingAoOffset;
    (u.uBaseColorFactor.value as number[])[0] = view.baseColorFactor[0];
    (u.uBaseColorFactor.value as number[])[1] = view.baseColorFactor[1];
    (u.uBaseColorFactor.value as number[])[2] = view.baseColorFactor[2];

    u.uFlagByte.value = packExvsFlagByte({
      ...params,
      useLightMap: params.useLightMap && hasUv1,
      isShadowReceiver: params.isShadowReceiver && defaults.isShadowReceiver,
    });

    u.uGBufferDiffuseMultiply.value = chara.gBufferDiffuseMultiply;
    u.uGBufferEmissiveColorMultiply.value = chara.gBufferEmissiveColorMultiply;
    u.uGBufferRoughnessMultiply.value = chara.gBufferRoughnessMultiply;
    u.uGBufferDamage.value = chara.gBufferDamage;

    material.side = view.side;
    material.wireframe = view.wireframe;
  }
}
