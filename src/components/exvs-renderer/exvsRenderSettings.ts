/**
 * Runtime parameters for the EXVS2 (Over Boost) deferred renderer port.
 *
 * Every group mirrors a constant buffer of the shipped OB renderer, and keeps the
 * developers' own field names so a pass can be read against its source shader.
 * The shader each group belongs to is named in its doc comment; the pass graph is
 * described in `docs/exvs2-deferred-renderer.md`.
 *
 * Defaults are the values the shipped shaders declare for their own constants, or
 * the value the engine is observed to bind when a shader declares none.
 */

/** `cbSceneLightInfo` — scene-wide image based lighting state. */
export type ExvsIblSettings = {
  /** `g_UseIBL`. When false the ambient pass is skipped entirely. */
  useIbl: boolean;
  /** `g_IBLScaling`. Linear multiplier on both cube map lookups. */
  iblScaling: number;
  /**
   * `g_IBLWorldInverseMatrix` as a plain Euler yaw in radians.
   * The engine binds a full matrix; a yaw is the only component any shipped
   * stage uses, and it is what the editor exposes.
   */
  iblYaw: number;
};

/** `vsngShadowParameter` — consumed by the ambient pass and the final composite. */
export type ExvsShadowParameter = {
  /** `shadowColor`. Added by the composite where the lighting mask is zero. */
  shadowColor: [number, number, number];
  /** `aoColor`. Ambient occlusion tints toward this instead of pure black. */
  aoColor: [number, number, number];
};

/** `cbSDSM_ShadowMap` + `cbSDSM_Partitions` — sample distribution shadow maps. */
export type ExvsSdsmSettings = {
  enabled: boolean;
  /** Square atlas edge in pixels. Four partitions share it as a 2x2 grid. */
  atlasSize: number;
  /**
   * `g_CameraNearFarAndBias.xy` — the view depths the cascade set covers.
   *
   * This is a shadow range, not the camera's clip range: the depth reduction
   * clamps its samples to it and the first and last partitions are pinned to its
   * ends. Both viewports here run a far plane five million units out, and
   * stretching four partitions across that leaves no depth precision at all, so
   * these are their own numbers. Anything past `shadowFar` is simply lit.
   */
  shadowNear: number;
  shadowFar: number;
  /** `g_CameraNearFarAndBias.z`. Subtracted from the reference before comparison. */
  depthBias: number;
  /** `g_BorderLS`. Light-space padding added around each partition's bounds. */
  borderLightSpace: [number, number, number];
  /** `g_DilationFactor`. Shrinks each partition inside its atlas tile. */
  dilationFactor: number;
  /** `g_MaxScale`. Upper bound on a partition's light-space scale. */
  maxScale: [number, number, number];
};

/** `cbSSAOAttribs` — screen space ambient occlusion. */
export type ExvsSsaoSettings = {
  enabled: boolean;
  /** `radius`. Upper bound of the view-space sampling radius. */
  radius: number;
  /** `threshold`. Depth difference beyond which a sample stops occluding. */
  threshold: number;
  /** `sampleRadiusNum`. Rings of samples. */
  sampleRadiusNum: number;
  /** `sampleRotateNum`. Samples per ring. */
  sampleRotateNum: number;
  /** `maxOcclusion`. Scales the accumulated occlusion before it is inverted. */
  maxOcclusion: number;
  /** `radiusAmount`, `radiusOffset`. Map view depth to the sampling radius. */
  radiusAmount: number;
  radiusOffset: number;
  /** `zscale`. Scales the depth written beside the occlusion. */
  zscale: number;
  /** Whether the separable depth-aware blur runs. */
  blurEnabled: boolean;
  /**
   * `weightParam[2]` — the eight one-sided taps of the separable blur.
   * Index 0 is the centre tap; taps 1..7 are applied symmetrically.
   */
  blurWeights: [number, number, number, number, number, number, number, number];
};

/** `vsngCharaGBufferControl` — per-character G-buffer overrides. */
export type ExvsCharaGBufferControl = {
  /** `GBufferDiffuseMultiply`. `rgb` is a tint, `w` is how far albedo moves to it. */
  gBufferDiffuseMultiply: [number, number, number, number];
  /** `GBufferEmissiveColorMultiply`. Multiplies the sampled emissive. */
  gBufferEmissiveColorMultiply: [number, number, number, number];
  /** `GBufferSpecularMultiply`. */
  gBufferSpecularMultiply: number;
  /** `GBufferRoughnessMultiply`. Scales roughness on the way into the G-buffer. */
  gBufferRoughnessMultiply: number;
  /** `GBufferDamage`. `rgb` is the hit flash colour, `w` its strength. */
  gBufferDamage: [number, number, number, number];
};

/** `vsngCharaBasic` — the additive rim light and environment reflection pass. */
export type ExvsCharaBasicSettings = {
  enabled: boolean;
  /** `FresnelBias`, `FresnelPower`. Shape the reflection's fresnel term. */
  fresnelBias: number;
  fresnelPower: number;
  /** `ReflectionScale`. Multiplies the cube map reflection. */
  reflectionScale: number;
  /** `RimlightColor`. `rgb` is the colour, `w` its intensity. */
  rimlightColor: [number, number, number, number];
  /** `RimlightPower`. Exponent on `1 - dot(V, N)`. */
  rimlightPower: number;
  /** `FresnelRatio`. Global scale on the whole pass. */
  fresnelRatio: number;
};

/** `nuBloomCBuffer`. */
export type ExvsBloomSettings = {
  enabled: boolean;
  /**
   * `bloomThreshold`. Luminance above which a pixel contributes, on Rec. 601
   * weights, as a hard cut with no soft knee.
   *
   * The engine's value is authored per scene and was not captured. This default
   * sits above what a lit surface reaches under either viewport's light rig and
   * below a full-brightness emissive texel, so emissive blooms and ordinary
   * geometry does not.
   */
  bloomThreshold: number;
  /** `blendValue`. Written to alpha by the downsample pass. */
  blendValue: number;
  /** `brightScale`. Multiplies the blurred light buffer on the way back. */
  brightScale: number;
  /** Downsample steps in the chain. Each halves the resolution. */
  iterations: number;
};

/** `nuDOFCBuffer`. */
export type ExvsDofSettings = {
  enabled: boolean;
  /** `subjectDistance`. View-space distance that stays sharp. */
  subjectDistance: number;
  /** `circleOfConfusion`. Scales the relative defocus into a blur amount. */
  circleOfConfusion: number;
  /** `bokehBias`. Biases and scales the saturated blur factor. */
  bokehBias: number;
};

/** `PERSCENE_VSNG` fog and brightness fields consumed by the composite. */
export type ExvsSceneFilterSettings = {
  /** `brightness_ratio`. Squared, then applied to the composited colour. */
  brightnessRatio: number;
  /** `rampfog_rgb_boost`. Multiplies the ramp fog colour. */
  rampfogRgbBoost: number;
  /** `rampfog_alpha_boost`. Multiplies the ramp fog's blend weight. */
  rampfogAlphaBoost: number;
  /** `mapfog_atten_start`, `mapfog_atten_end`. View depth range the fog ramps over. */
  mapfogAttenStart: number;
  mapfogAttenEnd: number;
};

/** `VsngPostFilterParameter` — the screen filters that run after the composite. */
export type ExvsPostFilterSettings = {
  /** `radialBlurParam`. */
  radialBlurEnabled: boolean;
  radialBlurPower: number;
  radialBlurRadiusPower: number;
  radialBlurBlendRate: number;
  radialBlurScreenPos: [number, number];
  /** `addColorParam`. */
  addColorEnabled: boolean;
  addColor: [number, number, number, number];
  addColorRadiusPower: number;
  addColorScreenPos: [number, number];
  /** `colorFilterParam`. Multiplied into the image before the LUT. */
  colorFilterEnabled: boolean;
  colorFilterColor: [number, number, number, number];
  /** `negaFilterParam`. Mirrors the image around a pivot. */
  negativeEnabled: boolean;
  negativePivot: number;
  /** `colorGradingLUTParam.isEnable`. The 3D grading LUT. */
  colorGradingEnabled: boolean;
  /** Whether the composite applies the HSV tone curve LUT. */
  toneCurveEnabled: boolean;
};

/** `cbFxaaAttribs`. */
export type ExvsFxaaSettings = {
  enabled: boolean;
  /** Contrast below which the pixel is left alone. */
  edgeThreshold: number;
  /** Absolute darkness cutoff that skips the filter. */
  edgeThresholdMin: number;
  /** Sub-pixel aliasing removal strength. */
  subpixelQuality: number;
};

/**
 * `UpdatePerObject` defaults.
 *
 * A mesh overrides these through `mesh.userData.exvs`; anything it leaves out
 * falls back to the value the shipped shader declares for that field.
 */
export type ExvsObjectDefaults = {
  /** `F0`. Reflectance of a dielectric at normal incidence. */
  f0: [number, number, number];
  /** `Roughness`. */
  roughness: number;
  /** `EmissiveScale`. */
  emissiveScale: number;
  /** `DiffuseLightingAOOffset`. Lifts ambient occlusion for diffuse only. */
  diffuseLightingAoOffset: number;
  /** `EnableAlphaTest`. The shipped cutoff is a hard 0.95 on base colour alpha. */
  enableAlphaTest: boolean;
  /** `IsShadowReceiver`. */
  isShadowReceiver: boolean;
};

export type ExvsRenderSettings = {
  ibl: ExvsIblSettings;
  shadowParameter: ExvsShadowParameter;
  sdsm: ExvsSdsmSettings;
  ssao: ExvsSsaoSettings;
  charaGBuffer: ExvsCharaGBufferControl;
  charaBasic: ExvsCharaBasicSettings;
  bloom: ExvsBloomSettings;
  dof: ExvsDofSettings;
  sceneFilter: ExvsSceneFilterSettings;
  postFilter: ExvsPostFilterSettings;
  fxaa: ExvsFxaaSettings;
  objectDefaults: ExvsObjectDefaults;
};

/**
 * The material class stored in the high nibble of the G-buffer flag byte.
 *
 * The shipped renderer reads this back in three places: ambient occlusion is
 * skipped for `chara`, and the composite picks a different block of tone curve
 * rows for `chara` than for `background`.
 */
export const EXVS_MATERIAL_CLASS = {
  background: 0,
  chara: 64,
} as const;

export type ExvsMaterialClass = keyof typeof EXVS_MATERIAL_CLASS;

/** Bit flags packed into G-buffer target 2, channel z, as `flags / 255`. */
export const EXVS_GBUFFER_FLAG = {
  /** Emissive is a baked light map rather than a lit surface's emission. */
  lightMap: 1,
  /** `m_isShadowCaster`. */
  shadowCaster: 2,
  /** `IsShadowReceiver`. */
  shadowReceiver: 4,
  /** Lighting passes discard this pixel outright. */
  skipLighting: 8,
} as const;

export function createDefaultExvsRenderSettings(): ExvsRenderSettings {
  return {
    ibl: {
      useIbl: true,
      iblScaling: 1,
      iblYaw: 0,
    },
    shadowParameter: {
      shadowColor: [0, 0, 0],
      aoColor: [0, 0, 0],
    },
    sdsm: {
      enabled: true,
      atlasSize: 2048,
      shadowNear: 1,
      shadowFar: 1000,
      depthBias: 0.0015,
      borderLightSpace: [0.01, 0.01, 0.01],
      dilationFactor: 0.01,
      maxScale: [512, 512, 512],
    },
    ssao: {
      enabled: true,
      radius: 1.2,
      threshold: 0.35,
      sampleRadiusNum: 3,
      sampleRotateNum: 4,
      maxOcclusion: 0.9,
      radiusAmount: 0.08,
      radiusOffset: 0.04,
      zscale: 0.01,
      blurEnabled: true,
      // A normalised 15-tap gaussian, centre first.
      blurWeights: [
        0.1963, 0.1747, 0.1211, 0.0656, 0.0277, 0.0091, 0.0023, 0.0005,
      ],
    },
    charaGBuffer: {
      gBufferDiffuseMultiply: [1, 1, 1, 0],
      gBufferEmissiveColorMultiply: [1, 1, 1, 1],
      gBufferSpecularMultiply: 1,
      gBufferRoughnessMultiply: 1,
      gBufferDamage: [1, 0.15, 0.1, 0],
    },
    charaBasic: {
      enabled: true,
      fresnelBias: 0,
      fresnelPower: 1,
      reflectionScale: 1,
      rimlightColor: [0.42, 0.56, 0.78, 0.55],
      rimlightPower: 3.15,
      fresnelRatio: 1,
    },
    bloom: {
      enabled: true,
      bloomThreshold: 0.75,
      blendValue: 1,
      brightScale: 1,
      iterations: 4,
    },
    dof: {
      enabled: false,
      subjectDistance: 12,
      circleOfConfusion: 1,
      bokehBias: 1,
    },
    sceneFilter: {
      brightnessRatio: 1,
      rampfogRgbBoost: 1,
      rampfogAlphaBoost: 1,
      mapfogAttenStart: 40,
      mapfogAttenEnd: 260,
    },
    postFilter: {
      radialBlurEnabled: false,
      radialBlurPower: 0.2,
      radialBlurRadiusPower: 1,
      radialBlurBlendRate: 0.5,
      radialBlurScreenPos: [0.5, 0.5],
      addColorEnabled: false,
      addColor: [0, 0, 0, 0],
      addColorRadiusPower: 1,
      addColorScreenPos: [0.5, 0.5],
      colorFilterEnabled: false,
      colorFilterColor: [1, 1, 1, 1],
      negativeEnabled: false,
      negativePivot: 0.5,
      colorGradingEnabled: false,
      toneCurveEnabled: false,
    },
    fxaa: {
      enabled: true,
      edgeThreshold: 0.166,
      edgeThresholdMin: 0.0833,
      subpixelQuality: 0.75,
    },
    objectDefaults: {
      f0: [0.7, 0.7, 0.7],
      roughness: 0.95,
      emissiveScale: 1,
      diffuseLightingAoOffset: 1,
      enableAlphaTest: false,
      isShadowReceiver: true,
    },
  };
}

/** Per-mesh overrides read from `mesh.userData.exvs` by the G-buffer pass. */
export type ExvsObjectParams = {
  materialClass: ExvsMaterialClass;
  isShadowCaster: boolean;
  isShadowReceiver: boolean;
  enableAlphaTest: boolean;
  /** Replaces `EmissiveScale` for this mesh. */
  emissiveScale: number | null;
  /** Replaces `DiffuseLightingAOOffset` for this mesh. */
  diffuseLightingAoOffset: number | null;
  /** Replaces `F0` for this mesh. */
  f0: [number, number, number] | null;
  /** Excludes the mesh from every lighting pass, keeping only its emissive. */
  skipLighting: boolean;
  /** Whether the additive `vsngCharaBasic` overlay draws this mesh. */
  charaBasic: boolean;
  /** `UseLightMap`. The emissive slot then carries a baked light map. */
  useLightMap: boolean;
  /** `useBC5NormalMap`. Reconstruct z from a two channel normal map. */
  normalMapBc5: boolean;
};

export function createDefaultExvsObjectParams(): ExvsObjectParams {
  return {
    materialClass: "background",
    isShadowCaster: true,
    isShadowReceiver: true,
    enableAlphaTest: false,
    emissiveScale: null,
    diffuseLightingAoOffset: null,
    f0: null,
    skipLighting: false,
    charaBasic: false,
    useLightMap: false,
    normalMapBc5: false,
  };
}

/**
 * Reads the per-mesh overrides an object carries, falling back to the defaults
 * for anything it does not set. Throws on a malformed override rather than
 * silently rendering the object with the wrong material class.
 */
export function readExvsObjectParams(userData: unknown): ExvsObjectParams {
  const params = createDefaultExvsObjectParams();
  if (userData === null || typeof userData !== "object") return params;
  const raw = (userData as { exvs?: unknown }).exvs;
  if (raw === undefined) return params;
  if (raw === null || typeof raw !== "object") {
    throw new Error("readExvsObjectParams: userData.exvs must be an object");
  }
  const source = raw as Partial<Record<keyof ExvsObjectParams, unknown>>;

  if (source.materialClass !== undefined) {
    const value = source.materialClass;
    if (value !== "background" && value !== "chara") {
      throw new Error(`readExvsObjectParams: unknown materialClass "${String(value)}"`);
    }
    params.materialClass = value;
  }

  const booleanKeys = [
    "isShadowCaster",
    "isShadowReceiver",
    "enableAlphaTest",
    "skipLighting",
    "charaBasic",
    "useLightMap",
    "normalMapBc5",
  ] as const;
  for (const key of booleanKeys) {
    const value = source[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      throw new Error(`readExvsObjectParams: ${key} must be a boolean`);
    }
    params[key] = value;
  }

  // These three carry `null` as their own "not overridden" value, so a mesh that
  // was given a whole ExvsObjectParams reads back the same way one that declared
  // only a couple of fields does.
  const numberKeys = ["emissiveScale", "diffuseLightingAoOffset"] as const;
  for (const key of numberKeys) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`readExvsObjectParams: ${key} must be a finite number or null`);
    }
    params[key] = value;
  }

  if (source.f0 !== undefined && source.f0 !== null) {
    const value = source.f0;
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      value.some((n) => typeof n !== "number" || !Number.isFinite(n))
    ) {
      throw new Error("readExvsObjectParams: f0 must be three finite numbers or null");
    }
    params.f0 = [value[0], value[1], value[2]];
  }

  return params;
}
