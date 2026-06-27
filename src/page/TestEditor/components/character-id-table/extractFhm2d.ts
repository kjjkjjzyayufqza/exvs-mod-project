import { exists, readFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { Buffer } from 'buffer';
import { ExtractFHMData, Fhm2d_type_format, ExtractType } from '@/models/fhm2d';
import { extractUnitModelToFolder } from '@/page/UnitModelEdit/utils/unitModelExtractService';
import { AssetRefInfo } from './assetRef';
import type { ResolvedFhm2dPackPaths } from "@/services/testEditorWorkspace/paths";

export interface ExtractResult {
  success: boolean;
  path?: string;
  error?: string;
  /** Present when extraction finished but numdlb/nutexb naming failed (see `*_structure.json` __namingError). */
  namingWarning?: string;
  modelCount?: number;
  totalFiles?: number;
}

/**
 * Core logic for extracting a single FHM2D asset.
 */
export type ExtractAssetOptions = {
  /** When true, writes decompressed OB meta section to `meta.bin` in the output folder. */
  writeMetaBin?: boolean;
};

export async function getExtractOutputFolderCollisionInfo(
  target: ResolvedFhm2dPackPaths,
): Promise<{ targetDir: string; folderExists: boolean }> {
  const targetDir = target.folderPath;
  const folderExists = await invoke<boolean>('path_exists', { path: targetDir });
  return { targetDir, folderExists };
}

async function extractModelAsset(
  asset: AssetRefInfo,
  targetDir: string,
  writeMetaBin: boolean,
  logExtractPhase: (label: string) => void,
): Promise<ExtractResult> {
  const extractResult = await extractUnitModelToFolder(
    asset.sourceFilePath,
    targetDir,
    { writeMetaBin },
  );
  logExtractPhase('extractUnitModelToFolder');

  return {
    success: true,
    path: extractResult.modelRoot,
    modelCount: extractResult.modelCount,
    totalFiles: extractResult.totalFiles,
  };
}

async function extractFlatAsset(
  asset: AssetRefInfo,
  targetDir: string,
  writeMetaBin: boolean,
  logExtractPhase: (label: string) => void,
): Promise<ExtractResult> {
  const data = await readFile(asset.sourceFilePath);
  const buffer = Buffer.from(data);
  logExtractPhase('read source file');

  const magic = buffer.slice(0, 4).toString('hex').toUpperCase();
  if (magic !== 'B9B7B2CD' && magic !== '9992CD90') {
    return { success: false, error: `Unsupported file magic: ${magic}` };
  }
  logExtractPhase('validate FHM2D magic');

  const extractFormat: Fhm2d_type_format | undefined = asset.isEffectAsset
    ? Fhm2d_type_format.fhm2d_effect
    : asset.isParamAsset
      ? Fhm2d_type_format.fhm2d_character_param
      : asset.isMscAsset
        ? Fhm2d_type_format.fhm2d_msc
        : asset.isMotionAsset
          ? Fhm2d_type_format.fhm2d_motion
          : asset.isSoundAsset
            ? Fhm2d_type_format.fhm2d_sound
            : undefined;

  const extractResult = await ExtractFHMData(
    asset.sourceFilePath,
    targetDir,
    ExtractType.SingleFolder,
    extractFormat,
    undefined,
    writeMetaBin,
  );
  logExtractPhase('ExtractFHMData');

  return {
    success: true,
    path: targetDir,
    namingWarning: extractResult.namingError,
  };
}

export async function extractAsset(
  asset: AssetRefInfo,
  target: ResolvedFhm2dPackPaths,
  options?: ExtractAssetOptions
): Promise<ExtractResult> {
  try {
    if (!asset.sourceFilePath) {
      return { success: false, error: 'Source path not configured' };
    }

    const sourceExists = await exists(asset.sourceFilePath);
    if (!sourceExists) {
      return { success: false, error: `Source file not found: ${asset.sourceFilePath}` };
    }

    if (!target.folderPath) {
      return { success: false, error: 'Extract output path not configured' };
    }

    const extractT0 = performance.now();
    let extractLast = extractT0;
    const logExtractPhase = (label: string) => {
      const now = performance.now();
      console.log(
        `[FHM2D Extract] ${label}: +${(now - extractLast).toFixed(2)}ms (since start ${(now - extractT0).toFixed(2)}ms)`
      );
      extractLast = now;
    };

    const targetDir = target.folderPath;
    logExtractPhase('resolve target directory');

    const writeMetaBin = options?.writeMetaBin === true;
    const result = asset.isModel
      ? await extractModelAsset(asset, targetDir, writeMetaBin, logExtractPhase)
      : await extractFlatAsset(asset, targetDir, writeMetaBin, logExtractPhase);

    console.log(`[FHM2D Extract] total (Extract to Output Folder): ${(performance.now() - extractT0).toFixed(2)}ms`);
    return result;
  } catch (err: any) {
    console.error('Extraction failed:', err);
    return { success: false, error: err.message || 'Unknown error during extraction' };
  }
}
