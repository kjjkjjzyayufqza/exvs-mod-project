import { readFile, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { Buffer } from 'buffer';
import { ExtractFHMData, Fhm2d_type_format, ExtractType } from '@/models/fhm2d';
import { AssetRefInfo } from './assetRef';

export interface ExtractResult {
  success: boolean;
  path?: string;
  error?: string;
  /** Present when extraction finished but numdlb/nutexb naming failed (see `*_structure.json` __namingError). */
  namingWarning?: string;
}

/**
 * Core logic for extracting a single FHM2D asset.
 */
export type ExtractAssetOptions = {
  /** When true, writes decompressed OB meta section to `meta.bin` in the output folder. */
  writeMetaBin?: boolean;
};

export async function getExtractOutputFolderCollisionInfo(
  extractOutputPath: string,
  hashHex: string
): Promise<{ targetDir: string; folderExists: boolean }> {
  const root = extractOutputPath.trim();
  if (!root) {
    return { targetDir: '', folderExists: false };
  }
  const targetDir = await join(root, hashHex);
  const folderExists = await invoke<boolean>('path_exists', { path: targetDir });
  return { targetDir, folderExists };
}

export async function extractAsset(
  asset: AssetRefInfo,
  extractOutputPath: string,
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

    if (!extractOutputPath) {
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

    const data = await readFile(asset.sourceFilePath);
    const buffer = Buffer.from(data);
    logExtractPhase('read source file');

    // Determine if it's Xboost or PS4 based on magic
    const magic = buffer.slice(0, 4).toString('hex').toUpperCase();
    if (magic !== 'B9B7B2CD' && magic !== '9992CD90') {
      return { success: false, error: `Unsupported file magic: ${magic}` };
    }
    logExtractPhase('validate FHM2D magic');

    const targetDir = await join(extractOutputPath, asset.hashHex);
    logExtractPhase('resolve target directory');

    const extractFormat: Fhm2d_type_format | undefined = asset.isEffectAsset
      ? Fhm2d_type_format.fhm2d_effect
      : asset.isModel
      ? Fhm2d_type_format.fhm2d_character
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
      options?.writeMetaBin === true
    );
    logExtractPhase('ExtractFHMData');
    console.log(`[FHM2D Extract] total (Extract to Output Folder): ${(performance.now() - extractT0).toFixed(2)}ms`);

    return {
      success: true,
      path: targetDir,
      namingWarning: extractResult.namingError,
    };
  } catch (err: any) {
    console.error('Extraction failed:', err);
    return { success: false, error: err.message || 'Unknown error during extraction' };
  }
}
