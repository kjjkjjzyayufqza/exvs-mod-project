import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";
import { join, resourceDir } from "@tauri-apps/api/path";
import {
  applyMscResolvedOverlayToScript2,
  type MscResolvedOverlayStatus,
} from "../../utils/mscResolvedOverlay";

export async function decompileMscScript(params: {
  inputPath: string;
  outputPath: string;
  logPath: string;
  mscFolderPath?: string | null;
}): Promise<void> {
  const resourcePath = await resourceDir();

  const command = await Command.create("exec-python", [
    resourcePath + "/tools/mscdec.py",
    params.inputPath,
    "-o",
    params.outputPath,
    "-log",
    params.logPath,
  ]).execute();

  if (command.code !== 0) {
    throw new Error(command.stderr || `mscdec failed for ${params.inputPath}`);
  }
}

export async function repackMscScript(params: {
  inputPath: string;
  outputPath: string;
  mscFolderPath?: string | null;
}): Promise<void> {
  const resourcePath = await resourceDir();

  const command = await Command.create(
    "exec-python",
    [
      resourcePath + "/tools/msclang.py",
      params.inputPath,
      "-o",
      params.outputPath,
      "-i",
    ],
    { encoding: "utf-8" },
  ).execute();

  if (command.code !== 0) {
    throw new Error(command.stderr || `msclang failed for ${params.inputPath}`);
  }
}

export async function resolveMscActionOverlayForFolder(scriptFolder: string): Promise<{
  script2Path: string;
  updatedPath: string | null;
  status: MscResolvedOverlayStatus;
  actionCount: number;
  slotCallbackCount: number;
  weaponBindingCount: number;
  resourceBindingCount: number;
  orphanActionFunctionCount: number;
  legacyAliasCount: number;
  renamedCallbackCount: number;
}> {
  const script0Path = await join(scriptFolder, "0.c");
  const script2Path = await join(scriptFolder, "2.c");
  if (!(await exists(script0Path))) {
    throw new Error("MSC workspace: 0.c not found, cannot generate resolved overlay");
  }
  if (!(await exists(script2Path))) {
    throw new Error("MSC workspace: 2.c not found, cannot generate resolved overlay");
  }

  const script0Content = await readTextFile(script0Path);
  const script2Content = await readTextFile(script2Path);
  const result = applyMscResolvedOverlayToScript2({
    script0Content,
    script2Content,
  });
  const updatedPath = result.updatedScript2Content === null ? null : script2Path;
  if (updatedPath && result.updatedScript2Content) {
    await writeTextFile(updatedPath, result.updatedScript2Content);
  }

  return {
    script2Path,
    updatedPath,
    status: result.status,
    actionCount: result.evidence.actions.length,
    slotCallbackCount: result.evidence.slotCallbacks.length,
    weaponBindingCount: result.evidence.weaponBindings.length,
    resourceBindingCount: result.evidence.resourceBindings.length,
    orphanActionFunctionCount: result.evidence.orphanActionFunctions.length,
    legacyAliasCount: result.legacyAliasCount,
    renamedCallbackCount: result.renamedCallbackCount,
  };
}
