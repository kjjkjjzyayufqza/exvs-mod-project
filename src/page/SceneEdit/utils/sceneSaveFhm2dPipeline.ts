import { invoke } from "@tauri-apps/api/core";

import type { SaveStepInfo } from "../components/SaveProgressDialog";
import {
  executeSaveFolderPipeline,
  type SaveFolderParams,
  type SaveFolderResult,
} from "./sceneSaveFolderPipeline";
import { resolveStagePackStructureTarget } from "./sceneStageStructure";
import type {
  ExvsStageValidationError,
  ExvsStageValidationResult,
} from "./sceneSessionService";

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

type PreservedStageRepackResult = {
  outputPath: string;
  totalFiles: number;
  outputSize: number;
  modelsProcessed: number;
  texturesCopied: number;
  texturesFolderRemoved: boolean;
  warnings: string[];
  validation: ExvsStageValidationResult;
};

export async function executeSaveFhm2dPipeline(params: SaveFhm2dParams): Promise<SaveFhm2dResult> {
  const { outputFhm2dPath, onProgress, ...folderParams } = params;

  fhm2dLog(`Starting pipeline — output: ${outputFhm2dPath}`);
  const folderResult = await executeSaveFolderPipeline({
    ...folderParams,
    onProgress,
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

  fhm2dLog("Packing FHM2D binary from isolated workspace...");
  onProgress({
    id: "fhm2d",
    label: "Packing FHM2D from isolated workspace...",
    status: "running",
  });

  try {
    const repackResult = await invoke<PreservedStageRepackResult>(
      "repack_stage_fhm2d_preserving_shared_textures",
      {
        stageRoot: packRoot,
        outputPath: outputFhm2dPath,
        atomicWrite: true,
      },
    );

    if (!repackResult.validation.valid) {
      fhm2dLog(`Repack validation failed: ${repackResult.validation.errors.length} error(s)`);
      onProgress({
        id: "fhm2d",
        label: "Packing FHM2D from isolated workspace...",
        status: "error",
        error: `${repackResult.validation.errors.length} texture/structure issue(s) block packing`,
      });
      return {
        ...folderResult,
        success: false,
        fhm2dPath: outputFhm2dPath,
        fhm2dSizeBytes: 0,
        validationErrors: repackResult.validation.errors,
      };
    }

    const sizeMb = (repackResult.outputSize / (1024 * 1024)).toFixed(1);
    fhm2dLog(
      `Pack complete — ${sizeMb} MB, staged ${repackResult.texturesCopied} textures for ${repackResult.modelsProcessed} models`,
    );
    onProgress({
      id: "fhm2d",
      label: "Packing FHM2D from isolated workspace...",
      status: "done",
      detail: `${sizeMb} MB`,
    });

    fhm2dLog("Pipeline complete");
    return {
      ...folderResult,
      fhm2dPath: outputFhm2dPath,
      fhm2dSizeBytes: repackResult.outputSize,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SaveFHM2D] Pack failed:", msg);
    onProgress({
      id: "fhm2d",
      label: "Packing FHM2D from isolated workspace...",
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
