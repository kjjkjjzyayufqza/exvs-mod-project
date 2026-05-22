import { invoke } from "@tauri-apps/api/core";

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

export async function repackFolderUsingStructure({
  structurePath,
  inputFolderPath,
}: RepackParams): Promise<void> {
  const normalizedStructure = toWindowsPath(structurePath);
  const normalizedInput = toWindowsPath(inputFolderPath);
  const parentDir = getParentDir(normalizedInput);
  const packStem = getPackStemFromStructurePath(normalizedStructure);
  const outputPath = `${parentDir}\\${packStem}.fhm2d`;

  await invoke<RepackResult>("repack_fhm2d", {
    structureJsonPath: normalizedStructure,
    outputPath,
    atomicWrite: true,
  });
}

export async function repackFolderUsingStructureToDir({
  structurePath,
  inputFolderPath,
  outputDir,
}: RepackToDirParams): Promise<void> {
  const normalizedStructure = toWindowsPath(structurePath);
  const normalizedOutputDir = toWindowsPath(outputDir);
  const packStem = getPackStemFromStructurePath(normalizedStructure);
  const outputPath = `${normalizedOutputDir}\\${packStem}.fhm2d`;

  await invoke<RepackResult>("repack_fhm2d", {
    structureJsonPath: normalizedStructure,
    outputPath,
    atomicWrite: true,
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
