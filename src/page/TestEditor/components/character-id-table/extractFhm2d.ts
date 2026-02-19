import { readFile, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { Buffer } from 'buffer';
import { ExtractFHMData, Fhm2d_type_format, Fhm2dData, PS4FhmData, ExtractType } from '@/models/fhm2d';
import { AssetRefInfo } from './assetRef';

export interface ExtractResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Core logic for extracting a single FHM2D asset.
 */
export async function extractAsset(
  asset: AssetRefInfo,
  extractOutputPath: string
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

    const data = await readFile(asset.sourceFilePath);
    const buffer = Buffer.from(data);
    
    // Determine if it's Xboost or PS4 based on magic
    const magic = buffer.slice(0, 4).toString('hex').toUpperCase();
    let fhm2d: Fhm2dData | PS4FhmData;
    
    if (magic === 'B9B7B2CD') {
      fhm2d = new Fhm2dData(buffer);
    } else if (magic === '9992CD90') {
      fhm2d = new PS4FhmData(buffer);
    } else {
      return { success: false, error: `Unsupported file magic: ${magic}` };
    }

    const targetDir = await join(extractOutputPath, asset.hashHex);

    // Call existing extraction logic
    await ExtractFHMData(
      fhm2d,
      targetDir,
      ExtractType.SingleFolder,
      asset.isModel ? Fhm2d_type_format.fhm2d_character : undefined
    );

    return { success: true, path: targetDir };
  } catch (err: any) {
    console.error('Extraction failed:', err);
    return { success: false, error: err.message || 'Unknown error during extraction' };
  }
}
