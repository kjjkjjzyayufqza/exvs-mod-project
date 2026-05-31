import { invoke } from "@tauri-apps/api/core";

export interface UnitModelValidationError {
  phase: string;
  model: string | null;
  message: string;
  path: string | null;
}

export interface UnitModelValidationSummary {
  modelCount: number;
  numatbCount: number;
  nuhlpbCount: number;
  shlCount: number;
  shlDeclaredModelCount: number | null;
  textureReferenceCount: number;
}

export interface UnitModelValidationResult {
  valid: boolean;
  modelRoot: string;
  structureJsonPath: string;
  summary: UnitModelValidationSummary;
  errors: UnitModelValidationError[];
  warnings: string[];
}

export interface UnitModelRepackResult {
  outputPath: string;
  totalFiles: number;
  outputSize: number;
}

function trimTrailingSeparators(path: string): string {
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

export function inferUnitModelStructurePath(modelRoot: string): string {
  const normalized = trimTrailingSeparators(toWindowsPath(modelRoot));
  const parent = getParentDir(normalized);
  const name = getBaseName(normalized);
  if (!parent || !name) {
    throw new Error(`Cannot infer structure JSON path from model root: ${modelRoot}`);
  }
  return `${parent}\\${name}_structure.json`;
}

export function inferUnitModelOutputPath(modelRoot: string, structurePath?: string): string {
  const normalizedRoot = trimTrailingSeparators(toWindowsPath(modelRoot));
  const parent = getParentDir(normalizedRoot);
  const source = structurePath ? getBaseName(structurePath) : `${getBaseName(normalizedRoot)}_structure.json`;
  const stem = source.replace(/_structure\.json$/i, "").replace(/\.json$/i, "");
  if (!parent || !stem) {
    throw new Error(`Cannot infer output path from model root: ${modelRoot}`);
  }
  return `${parent}\\${stem}.fhm2d`;
}

export async function validateUnitModelForRepack(
  modelRoot: string,
  structureJsonPath = inferUnitModelStructurePath(modelRoot),
): Promise<UnitModelValidationResult> {
  return await invoke<UnitModelValidationResult>("validate_unit_model_for_repack", {
    modelRoot: toWindowsPath(modelRoot),
    structureJsonPath: toWindowsPath(structureJsonPath),
  });
}

export async function repackValidatedUnitModelFolder(
  modelRoot: string,
  structureJsonPath = inferUnitModelStructurePath(modelRoot),
): Promise<UnitModelRepackResult> {
  const outputPath = inferUnitModelOutputPath(modelRoot, structureJsonPath);
  return await invoke<UnitModelRepackResult>("repack_fhm2d", {
    structureJsonPath: toWindowsPath(structureJsonPath),
    outputPath,
    atomicWrite: true,
  });
}

export function formatUnitModelReviewPayload(
  result: UnitModelValidationResult | null,
  extra?: { outputPath?: string | null; activeModelRoot?: string | null },
): string {
  const payload = {
    kind: "unit-model-repack-review",
    activeModelRoot: extra?.activeModelRoot ?? result?.modelRoot ?? null,
    outputPath: extra?.outputPath ?? null,
    validation: result,
  };
  return JSON.stringify(payload, null, 2);
}

