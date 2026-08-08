import { invoke } from "@tauri-apps/api/core";

export interface EffectFolderHash {
  signed: number;
  unsigned: number;
  hex: string;
}

export interface EfxbnIdPair {
  flag: number;
  id: number;
}

export interface EfxbnControlLookupEntry {
  index: number;
  keyF32Bits: number;
  key: number;
  valueF32Bits: number;
  value: number;
}

export interface EfxbnControlReferenceSummary {
  index: number;
  name: string;
  rawOffset: number;
  runtimeOffset: number;
  selector: number;
  lookupIndex: number;
}

export interface EfxbnMetaConfigHeaderSummary {
  number: number;
  unkFloatA: number;
  unkIntA: number;
  unkFloatB: number;
  unkIntB: number;
  unkBytes12: number[];
  unkFloats4: [number, number, number, number];
}

export interface EfxbnMetaParsedSummary {
  unkConfigInfo: number[];
  configHeader: EfxbnMetaConfigHeaderSummary;
  idTablePairs: EfxbnIdPair[];
  controlReferences: EfxbnControlReferenceSummary[];
  modelId: number;
  modelHash: EffectFolderHash;
  animationId: number;
  animationHash: EffectFolderHash;
  unk32: number;
  unkConfigInfo2: number[];
}

export interface EfxbnEffectSummary {
  index: number;
  /** Tree depth. 0 is a root emitter; children carry the parent depth plus one. */
  level: number;
  /** Number of valid entries in `childIndexArray`. */
  childIndexSize: number;
  /** Block indices spawned by this block. Unused slots are -1. */
  childIndexArray: [number, number, number, number, number, number, number, number];
  /** First child index, retained for callers that predate `childIndexArray`. */
  referencedEffectIndex: number;
  effectType: number;
  lifeTimeBase: number;
  lifeTimeRandom: number;
  intervalBase: number;
  intervalRandom: number;
  numEmit: number;
  actionFlags: number;
  spawnFormType: number;
  spawnFormLength: [number, number, number, number];
  speedRandom: [number, number, number, number];
  sizeBase: [number, number, number, number];
  sizeRandom: [number, number, number, number];
  rotationBase: [number, number, number, number];
  rotationRandom: [number, number, number, number];
  rotationSpeed: [number, number, number, number];
  internalElementDataIndex: number;
  enableDataFlag: number;
  /** Model resource handle. Mirrors `modelId`/`modelHash`. */
  nudHandle: number;
  /** Texture handle bound directly to the block, independent of the parameter slots. */
  textureHandle: number;
  /** Primary and pass-2 color-map parameter slots. */
  colorTextureParameterIndex: [number, number];
  /** Primary and pass-2 UV-offset parameter slots. */
  uvTextureParameterIndex: [number, number];
  centerPivot: [number, number];
  deleteSettings: number;
  fadeTimeBase: number;
  cullingType: number;
  zWriteEnable: number;
  zTestEnable: number;
  blendState: number;
  drawRepositoryIndex: number;
  instanceAmountType: number;
  drawAmountIndex: number;
  enableSoftParticle: number;
  positionOffset: [number, number, number, number];
  delayEmitTimeBase: number;
  emitAreaType: number;
  enableZSort: number;
  deleteEffectId: number;
  deleteEndScale: [number, number, number, number];
  lightAttenuationRadius: number;
  lightingFlags: number;
  normalMapHash: number;
  worldWindApplyRate: number;
  stripSegmentInterval: number;
  stripSegmentLife: number;
  stripSegmentSplitNum: number;
  drawerId: number;
  softParticleRange: number;
  cameraFadeRange: number;
  extraFlags: number;
  noiseDirectionMaxRot: number;
  noiseDirectionAreaRange: number;
  blurStartColor: [number, number, number, number];
  blurEndColor: [number, number, number, number];
  blurEnableRange: number;
  blurFadePower: number;
  lightType: number;
  lightBaseRadius: number;
  rotationSpeedRandom: [number, number, number, number];
  cameraOffset: number;
  postEffectType: number;
  postEffectBlendRate: number;
  stripTailAlphaRate: number;
  stripHeadAlphaRate: number;
  emitInterpolateDistance: number;
  noiseRotatePosOffset: number;
  zSortOffset: number;
  specialShaderType: number;
  reflectionPower: number;
  pass2BlendType: number;
  animationDelayFrame: number;
  animationLoopStartFrame: number;
  animationLoopEndFrame: number;
  animationDeleteFrame: number;
  animationSpeedRate: number;
  animationBlendDeleteFrame: number;
  emitterLodType: number;
  animationStartFrame: number;
  boundingSphereInfo: [number, number, number, number];
  postEffectShapeRadius: number;
  worldWaterApplyRate: number;
  numEmitCountRandom: number;
  depthEmissionRange: number;
  depthEmissionPower: number;
  highlightPower: number;
  emitInterpolateType: number;
  meshEmitterIndex: number;
  meshEmitterCount: number;
  fieldEffectType: number;
  fieldEffectPower: number;
  fieldEffectInterval: number;
  fieldEffectAngle: number;
  fieldEffectFrequency: number;
  fieldEffectOffset: number;
  fieldEffectRecieveRate: number;
  fieldEffectExtraValue1: number;
  modelId: number;
  modelHash: EffectFolderHash;
  animationId: number;
  animationHash: EffectFolderHash;
  idTable: EfxbnIdPair[];
  controlReferences: EfxbnControlReferenceSummary[];
  modelControlIndices: [number, number, number, number];
  metaParsed: EfxbnMetaParsedSummary;
  /**
   * Loader-derived values from `sub_140146590`. Anything that renders or simulates
   * should read these; the sibling fields keep the authored record for round-tripping.
   */
  runtime?: EfxbnRuntimeNormalization;
}

export interface EfxbnRuntimeNormalization {
  /** Type-9 wrappers adopt a type derived from their first child. */
  elementType: number;
  actionFlags: number;
  deleteSettings: number;
  /** Derived from `blendState` and `enableSoftParticle`, never read from the file. */
  zWriteEnable: number;
  softParticleRange: number;
  stripSegmentLife: number;
  stripTailAlphaRate: number;
  stripHeadAlphaRate: number;
  internalElementDataIndex: number;
}

export interface EfxbnModelControlSummary {
  index: number;
  inputSourceType: number;
  colorMapId: number;
  colorMapHash: EffectFolderHash;
  addressingMode: number;
  reverseU: number;
  reverseV: number;
  textureWidth: number;
  textureHeight: number;
  uvPatternType: number;
  uvU: [number, number, number, number];
  uvV: [number, number, number, number];
  uvScrollSpeed: number;
  uvScrollLimit: number;
  uvScrollDirection: number;
  uvAnimationRandom: number;
  uvAnimationFrameNum: number;
  uvAnimationFrameWidth: number;
  uvAnimationFrameHeight: number;
  uvAnimationFrameNumByLine: number;
  uvAnimationFrameTime: number;
  uvAnimation3dTexture: number;
  uvScrollModelSpeedU: number;
  uvScrollModelSpeedV: number;
  uvDistortionPowerU: number;
  uvDistortionPowerV: number;
  textureSettingFlags: number;
  uvAnimationStartFrame: number;
  uvRandomOffsetU: number;
  uvRandomOffsetV: number;
  reserveArea: number[];
}

export interface EfxbnUnknownTodo {
  field: string;
  status: string;
  reason: string;
  followUp: string;
}

export interface EfxbnTodo {
  unknowns: EfxbnUnknownTodo[];
}

export interface EfxbnSummary {
  path: string;
  magic: string;
  versionOrFlags: number;
  fileSize: number;
  actualSize: number;
  effectCount: number;
  /** Number of `(time, value)` curve keys stored after the effect blocks. */
  curveKeyCount: number;
  controlLookupRegionOffset: number;
  controlLookupRegionSize: number;
  controlLookupRegionEnd: number;
  modelControlConfigCount: number;
  modelControlRegionOffset: number;
  modelControlRegionSize: number;
  trailingOffset: number;
  modelIds: EffectFolderHash[];
  animationIds: EffectFolderHash[];
  modelControlTextureIds: EffectFolderHash[];
  controlLookupEntries: EfxbnControlLookupEntry[];
  effects: EfxbnEffectSummary[];
  modelControls: EfxbnModelControlSummary[];
  textureParameters: EfxbnModelControlSummary[];
  todo: EfxbnTodo;
}

export interface EffectFolderFileItem {
  fileIndex: number;
  fileType: string;
  actualExt: string;
  fileUrl: string;
  fileBaseName: string;
  name: string;
  path: string;
  hash: EffectFolderHash | null;
  unk2: string | null;
  missing: boolean;
  efxbn?: EfxbnSummary;
}

export interface EffectFolderModel {
  name: string;
  hash: EffectFolderHash;
  entryIndex: number;
  folderUnk3: number;
  files: EffectFolderFileItem[];
  missingRequiredExts: string[];
  materialTextureIds?: EffectFolderHash[];
}

export interface EffectFolderInventory {
  effectRoot: string;
  structureJsonPath: string;
  summary: {
    totalFiles: number;
    efxbnCount: number;
    modelCount: number;
    textureCount: number;
    unresolvedModelIds: EffectFolderHash[];
  };
  efxbns: EffectFolderFileItem[];
  models: EffectFolderModel[];
  textures: EffectFolderFileItem[];
  otherFiles: EffectFolderFileItem[];
  warnings: string[];
}

export interface EffectFolderValidationError {
  phase: string;
  item: string | null;
  message: string;
  path: string | null;
}

export interface EffectFolderValidationResult {
  valid: boolean;
  effectRoot: string;
  structureJsonPath: string;
  summary: {
    totalFiles: number;
    efxbnCount: number;
    modelCount: number;
    textureCount: number;
    unresolvedModelIdCount: number;
  };
  errors: EffectFolderValidationError[];
  warnings: string[];
}

export interface EffectFolderMutationResult {
  effectRoot: string;
  structureJsonPath: string;
  totalFiles: number;
  addedFiles: string[];
  removedFiles: string[];
  warnings: string[];
}

export interface EffectFolderCopyResult {
  sourceEffectRoot: string;
  destinationEffectRoot: string;
  destinationStructureJsonPath: string;
  totalFiles: number;
  copiedFiles: string[];
  skipped: string[];
  warnings: string[];
}

export interface EffectFolderSelection {
  kind: "efxbn" | "texture" | "model" | "file";
  fileIndex?: number | null;
  hashId?: number | null;
  name?: string | null;
}

export interface EffectFolderRepackResult {
  outputPath: string;
  totalFiles: number;
  outputSize: number;
}

export function trimTrailingSeparators(path: string): string {
  return path.replace(/[\\/]+$/g, "");
}

export function toWindowsPath(path: string): string {
  return path.replace(/\//g, "\\");
}

export function getParentDir(path: string): string {
  const normalized = trimTrailingSeparators(toWindowsPath(path));
  const lastSlash = normalized.lastIndexOf("\\");
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
}

export function getBaseName(path: string): string {
  const normalized = trimTrailingSeparators(toWindowsPath(path));
  const lastSlash = normalized.lastIndexOf("\\");
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

export function inferEffectFolderStructurePath(effectRoot: string): string {
  const normalized = trimTrailingSeparators(toWindowsPath(effectRoot));
  const parent = getParentDir(normalized);
  const name = getBaseName(normalized);
  if (!parent || !name) {
    throw new Error(`Cannot infer structure JSON path from effect root: ${effectRoot}`);
  }
  return `${parent}\\${name}_structure.json`;
}

export function normalizeEffectPackStem(stem: string): string {
  const match = /^0x([0-9a-f]+)$/i.exec(stem.trim());
  return match ? `0x${match[1].toUpperCase()}` : stem;
}

export function inferEffectFolderModOutputPath(modFolder: string, structurePath: string): string {
  const normalizedModFolder = trimTrailingSeparators(toWindowsPath(modFolder));
  const stem = getBaseName(structurePath).replace(/_structure\.json$/i, "").replace(/\.json$/i, "");
  if (!normalizedModFolder) {
    throw new Error("OB Mod folder is not configured. Set it in Config before repacking.");
  }
  if (!stem) {
    throw new Error(`Cannot infer pack name from structure path: ${structurePath}`);
  }
  return `${normalizedModFolder}\\${normalizeEffectPackStem(stem)}.fhm2d`;
}

export async function inspectEffectFolder(
  effectRoot: string,
  structureJsonPath = inferEffectFolderStructurePath(effectRoot),
): Promise<EffectFolderInventory> {
  return await invoke<EffectFolderInventory>("inspect_effect_folder", {
    effectRoot: toWindowsPath(effectRoot),
    structureJsonPath: toWindowsPath(structureJsonPath),
  });
}

export async function parseEffectEfxbnFile(path: string): Promise<EfxbnSummary> {
  return await invoke<EfxbnSummary>("parse_effect_efxbn_file", {
    path: toWindowsPath(path),
  });
}

export async function validateEffectFolderForRepack(
  effectRoot: string,
  structureJsonPath = inferEffectFolderStructurePath(effectRoot),
): Promise<EffectFolderValidationResult> {
  return await invoke<EffectFolderValidationResult>("validate_effect_folder_for_repack", {
    effectRoot: toWindowsPath(effectRoot),
    structureJsonPath: toWindowsPath(structureJsonPath),
  });
}

export async function repackEffectFolderToModFolder(
  modFolder: string,
  structureJsonPath: string,
): Promise<EffectFolderRepackResult> {
  const outputPath = inferEffectFolderModOutputPath(modFolder, structureJsonPath);
  return await invoke<EffectFolderRepackResult>("repack_effect_folder_fhm2d", {
    structureJsonPath: toWindowsPath(structureJsonPath),
    outputPath,
    atomicWrite: true,
  });
}

export async function importEffectFolderFile(params: {
  effectRoot: string;
  structureJsonPath?: string;
  sourcePath?: string | null;
  kind: "efxbn" | "texture" | "nutexb";
  hashId: number;
  targetFilename?: string | null;
}): Promise<EffectFolderMutationResult> {
  return await invoke<EffectFolderMutationResult>("import_effect_folder_file", {
    effectRoot: toWindowsPath(params.effectRoot),
    structureJsonPath: params.structureJsonPath ? toWindowsPath(params.structureJsonPath) : null,
    sourcePath: params.sourcePath ? toWindowsPath(params.sourcePath) : null,
    kind: params.kind,
    hashId: params.hashId,
    targetFilename: params.targetFilename ?? null,
  });
}

export async function importEffectFolderModel(params: {
  effectRoot: string;
  structureJsonPath?: string;
  sourceDir?: string | null;
  modelHashId: number;
  targetFolderName?: string | null;
}): Promise<EffectFolderMutationResult> {
  return await invoke<EffectFolderMutationResult>("import_effect_folder_model", {
    effectRoot: toWindowsPath(params.effectRoot),
    structureJsonPath: params.structureJsonPath ? toWindowsPath(params.structureJsonPath) : null,
    sourceDir: params.sourceDir ? toWindowsPath(params.sourceDir) : null,
    modelHashId: params.modelHashId,
    targetFolderName: params.targetFolderName ?? null,
  });
}

export async function deleteEffectFolderEntries(params: {
  effectRoot: string;
  structureJsonPath?: string;
  selections: EffectFolderSelection[];
  deleteFiles?: boolean;
}): Promise<EffectFolderMutationResult> {
  return await invoke<EffectFolderMutationResult>("delete_effect_folder_entries", {
    effectRoot: toWindowsPath(params.effectRoot),
    structureJsonPath: params.structureJsonPath ? toWindowsPath(params.structureJsonPath) : null,
    selections: params.selections,
    deleteFiles: params.deleteFiles ?? false,
  });
}

export async function copyEffectFolderSelection(params: {
  sourceEffectRoot: string;
  sourceStructureJsonPath?: string;
  destinationEffectRoot: string;
  destinationStructureJsonPath?: string;
  selections: EffectFolderSelection[];
}): Promise<EffectFolderCopyResult> {
  return await invoke<EffectFolderCopyResult>("copy_effect_folder_selection", {
    sourceEffectRoot: toWindowsPath(params.sourceEffectRoot),
    sourceStructureJsonPath: params.sourceStructureJsonPath
      ? toWindowsPath(params.sourceStructureJsonPath)
      : null,
    destinationEffectRoot: toWindowsPath(params.destinationEffectRoot),
    destinationStructureJsonPath: params.destinationStructureJsonPath
      ? toWindowsPath(params.destinationStructureJsonPath)
      : null,
    selections: params.selections,
  });
}
