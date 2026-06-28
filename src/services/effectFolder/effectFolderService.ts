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

export interface EfxbnEffectSummary {
  index: number;
  modelId: number;
  modelHash: EffectFolderHash;
  idTable: EfxbnIdPair[];
}

export interface EfxbnSummary {
  path: string;
  magic: string;
  versionOrFlags: number;
  fileSize: number;
  actualSize: number;
  effectCount: number;
  controlConfigRegionParam: number;
  controlBlockSize: number | null;
  modelControlConfigCount: number;
  modelControlRegionOffset: number;
  modelControlRegionSize: number;
  trailingOffset: number;
  unknown18: number;
  unknown1c: number;
  modelIds: EffectFolderHash[];
  effects: EfxbnEffectSummary[];
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
