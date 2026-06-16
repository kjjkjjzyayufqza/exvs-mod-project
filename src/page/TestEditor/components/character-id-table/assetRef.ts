import { join } from '@tauri-apps/api/path';
import { exists, readDir } from '@tauri-apps/plugin-fs';

/**
 * Converts an int32 value to a standard 8-character uppercase hex string with '0x' prefix.
 * Used for folder names and file matching.
 * Example: 123 -> 0x0000007B
 */
export function int32ToHashHex(value: number): string {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

export interface AssetRefInfo {
  fieldKey: string;
  rawValue: number;
  hashHex: string;
  sourceFilePath: string; // Expected path in OB dplcache
  modFilePath: string; // Expected path in OB mod directory
  workspaceFolderPath: string; // Expected folder path in current workspace root
  isModel: boolean;
  /** Field key `Effect` — same extract layout as model (`hashHex` folder), lighter FHM naming. */
  isEffectAsset: boolean;
  isParamAsset: boolean;
  isMscAsset: boolean;
  isMotionAsset: boolean;
  isSoundAsset: boolean;
}

async function resolveFhm2dPath(baseDir: string, hashHex: string): Promise<string> {
  if (!baseDir) return '';
  const sourceUpper = await join(baseDir, `${hashHex}.fhm2d`);
  const sourceLower = await join(baseDir, `${hashHex.toLowerCase()}.fhm2d`);
  if (await exists(sourceUpper)) return sourceUpper;
  if (await exists(sourceLower)) return sourceLower;
  return sourceUpper;
}

async function resolveWorkspaceFolderPath(baseDir: string, hashHex: string): Promise<string> {
  if (!baseDir) return '';
  const fallback = await join(baseDir, hashHex);
  try {
    if (!(await exists(fallback))) return fallback;
    const entries = await readDir(baseDir);
    const match = entries.find(
      (entry) => entry.isDirectory && entry.name.toLowerCase() === hashHex.toLowerCase(),
    );
    if (match) return await join(baseDir, match.name);
  } catch {
    return fallback;
  }
  return fallback;
}

export async function getAssetRefInfo(
  fieldKey: string,
  value: number,
  obDplCachePath: string,
  obModPath: string,
  currentDir: string
): Promise<AssetRefInfo> {
  const hashHex = int32ToHashHex(value);
  const lower = fieldKey.toLowerCase();
  const isModel = lower === "model";
  const isEffectAsset = lower === "effect";
  const isParamAsset = lower === "param";
  const isMscAsset = lower === "msc";
  const isMotionAsset = lower === "motion";
  const isSoundAsset = lower === "sound";

  // Construct paths
  // Source: {obDplCachePath}\0x{HEX}.fhm2d
  // Read paths should tolerate existing lowercase file names.
  const sourceFilePath = await resolveFhm2dPath(obDplCachePath, hashHex);
  const modFilePath = await resolveFhm2dPath(obModPath, hashHex);
  
  // Workspace: {currentDir}\0x{HEX} — use on-disk folder casing for tree reveal.
  const workspaceFolderPath = currentDir ? await resolveWorkspaceFolderPath(currentDir, hashHex) : '';

  return {
    fieldKey,
    rawValue: value,
    hashHex,
    sourceFilePath,
    modFilePath,
    workspaceFolderPath,
    isModel,
    isEffectAsset,
    isParamAsset,
    isMscAsset,
    isMotionAsset,
    isSoundAsset,
  };
}
