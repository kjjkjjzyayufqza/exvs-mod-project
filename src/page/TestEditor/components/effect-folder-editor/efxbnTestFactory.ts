import type {
  EffectFolderHash,
  EfxbnEffectSummary,
  EfxbnMetaParsedSummary,
  EfxbnRuntimeNormalization,
} from "@/services/effectFolder/effectFolderService";

/**
 * Test-only builders for EFXBN summaries.
 *
 * `EfxbnEffectSummary` mirrors the full 880-byte `SEfxElementData` record, so tests
 * cannot spell out every field. These builders supply neutral defaults and let each
 * test override only the fields it exercises.
 */

export const ZERO_HASH: EffectFolderHash = { signed: 0, unsigned: 0, hex: "0x00000000" };

const ZERO4: [number, number, number, number] = [0, 0, 0, 0];

export function makeEfxbnMetaParsed(
  overrides: Partial<EfxbnMetaParsedSummary> = {},
): EfxbnMetaParsedSummary {
  return {
    unkConfigInfo: [],
    configHeader: {
      number: 0,
      unkFloatA: 0,
      unkIntA: 0,
      unkFloatB: 0,
      unkIntB: 0,
      unkBytes12: [],
      unkFloats4: [0, 0, 0, 0],
    },
    idTablePairs: [],
    controlReferences: [],
    modelId: 0,
    modelHash: ZERO_HASH,
    animationId: 0,
    animationHash: ZERO_HASH,
    unk32: 0,
    unkConfigInfo2: [],
    ...overrides,
  };
}

export function makeEfxbnRuntime(
  overrides: Partial<EfxbnRuntimeNormalization> = {},
): EfxbnRuntimeNormalization {
  return {
    elementType: 1,
    actionFlags: 0,
    deleteSettings: 0,
    zWriteEnable: 0,
    softParticleRange: 8,
    stripSegmentLife: 0,
    stripTailAlphaRate: 0.3,
    stripHeadAlphaRate: 0.3,
    internalElementDataIndex: 0,
    ...overrides,
  };
}

/**
 * Mirrors the loader normalization the backend performs in `normalize_efxbn_block`.
 *
 * Wrapper type resolution is skipped because it needs sibling blocks; a test that
 * exercises it should pass `runtime` explicitly.
 */
function deriveRuntime(block: EfxbnEffectSummary): EfxbnRuntimeNormalization {
  const epsilon = 0.000001;
  let zWriteEnable = block.zWriteEnable;
  if (block.blendState === 0) zWriteEnable = 1;
  if (block.enableSoftParticle !== 0) zWriteEnable = 0;

  let actionFlags = block.actionFlags;
  let deleteSettings = block.deleteSettings;
  if ((actionFlags & 0x0800_0000) !== 0) actionFlags |= 1;
  if ((actionFlags & 0x0080_0000) !== 0) {
    deleteSettings &= ~2;
    actionFlags &= ~1;
  }

  const isStrip = block.effectType === 5;
  if (block.effectType === 10 && block.postEffectType !== 2) actionFlags &= ~1;

  return {
    elementType: block.effectType,
    actionFlags,
    deleteSettings,
    zWriteEnable,
    softParticleRange:
      Math.abs(block.softParticleRange) < epsilon ? 8 : block.softParticleRange,
    stripSegmentLife:
      isStrip && block.stripSegmentLife < 0
        ? block.stripSegmentInterval * 16
        : block.stripSegmentLife,
    stripTailAlphaRate:
      isStrip && Math.abs(block.stripTailAlphaRate) < epsilon
        ? 0.3
        : block.stripTailAlphaRate,
    stripHeadAlphaRate:
      isStrip && Math.abs(block.stripHeadAlphaRate) < epsilon
        ? 0.3
        : block.stripHeadAlphaRate,
    internalElementDataIndex: block.index,
  };
}

export function makeEfxbnEffectBlock(
  overrides: Partial<EfxbnEffectSummary> = {},
): EfxbnEffectSummary {
  const authored: EfxbnEffectSummary = {
    index: 0,
    level: 0,
    childIndexSize: 0,
    childIndexArray: [-1, -1, -1, -1, -1, -1, -1, -1],
    referencedEffectIndex: -1,
    effectType: 1,
    lifeTimeBase: 20,
    lifeTimeRandom: 0,
    intervalBase: 100,
    intervalRandom: 0,
    numEmit: 1,
    actionFlags: 0,
    spawnFormType: 0,
    spawnFormLength: [...ZERO4],
    speedRandom: [...ZERO4],
    sizeBase: [0.1, 0.1, 1, 0],
    sizeRandom: [...ZERO4],
    rotationBase: [...ZERO4],
    rotationRandom: [...ZERO4],
    rotationSpeed: [...ZERO4],
    internalElementDataIndex: 0,
    enableDataFlag: 0,
    nudHandle: 0,
    textureHandle: 0,
    colorTextureParameterIndex: [-1, -1],
    uvTextureParameterIndex: [-1, -1],
    centerPivot: [0, 0],
    deleteSettings: 0,
    fadeTimeBase: 0,
    cullingType: 0,
    zWriteEnable: 0,
    zTestEnable: 0,
    blendState: 0,
    drawRepositoryIndex: 0,
    instanceAmountType: 0,
    drawAmountIndex: 0,
    enableSoftParticle: 0,
    positionOffset: [...ZERO4],
    delayEmitTimeBase: 0,
    emitAreaType: 0,
    enableZSort: 0,
    deleteEffectId: 0,
    deleteEndScale: [...ZERO4],
    lightAttenuationRadius: 0,
    lightingFlags: 0,
    normalMapHash: 0,
    worldWindApplyRate: 0,
    stripSegmentInterval: 0,
    stripSegmentLife: 0,
    stripSegmentSplitNum: 1,
    drawerId: 0,
    softParticleRange: 0,
    cameraFadeRange: 0,
    extraFlags: 0,
    noiseDirectionMaxRot: 0,
    noiseDirectionAreaRange: 0,
    blurStartColor: [...ZERO4],
    blurEndColor: [...ZERO4],
    blurEnableRange: 0,
    blurFadePower: 0,
    lightType: 0,
    lightBaseRadius: 0,
    rotationSpeedRandom: [...ZERO4],
    cameraOffset: 0,
    postEffectType: 0,
    postEffectBlendRate: 0,
    stripTailAlphaRate: 0,
    stripHeadAlphaRate: 0,
    emitInterpolateDistance: 0,
    noiseRotatePosOffset: 0,
    zSortOffset: 0,
    specialShaderType: 0,
    reflectionPower: 0,
    pass2BlendType: 0,
    animationDelayFrame: 0,
    animationLoopStartFrame: 0,
    animationLoopEndFrame: 0,
    animationDeleteFrame: 0,
    animationSpeedRate: 1,
    animationBlendDeleteFrame: 0,
    emitterLodType: 0,
    animationStartFrame: 0,
    boundingSphereInfo: [...ZERO4],
    postEffectShapeRadius: 0,
    worldWaterApplyRate: 0,
    numEmitCountRandom: 0,
    depthEmissionRange: 0,
    depthEmissionPower: 0,
    highlightPower: 0,
    emitInterpolateType: 0,
    meshEmitterIndex: 0,
    meshEmitterCount: 0,
    fieldEffectType: 0,
    fieldEffectPower: 0,
    fieldEffectInterval: 0,
    fieldEffectAngle: 0,
    fieldEffectFrequency: 0,
    fieldEffectOffset: 0,
    fieldEffectRecieveRate: 0,
    fieldEffectExtraValue1: 0,
    modelId: 0,
    modelHash: ZERO_HASH,
    animationId: 0,
    animationHash: ZERO_HASH,
    idTable: [],
    controlReferences: [],
    modelControlIndices: [-1, -1, -1, -1],
    metaParsed: makeEfxbnMetaParsed(),
    runtime: undefined,
    ...overrides,
  };
  return { ...authored, runtime: overrides.runtime ?? deriveRuntime(authored) };
}
