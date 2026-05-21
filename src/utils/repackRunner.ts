import { Command } from "@tauri-apps/plugin-shell";

type RepackParams = {
  structurePath: string;
  inputFolderPath: string;
  toolPath?: string;
};

type RepackToDirParams = {
  structurePath: string;
  inputFolderPath: string;
  outputDir: string;
  toolPath?: string;
};

function toWindowsPath(path: string): string {
  return path.replace(/\//g, "\\");
}

export async function repackFolderUsingStructure({
  structurePath,
  inputFolderPath,
  toolPath,
}: RepackParams): Promise<void> {
  const tool = toolPath ?? "E:\\XB\\解包\\com\\compression.js";
  const normalizedStructurePath = toWindowsPath(structurePath);
  const normalizedInputPath = toWindowsPath(inputFolderPath);
  const parentSegments = normalizedInputPath.split("\\").slice(0, -1);
  const comPath = parentSegments.join("\\") + (parentSegments.length ? "\\" : "");

  const command = await Command.create(
    "exec-node",
    [tool, normalizedStructurePath, "-r", "-com-path", comPath],
    { encoding: "utf-8" }
  ).execute();

  if (command.code !== 0) {
    throw new Error(command.stderr || "Repack failed");
  }
}

export async function repackFolderUsingStructureToDir({
  structurePath,
  inputFolderPath,
  outputDir,
  toolPath,
}: RepackToDirParams): Promise<void> {
  const tool = toolPath ?? "E:\\XB\\解包\\com\\compression.js";
  const normalizedStructurePath = toWindowsPath(structurePath);
  const normalizedInputPath = toWindowsPath(inputFolderPath);
  const normalizedOutputDir = toWindowsPath(outputDir);
  const parentSegments = normalizedInputPath.split("\\").slice(0, -1);
  const comPath = parentSegments.join("\\") + (parentSegments.length ? "\\" : "");

  const command = await Command.create(
    "exec-node",
    [tool, normalizedStructurePath, "-com-path", comPath],
    { encoding: "utf-8", cwd: normalizedOutputDir }
  ).execute();

  if (command.code !== 0) {
    throw new Error(command.stderr || "Repack failed");
  }
}

type RepackToFileParams = {
  structurePath: string;
  inputFolderPath: string;
  outputFilePath: string;
  toolPath?: string;
};

export async function repackFolderToFhm2dFile({
  structurePath,
  inputFolderPath,
  outputFilePath,
  toolPath,
}: RepackToFileParams): Promise<void> {
  const tool = toolPath ?? "E:\\XB\\解包\\com\\compression.js";
  const normalizedStructurePath = toWindowsPath(structurePath);
  const normalizedInputPath = toWindowsPath(inputFolderPath);
  const normalizedOutputPath = toWindowsPath(outputFilePath);
  const parentSegments = normalizedInputPath.split("\\").slice(0, -1);
  const comPath = parentSegments.join("\\") + (parentSegments.length ? "\\" : "");

  const command = await Command.create(
    "exec-node",
    [tool, normalizedStructurePath, "-r", "-com-path", comPath, "-o", normalizedOutputPath],
    { encoding: "utf-8" },
  ).execute();

  if (command.code !== 0) {
    throw new Error(command.stderr || "Repack to FHM2D failed");
  }
}

