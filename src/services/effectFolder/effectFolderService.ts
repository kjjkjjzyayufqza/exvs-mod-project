import { invoke } from "@tauri-apps/api/core";

export interface EffectFolderHash {
  signed: number;
  unsigned: number;
  hex: string;
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
  /** Reflected as `pad01[2]`; carried so a rebuilt file stays byte-identical. */
  pad01: [number, number];
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
  /** Reflected as `stripSegmentLength_NotUse`; declared by the engine and never read. */
  stripSegmentLengthNotUse: number;
  stripSegmentLife: number;
  /** Reflected as `stripSegmentNum_NotUse`; declared and never read. */
  stripSegmentNumNotUse: number;
  stripSegmentSplitNum: number;
  drawerId: number;
  worldWindApplyRateRandom: number;
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
  controlReferences: EfxbnControlReferenceSummary[];
  /** `reserve_area[31]` at reflected offset 756; carried verbatim for the byte-faithful writer. */
  reserveArea: number[];
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
  drawScheme: EfxbnDrawScheme;
}

/**
 * The runtime draw-scheme flag word at element `+0x390`, synthesized by `sub_1401470F0` and
 * consumed by `sub_140188E30` to pick the pixel-shader variant. Never stored in the file.
 */
export interface EfxbnDrawScheme {
  /** Every bit the EFXBN alone determines. Zero for blocks the loader never enables. */
  flag: number;
  /**
   * The multi-UV group, which applies only when the block's model mesh carries two or more
   * vertex attribute streams of type 17. The backend has no mesh, so it reports the group
   * separately; OR it into `flag` once the mesh is known.
   */
  meshMultiUvFlag: number;
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

/**
 * The resource half of `000common_001`, indexed alongside whichever pack was opened.
 *
 * A `.efxbn` names its model and colour map by CRC32, so most references resolve against the
 * shared pack rather than the opened one. See `effectFolderCommonPack.ts` for the corpus shares.
 */
export interface EffectFolderCommonPack {
  effectRoot: string;
  structureJsonPath: string;
  models: EffectFolderModel[];
  textures: EffectFolderFileItem[];
}

export interface EffectFolderInventory {
  effectRoot: string;
  structureJsonPath: string;
  summary: {
    totalFiles: number;
    efxbnCount: number;
    modelCount: number;
    textureCount: number;
    /** Model IDs found in neither this pack nor the shared pack. A real defect. */
    unresolvedModelIds: EffectFolderHash[];
    /** Texture IDs found in neither this pack nor the shared pack. A real defect. */
    unresolvedTextureIds: EffectFolderHash[];
    /** Model IDs that resolve only through the shared pack. Expected, not a defect. */
    commonModelIds: EffectFolderHash[];
    /** Texture IDs that resolve only through the shared pack. Expected, not a defect. */
    commonTextureIds: EffectFolderHash[];
  };
  efxbns: EffectFolderFileItem[];
  models: EffectFolderModel[];
  textures: EffectFolderFileItem[];
  otherFiles: EffectFolderFileItem[];
  /** Null when the opened pack is the shared pack, or when no shared pack sits beside it. */
  commonPack: EffectFolderCommonPack | null;
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

/**
 * Reject an inventory whose summary predates shared-pack resolution.
 *
 * Without these fields every reference that lives in `000common_001` silently reads as
 * unresolved, and the preview quietly swaps proxy geometry in for the real model — a flat disc
 * where a sphere belongs, with nothing on screen to say why. A desktop build that still returns
 * the old shape is a stale binary, so say that instead of degrading.
 */
function assertResolvedInventoryShape(inventory: EffectFolderInventory): EffectFolderInventory {
  const missing = (["commonModelIds", "commonTextureIds", "unresolvedTextureIds"] as const).filter(
    (field) => !Array.isArray(inventory.summary?.[field]),
  );
  if (missing.length > 0 || inventory.commonPack === undefined) {
    throw new Error(
      "inspect_effect_folder returned an inventory without shared-pack resolution " +
        `(missing: ${[...missing, ...(inventory.commonPack === undefined ? ["commonPack"] : [])].join(", ")}). ` +
        "The Rust backend is out of date — rebuild the desktop app.",
    );
  }
  return inventory;
}

export async function inspectEffectFolder(
  effectRoot: string,
  structureJsonPath = inferEffectFolderStructurePath(effectRoot),
): Promise<EffectFolderInventory> {
  return assertResolvedInventoryShape(
    await invoke<EffectFolderInventory>("inspect_effect_folder", {
      effectRoot: toWindowsPath(effectRoot),
      structureJsonPath: toWindowsPath(structureJsonPath),
    }),
  );
}

export async function parseEffectEfxbnFile(path: string): Promise<EfxbnSummary> {
  return await invoke<EfxbnSummary>("parse_effect_efxbn_file", {
    path: toWindowsPath(path),
  });
}

export interface EfxbnFileWriteResult {
  path: string;
  byteLen: number;
  summary: EfxbnSummary;
}

/**
 * Writes a whole edited EFXBN document back to disk.
 *
 * Unlike {@link patchEffectEfxbnControlConstants}, which pokes four bytes per curve key, this
 * rebuilds the entire container from the summary. That is what makes real editing possible:
 * resizing the curve key table, retopologising the block tree, and rebinding models and textures
 * all change region lengths and header counts, which a byte patch cannot express.
 *
 * The backend refuses a target that is missing, is not a `.efxbn`, or resolves outside
 * `effectRoot`, and stages the bytes in a temp file so a failed write cannot truncate the
 * original.
 */
export async function writeEffectEfxbnFile(
  effectRoot: string,
  path: string,
  summary: EfxbnSummary,
): Promise<EfxbnFileWriteResult> {
  return await invoke<EfxbnFileWriteResult>("write_effect_efxbn_file", {
    effectRoot: toWindowsPath(effectRoot),
    path: toWindowsPath(path),
    summary,
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

/** Update structure Item `unk3` (resource hash). Stored as JSON number (i32). */
export async function updateEffectFolderItemHash(params: {
  effectRoot: string;
  structureJsonPath?: string;
  fileIndex: number;
  hashId: number;
}): Promise<EffectFolderMutationResult> {
  return await invoke<EffectFolderMutationResult>("update_effect_folder_item_hash", {
    effectRoot: toWindowsPath(params.effectRoot),
    structureJsonPath: params.structureJsonPath
      ? toWindowsPath(params.structureJsonPath)
      : null,
    fileIndex: params.fileIndex,
    hashId: params.hashId | 0,
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

export interface EffectFolderCopyEfxbnPolicy {
  fileIndex: number;
  destFileName?: string | null;
  overwrite?: boolean;
  skip?: boolean;
}

export async function copyEffectFolderSelection(params: {
  sourceEffectRoot: string;
  sourceStructureJsonPath?: string;
  destinationEffectRoot: string;
  destinationStructureJsonPath?: string;
  selections: EffectFolderSelection[];
  policies?: EffectFolderCopyEfxbnPolicy[];
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
    policies: params.policies ?? [],
  });
}
