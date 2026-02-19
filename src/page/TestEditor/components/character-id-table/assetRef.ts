import { join } from '@tauri-apps/api/path';

/**
 * Converts an int32 value to a standard 8-character uppercase hex string with '0x' prefix.
 * Used for folder names and file matching.
 * Example: 123 -> 0x0000007B
 */
export function int32ToHashHex(value: number): string {
  return `0x${(value >>> 0).toString(16).toLowerCase().padStart(8, '0')}`;
}

export interface AssetRefInfo {
  fieldKey: string;
  rawValue: number;
  hashHex: string;
  sourceFilePath: string; // Expected path in OB dplcache
  workspaceFolderPath: string; // Expected folder path in current workspace root
  isModel: boolean;
}

export async function getAssetRefInfo(
  fieldKey: string,
  value: number,
  obDplCachePath: string,
  currentDir: string
): Promise<AssetRefInfo> {
  const hashHex = int32ToHashHex(value);
  const isModel = fieldKey.toLowerCase() === 'model';
  
  // Construct paths
  // Source: {obDplCachePath}\0x{HEX}.fhm2d
  const sourceFilePath = obDplCachePath ? await join(obDplCachePath, `${hashHex}.fhm2d`) : '';
  
  // Workspace: {currentDir}\0x{HEX}
  const workspaceFolderPath = currentDir ? await join(currentDir, hashHex) : '';

  return {
    fieldKey,
    rawValue: value,
    hashHex,
    sourceFilePath,
    workspaceFolderPath,
    isModel,
  };
}
