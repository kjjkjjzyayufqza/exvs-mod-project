import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import {
  applyMscResolvedOverlayToScript2,
  type MscResolvedOverlayStatus,
} from "../../utils/mscResolvedOverlay";
import { getMscRepackOutputPath } from "../../utils/mscWorkspaceUtils";
import { type MscRoundtripCompareReport } from "./mscPipeline";

export async function decompileMscScript(params: {
  inputPath: string;
  outputPath: string;
  logPath: string;
}): Promise<void> {
  await invoke("decompile_msc", {
    inputPath: params.inputPath,
    outputPath: params.outputPath,
    logPath: params.logPath,
  });
}

export async function repackMscScript(params: {
  inputPath: string;
  outputPath: string;
}): Promise<void> {
  await invoke("compile_msc", {
    inputPath: params.inputPath,
    outputPath: params.outputPath,
  });
}

export interface MscRoundtripVerifyResult {
  report: MscRoundtripCompareReport;
  originalPath: string;
}

/**
 * Round-trip verify: the Tauri backend compiles the C file in-process
 * (`crate::msc_toolchain`) and byte-compares against the original script.
 * The original script is never written.
 */
export async function verifyMscRoundtrip(params: {
  cFilePath: string;
}): Promise<MscRoundtripVerifyResult> {
  const originalPath = getMscRepackOutputPath(params.cFilePath);
  if (!(await exists(originalPath))) {
    throw new Error(
      `MSC round-trip verify: original script not found: ${originalPath}. Keep the source script next to its C file.`,
    );
  }

  const report = await invoke<MscRoundtripCompareReport>("verify_msc_roundtrip_from_c", {
    cPath: params.cFilePath,
    originalPath,
  });
  return { report, originalPath };
}

/**
 * Open a file with the configured external editor command via `cmd /C` so
 * PATH-resolved commands (cursor, code, notepad, ...) work unchanged.
 */
export async function openFileInExternalEditor(params: {
  filePath: string;
  editorCommand: string;
}): Promise<void> {
  const editorCommand = params.editorCommand.trim();
  if (editorCommand.length === 0) {
    throw new Error("MSC workspace: external editor command is empty. Configure it in the toolbar.");
  }

  const command = await Command.create("exec-cmd", ["/C", editorCommand, params.filePath]).execute();
  if (command.code !== 0) {
    const detail = command.stderr.trim() || `exit code ${command.code}`;
    throw new Error(
      `Failed to open ${params.filePath} with "${editorCommand}" (${detail}). ` +
        "Check the external editor command in the toolbar.",
    );
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
