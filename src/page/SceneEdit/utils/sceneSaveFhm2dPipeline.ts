import { stat } from "@tauri-apps/plugin-fs";

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

export async function executeSaveFhm2dPipeline(params: SaveFhm2dParams): Promise<SaveFhm2dResult> {
  const { outputFhm2dPath, onProgress, ...folderParams } = params;

  const folderResult = await executeSaveFolderPipeline({ ...folderParams, onProgress });

  if (!folderResult.success) {
    return {
      ...folderResult,
      fhm2dPath: outputFhm2dPath,
      fhm2dSizeBytes: 0,
    };
  }

  onProgress({ id: "fhm2d", label: "Packing FHM2D...", status: "running" });

  try {
    const target = resolveStagePackStructureTarget(params.stageRoot);
    await repackFolderToFhm2dFile({
      structurePath: target.structurePath,
      inputFolderPath: target.packRoot,
      outputFilePath: outputFhm2dPath,
    });

    const fileInfo = await stat(outputFhm2dPath);
    onProgress({
      id: "fhm2d",
      label: "Packing FHM2D...",
      status: "done",
      detail: `${(fileInfo.size / (1024 * 1024)).toFixed(1)} MB`,
    });

    return {
      ...folderResult,
      fhm2dPath: outputFhm2dPath,
      fhm2dSizeBytes: fileInfo.size,
    };
  } catch (err) {
    onProgress({
      id: "fhm2d",
      label: "Packing FHM2D...",
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ...folderResult,
      success: false,
      fhm2dPath: outputFhm2dPath,
      fhm2dSizeBytes: 0,
    };
  }
}
