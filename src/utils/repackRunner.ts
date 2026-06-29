import { invoke } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { normalizeFhm2dHashName } from "@/utils/fhm2dStructureMetadata";

export interface RepackResult {
  outputPath: string;
  totalFiles: number;
  outputSize: number;
}

type RepackParams = {
  structurePath: string;
  inputFolderPath: string;
};

type RepackToDirParams = {
  structurePath: string;
  inputFolderPath: string;
  outputDir: string;
};

type RepackToFileParams = {
  structurePath: string;
  inputFolderPath: string;
  outputFilePath: string;
};

function toWindowsPath(path: string): string {
  return path.replace(/\//g, "\\");
}

function getPackStemFromStructurePath(structurePath: string): string {
  const normalized = toWindowsPath(structurePath);
  const fileName = normalized.split("\\").pop() ?? "";
  const withoutStructureSuffix = fileName.replace(/_structure\.json$/i, "");
  if (withoutStructureSuffix !== fileName) return withoutStructureSuffix;
  return fileName.replace(/\.json$/i, "");
}

function getParentDir(normalizedPath: string): string {
  const segments = normalizedPath.split("\\");
  return segments.slice(0, -1).join("\\");
}

function trimTrailingSeparators(path: string): string {
  return path.replace(/[\\/]+$/g, "");
}

export function buildRepackOutputPath(structurePath: string, outputDir: string): string {
  const normalizedOutputDir = trimTrailingSeparators(toWindowsPath(outputDir));
  const packStem = getPackStemFromStructurePath(structurePath);
  return `${normalizedOutputDir}\\${packStem}.fhm2d`;
}

export async function buildRepackOutputPathFromMetadata(structurePath: string, outputDir: string): Promise<string> {
  const normalizedOutputDir = trimTrailingSeparators(toWindowsPath(outputDir));
  try {
    const raw = await readTextFile(structurePath);
    const parsed = JSON.parse(raw) as { HashName?: unknown };
    const hashName = typeof parsed.HashName === "string" ? normalizeFhm2dHashName(parsed.HashName) : null;
    if (hashName) {
      return `${normalizedOutputDir}\\${hashName}.fhm2d`;
    }
  } catch {
    // Fall back to the legacy structure filename rule.
  }
  return buildRepackOutputPath(structurePath, outputDir);
}

export async function repackFolderUsingStructure({
  structurePath,
  inputFolderPath,
}: RepackParams): Promise<RepackResult> {
  const normalizedInput = toWindowsPath(inputFolderPath);
  const parentDir = getParentDir(normalizedInput);
  const outputPath = await buildRepackOutputPathFromMetadata(structurePath, parentDir);

  return await invoke<RepackResult>("repack_fhm2d", {
    structureJsonPath: toWindowsPath(structurePath),
    outputPath,
    atomicWrite: true,
  });
}

export async function repackFolderUsingStructureToDir({
  structurePath,
  inputFolderPath,
  outputDir,
}: RepackToDirParams): Promise<RepackResult> {
  const outputPath = await buildRepackOutputPathFromMetadata(structurePath, outputDir);

  return await invoke<RepackResult>("repack_fhm2d", {
    structureJsonPath: toWindowsPath(structurePath),
    outputPath,
    atomicWrite: true,
  });
}

/**
 * Repack a workspace hash folder into the configured OB Mod directory
 * (e.g. data\x64\mod\0xCE74091E.fhm2d). Used by Test Editor "Repack Changes".
 */
export async function repackFolderUsingStructureToModFolder({
  structurePath,
  inputFolderPath,
  modFolderPath,
}: RepackParams & { modFolderPath: string }): Promise<RepackResult> {
  const trimmedMod = modFolderPath.trim();
  if (!trimmedMod) {
    throw new Error("OB Mod folder is not configured. Set it in Config before repacking.");
  }
  return repackFolderUsingStructureToDir({
    structurePath,
    inputFolderPath,
    outputDir: trimmedMod,
  });
}

export async function repackFolderToFhm2dFile({
  structurePath,
  inputFolderPath,
  outputFilePath,
}: RepackToFileParams): Promise<void> {
  const normalizedStructure = toWindowsPath(structurePath);
  const normalizedOutput = toWindowsPath(outputFilePath);

  await invoke<RepackResult>("repack_fhm2d", {
    structureJsonPath: normalizedStructure,
    outputPath: normalizedOutput,
    atomicWrite: true,
  });
}
