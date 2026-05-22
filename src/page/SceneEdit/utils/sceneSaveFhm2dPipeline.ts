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

export type SaveFhm2dParams = SaveFolderParams & {
  outputFhm2dPath: string;
};

export type SaveFhm2dResult = SaveFolderResult & {
  fhm2dPath: string;
  fhm2dSizeBytes: number;
};

type RedistributeResult = {
  modelsProcessed: number;
  texturesCopied: number;
  texturesFolderRemoved: boolean;
  warnings: string[];
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

  fhm2dLog("Redistributing textures from shared folder to model subdirs...");
  onProgress({ id: "redistribute", label: "Redistributing textures...", status: "running" });

  try {
    const redistResult = await invoke<RedistributeResult>(
      "redistribute_stage_textures",
      { stageRoot: params.stageRoot },
    );
    const redistDetail = redistResult.texturesCopied > 0
      ? `${redistResult.modelsProcessed} models, ${redistResult.texturesCopied} textures`
      : "Not needed";
    fhm2dLog(`Redistribute done — ${redistDetail}`);
    if (redistResult.warnings.length > 0) {
      console.warn("[SaveFHM2D] Redistribute warnings:", redistResult.warnings);
    }
    onProgress({
      id: "redistribute",
      label: "Redistributing textures...",
      status: "done",
      detail: redistDetail,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SaveFHM2D] Redistribute failed:", msg);
    onProgress({
      id: "redistribute",
      label: "Redistributing textures...",
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
    const target = resolveStagePackStructureTarget(params.stageRoot);
    fhm2dLog(`Pack root: ${target.packRoot}, structure: ${target.structurePath}`);
    await repackFolderToFhm2dFile({
      structurePath: target.structurePath,
      inputFolderPath: target.packRoot,
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

    fhm2dLog("Restoring shared textures...");
    onProgress({ id: "restore-textures", label: "Restoring shared textures...", status: "running" });
    try {
      await invoke("restore_shared_textures", { stageRoot: params.stageRoot });
      fhm2dLog("Shared textures restored");
      onProgress({
        id: "restore-textures",
        label: "Restoring shared textures...",
        status: "done",
      });
    } catch (restoreErr) {
      const msg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
      console.error("[SaveFHM2D] Texture restore failed:", msg);
      onProgress({
        id: "restore-textures",
        label: "Restoring shared textures...",
        status: "error",
        error: msg,
      });
    }

    fhm2dLog("Pipeline complete");
    return {
      ...folderResult,
      fhm2dPath: outputFhm2dPath,
      fhm2dSizeBytes: fileInfo.size,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SaveFHM2D] Pack failed:", msg);
    try {
      fhm2dLog("Attempting best-effort texture restore after failure...");
      await invoke("restore_shared_textures", { stageRoot: params.stageRoot });
    } catch {
      console.warn("[SaveFHM2D] Best-effort texture restore also failed");
    }

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
