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

export function inferUnitModelStructurePath(modelRoot: string): string {
  const normalized = trimTrailingSeparators(toWindowsPath(modelRoot));
  const parent = getParentDir(normalized);
  const name = getBaseName(normalized);
  if (!parent || !name) {
    throw new Error(`Cannot infer structure JSON path from model root: ${modelRoot}`);
  }
  return `${parent}\\${name}_structure.json`;
}

/**
 * Game pack files use a lowercase `0x` prefix followed by UPPERCASE hex digits (e.g.
 * `0xA258A522.fhm2d`, matching the originals under `data\x64`). The unpacker occasionally emits a
 * lowercase structure-JSON name (e.g. `0xa258a522_structure.json`), which would otherwise produce
 * a lowercase pack the loader does not recognize. Normalize a hash-shaped stem to that canonical
 * casing; non-hash stems are returned unchanged.
 */
export function normalizeUnitModelPackStem(stem: string): string {
  const match = /^0x([0-9a-f]+)$/i.exec(stem.trim());
  return match ? `0x${match[1].toUpperCase()}` : stem;
}

export function inferUnitModelOutputPath(modelRoot: string, structurePath?: string): string {
  const normalizedRoot = trimTrailingSeparators(toWindowsPath(modelRoot));
  const parent = getParentDir(normalizedRoot);
  const source = structurePath ? getBaseName(structurePath) : `${getBaseName(normalizedRoot)}_structure.json`;
  const stem = source.replace(/_structure\.json$/i, "").replace(/\.json$/i, "");
  if (!parent || !stem) {
    throw new Error(`Cannot infer output path from model root: ${modelRoot}`);
  }
  return `${parent}\\${normalizeUnitModelPackStem(stem)}.fhm2d`;
}

/**
 * Resolve the repack destination inside the configured OB Mod folder.
 * The packed `.fhm2d` is named after the structure JSON stem (e.g.
 * `0xAF73362C_structure.json` → `<modFolder>\0xAF73362C.fhm2d`), matching the
 * pack naming used by the Test Editor "Repack Changes" flow.
 */
export function inferUnitModelModOutputPath(modFolder: string, structurePath: string): string {
  const normalizedModFolder = trimTrailingSeparators(toWindowsPath(modFolder));
  const stem = getBaseName(structurePath).replace(/_structure\.json$/i, "").replace(/\.json$/i, "");
  if (!normalizedModFolder) {
    throw new Error("OB Mod folder is not configured. Set it in Config before repacking.");
  }
  if (!stem) {
    throw new Error(`Cannot infer pack name from structure path: ${structurePath}`);
  }
  return `${normalizedModFolder}\\${normalizeUnitModelPackStem(stem)}.fhm2d`;
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
  return await invoke<UnitModelRepackResult>("repack_unit_model_fhm2d", {
    structureJsonPath: toWindowsPath(structureJsonPath),
    outputPath,
    atomicWrite: true,
  });
}

/**
 * Repack the validated unit-model folder directly into the configured OB Mod
 * folder, mirroring the Test Editor "Repack Changes" destination instead of
 * writing the `.fhm2d` next to the source `_structure.json`.
 */
export async function repackValidatedUnitModelFolderToModFolder(
  modFolder: string,
  structureJsonPath: string,
): Promise<UnitModelRepackResult> {
  const outputPath = inferUnitModelModOutputPath(modFolder, structureJsonPath);
  return await invoke<UnitModelRepackResult>("repack_unit_model_fhm2d", {
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

