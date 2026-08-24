import { invoke } from "@tauri-apps/api/core";

import type { ShlFileData } from "@/components/ssbh-model-preview/shlIoService";
import type { UnitModelMutationResult } from "./unitModelModelService";
import type {
  UnitModelRepackResult,
  UnitModelValidationResult,
} from "./unitModelRepackService";
import { getBaseName, toWindowsPath } from "./unitModelRepackService";

export const EXVS_COMMON_HASH_NAME = "0xCB665375";
export const EXVS_COMMON_PACKAGE_NAME = "000common_000common_001";
/** SHL model_type written for newly added Common models (Part). */
export const EXVS_COMMON_NEW_SHL_MODEL_TYPE = 3;

export interface ExvsCommonBundlePaths {
  sourceFhm2d: string;
  modelRoot: string;
  structureJson: string;
  modFhm2d: string;
}

export interface ExvsCommonExtractResult {
  sourceFhm2d: string;
  modelRoot: string;
  structureJsonPath: string;
  totalFiles: number;
  uniquePhysicalFiles: number;
  logicalReferenceCount: number;
  structureReferenceCount: number;
  unknownResourceCount: number;
  warnings: string[];
  backupModelRoot: string | null;
  backupStructureJson: string | null;
}

export interface ExvsCommonValidationResult {
  valid: boolean;
  modelRoot: string;
  structureJsonPath: string;
  summary: {
    modelCount: number;
    textureCount: number;
    shlRecordCount: number;
    unknownResourceCount: number;
    totalFiles: number;
  };
  errors: Array<{ phase: string; message: string; path: string | null }>;
  warnings: string[];
}

export interface ExvsCommonMutationResult {
  modelRoot: string;
  structureJsonPath: string;
  affectedModel: string | null;
  modelId: number | null;
  modelCount: number;
  totalFiles: number;
  validation: ExvsCommonValidationResult;
  backupModelRoot: string | null;
  backupStructureJson: string | null;
}

export interface ExvsCommonRepackResult extends UnitModelRepackResult {
  warnings: string[];
}

export function isExvsCommonStructure(structureJson: unknown): boolean {
  if (!structureJson || typeof structureJson !== "object") return false;
  const value = structureJson as Record<string, unknown>;
  return String(value.HashName ?? "").toUpperCase() === EXVS_COMMON_HASH_NAME.toUpperCase();
}

export function isExvsCommonModelRoot(modelRoot: string | null | undefined): boolean {
  return Boolean(modelRoot && getBaseName(modelRoot).toLowerCase() === EXVS_COMMON_PACKAGE_NAME);
}

export function parseExvsCommonRuntimeModelId(value: string): number {
  const normalized = value.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]{1,8}$/.test(normalized)) {
    throw new Error("Runtime model ID must be 1-8 hexadecimal digits.");
  }
  return Number.parseInt(normalized, 16) >>> 0;
}

export async function resolveExvsCommonBundlePaths(params: {
  extractOutputPath: string;
  obDplCachePath: string;
  obModPath: string;
}): Promise<ExvsCommonBundlePaths> {
  return await invoke<ExvsCommonBundlePaths>("resolve_exvs_common_bundle_paths", {
    extractOutputPath: toWindowsPath(params.extractOutputPath),
    obDplCachePath: toWindowsPath(params.obDplCachePath),
    obModPath: toWindowsPath(params.obModPath),
  });
}

export async function extractExvsCommonBundle(params: {
  extractOutputPath: string;
  obDplCachePath: string;
  overwrite: boolean;
}): Promise<ExvsCommonExtractResult> {
  return await invoke<ExvsCommonExtractResult>("extract_exvs_common_bundle", {
    extractOutputPath: toWindowsPath(params.extractOutputPath),
    obDplCachePath: toWindowsPath(params.obDplCachePath),
    overwrite: params.overwrite,
  });
}

export async function validateExvsCommonBundle(
  modelRoot: string,
  structureJsonPath: string,
): Promise<ExvsCommonValidationResult> {
  return await invoke<ExvsCommonValidationResult>("validate_exvs_common_bundle", {
    modelRoot: toWindowsPath(modelRoot),
    structureJsonPath: toWindowsPath(structureJsonPath),
  });
}

export function commonValidationAsUnitModel(
  validation: ExvsCommonValidationResult,
): UnitModelValidationResult {
  return {
    valid: validation.valid,
    modelRoot: validation.modelRoot,
    structureJsonPath: validation.structureJsonPath,
    summary: {
      modelCount: validation.summary.modelCount,
      numatbCount: 0,
      nuhlpbCount: 0,
      shlCount: validation.summary.shlRecordCount > 0 ? 1 : 0,
      shlDeclaredModelCount: validation.summary.shlRecordCount,
      textureReferenceCount: validation.summary.textureCount,
    },
    errors: validation.errors.map((error) => ({ ...error, model: null })),
    warnings: validation.warnings,
  };
}

export async function repackExvsCommonBundle(params: {
  modelRoot: string;
  structureJsonPath: string;
  obModPath: string;
  confirmHighRisk: boolean;
}): Promise<ExvsCommonRepackResult> {
  return await invoke<ExvsCommonRepackResult>("repack_exvs_common_bundle", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
    obModPath: toWindowsPath(params.obModPath),
    confirmHighRisk: params.confirmHighRisk,
  });
}

function mutationAsUnitModel(result: ExvsCommonMutationResult): UnitModelMutationResult {
  return {
    modelRoot: result.modelRoot,
    structureJsonPath: result.structureJsonPath,
    modelCount: result.modelCount,
    totalFiles: result.totalFiles,
    removedFiles: [],
  };
}

export async function addExvsCommonModel(params: {
  modelRoot: string;
  structureJsonPath: string;
  sourceDir: string;
  modelId: number;
}): Promise<UnitModelMutationResult> {
  const result = await invoke<ExvsCommonMutationResult>("add_exvs_common_model", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
    sourceDir: toWindowsPath(params.sourceDir),
    modelId: params.modelId >>> 0,
  });
  return mutationAsUnitModel(result);
}

export async function removeExvsCommonModel(params: {
  modelRoot: string;
  structureJsonPath: string;
  modelName: string;
}): Promise<UnitModelMutationResult> {
  const result = await invoke<ExvsCommonMutationResult>("remove_exvs_common_model", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
    modelName: params.modelName,
  });
  return mutationAsUnitModel(result);
}

export async function replaceExvsCommonModel(params: {
  modelRoot: string;
  structureJsonPath: string;
  targetModelName: string;
  sourceDir: string;
}): Promise<UnitModelMutationResult> {
  const result = await invoke<ExvsCommonMutationResult>("replace_exvs_common_model", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
    targetModelName: params.targetModelName,
    sourceDir: toWindowsPath(params.sourceDir),
  });
  return mutationAsUnitModel(result);
}

export async function addExvsCommonTexture(params: {
  modelRoot: string;
  structureJsonPath: string;
  sourcePath: string;
  targetFilename: string;
}): Promise<void> {
  await invoke("add_exvs_common_texture", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
    sourcePath: toWindowsPath(params.sourcePath),
    targetFilename: params.targetFilename,
  });
}

export async function removeExvsCommonTexture(params: {
  modelRoot: string;
  structureJsonPath: string;
  fileIndex: number;
}): Promise<void> {
  await invoke("remove_exvs_common_texture", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
    fileIndex: params.fileIndex,
  });
}

export async function saveExvsCommonShl(params: {
  modelRoot: string;
  structureJsonPath: string;
  shl: ShlFileData;
}): Promise<void> {
  await invoke("save_exvs_common_shl", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
    shl: params.shl,
  });
}

export async function syncExvsCommonTextureContainers(params: {
  modelRoot: string;
  structureJsonPath: string;
}): Promise<boolean> {
  return await invoke<boolean>("sync_exvs_common_texture_containers", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
  });
}
