import { Command } from "@tauri-apps/plugin-shell";

type RepackParams = {
  structurePath: string;
  inputFolderPath: string;
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

