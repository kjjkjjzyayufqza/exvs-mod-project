import { stat } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";

import type { SaveStepInfo } from "../components/SaveProgressDialog";
import type { StageBundleResponse } from "./sceneSavePipeline";
import {
  executeSaveFolderPipeline,
  type SaveFolderParams,
  type SaveFolderResult,
} from "./sceneSaveFolderPipeline";
import { resolveStagePackStructureTarget } from "./sceneStageStructure";
import { repackFolderToFhm2dFile } from "@/utils/repackRunner";
import { validateStageForRepack, type ExvsStageValidationError } from "./sceneSessionService";

export type SaveFhm2dParams = SaveFolderParams & {
  outputFhm2dPath: string;
};

export type SaveFhm2dResult = SaveFolderResult & {
  fhm2dPath: string;
  fhm2dSizeBytes: number;
  /** Populated when the post-redistribute repack validation (case B) blocks packing. */
  validationErrors?: ExvsStageValidationError[];
};

function fhm2dLog(msg: string) {
  console.log(`[SaveFHM2D] ${msg}`);
}

export async function executeSaveFhm2dPipeline(params: SaveFhm2dParams): Promise<SaveFhm2dResult> {
  const { outputFhm2dPath, onProgress, ...folderParams } = params;

  fhm2dLog(`Starting pipeline — output: ${outputFhm2dPath}`);
  const folderResult = await executeSaveFolderPipeline({
    ...folderParams,
    onProgress,
    skipStructureRebuild: true,
  });

  if (!folderResult.success) {
    fhm2dLog("Folder save failed, aborting FHM2D pack");
    return {
      ...folderResult,
      fhm2dPath: outputFhm2dPath,
      fhm2dSizeBytes: 0,
    };
  }

  const packTarget = resolveStagePackStructureTarget(params.stageRoot);
  const packRoot = packTarget.packRoot;
  fhm2dLog(`Resolved pack root: ${packRoot}`);

  // Populate model textures: read numatb refs, copy nutexb from textures/ to per-model subdirs
  fhm2dLog("Populating model textures from numatb refs...");
  onProgress({ id: "redistribute", label: "Populating model textures...", status: "running" });

  try {
    const redistResult = await invoke<{ modelsProcessed: number; texturesCopied: number; texturesFolderRemoved: boolean; warnings: string[] }>(
      "redistribute_stage_textures",
      { stageRoot: packRoot },
    );
    fhm2dLog(`Populated: ${redistResult.texturesCopied} textures to ${redistResult.modelsProcessed} models`);
    onProgress({
      id: "redistribute",
      label: "Populating model textures...",
      status: "done",
      detail: `${redistResult.texturesCopied} textures → ${redistResult.modelsProcessed} models`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SaveFHM2D] Populate model textures failed:", msg);
    onProgress({
      id: "redistribute",
      label: "Populating model textures...",
      status: "error",
      error: msg,
    });
    return {
      ...folderResult,
      success: false,
      fhm2dPath: outputFhm2dPath,
      fhm2dSizeBytes: 0,
    };
  }

  // Second gate (case B): now that textures live in per-model 0//1/ subdirs,
  // verify every numatb texture reference exists on disk + structural checks.
  fhm2dLog("Validating stage for repack...");
  onProgress({ id: "validate-repack", label: "Validating stage for repack...", status: "running" });
  try {
    const validation = await validateStageForRepack(packRoot);
    if (!validation.valid) {
      fhm2dLog(`Repack validation failed: ${validation.errors.length} error(s)`);
      onProgress({
        id: "validate-repack",
        label: "Validating stage for repack...",
        status: "error",
        error: `${validation.errors.length} texture/structure issue(s) block packing`,
      });
      return {
        ...folderResult,
        success: false,
        fhm2dPath: outputFhm2dPath,
        fhm2dSizeBytes: 0,
        validationErrors: validation.errors,
      };
    }
    onProgress({ id: "validate-repack", label: "Validating stage for repack...", status: "done" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SaveFHM2D] Repack validation failed:", msg);
    onProgress({
      id: "validate-repack",
      label: "Validating stage for repack...",
      status: "error",
      error: msg,
    });
    return {
      ...folderResult,
      success: false,
      fhm2dPath: outputFhm2dPath,
      fhm2dSizeBytes: 0,
    };
  }

  // Rebuild structure JSON from the now-correct disk layout (per-model texture subdirs)
  fhm2dLog("Rebuilding structure JSON...");
  onProgress({ id: "rebuild-structure", label: "Rebuilding structure JSON...", status: "running" });

  try {
    const structurePath = await invoke<string>(
      "rebuild_stage_structure_json_forced",
      { stageRoot: packRoot },
    );
    fhm2dLog(`Structure JSON rebuilt: ${structurePath}`);
    onProgress({
      id: "rebuild-structure",
      label: "Rebuilding structure JSON...",
      status: "done",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SaveFHM2D] Structure rebuild failed:", msg);
    onProgress({
      id: "rebuild-structure",
      label: "Rebuilding structure JSON...",
      status: "error",
      error: msg,
    });
    return {
      ...folderResult,
      success: false,
      fhm2dPath: outputFhm2dPath,
      fhm2dSizeBytes: 0,
    };
  }

  fhm2dLog("Packing FHM2D binary...");
  onProgress({ id: "fhm2d", label: "Packing FHM2D...", status: "running" });

  try {
    fhm2dLog(`Pack root: ${packTarget.packRoot}, structure: ${packTarget.structurePath}`);
    await repackFolderToFhm2dFile({
      structurePath: packTarget.structurePath,
      inputFolderPath: packTarget.packRoot,
      outputFilePath: outputFhm2dPath,
    });

    const fileInfo = await stat(outputFhm2dPath);
    const sizeMb = (fileInfo.size / (1024 * 1024)).toFixed(1);
    fhm2dLog(`Pack complete — ${sizeMb} MB`);
    onProgress({
      id: "fhm2d",
      label: "Packing FHM2D...",
      status: "done",
      detail: `${sizeMb} MB`,
    });

    fhm2dLog("Pipeline complete");
    return {
      ...folderResult,
      fhm2dPath: outputFhm2dPath,
      fhm2dSizeBytes: fileInfo.size,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SaveFHM2D] Pack failed:", msg);
    onProgress({
      id: "fhm2d",
      label: "Packing FHM2D...",
      status: "error",
      error: msg,
    });
    return {
      ...folderResult,
      success: false,
      fhm2dPath: outputFhm2dPath,
      fhm2dSizeBytes: 0,
    };
  }
}
