import { join } from '@tauri-apps/api/path';
import { exists } from '@tauri-apps/plugin-fs';
import {
  CHARACTER_ASSET_ROUTE_BY_FIELD,
  DEFAULT_TEST_EDITOR_WORKSPACE,
} from "@/services/testEditorWorkspace/defaults";
import {
  resolveExistingFhm2dPack,
  resolveFhm2dPackPaths,
  type ExistingFhm2dPackResolution,
} from "@/services/testEditorWorkspace/paths";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";

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
  routeId: string;
  rawValue: number;
  hashHex: string;
  sourceFilePath: string; // Expected path in OB dplcache
  modFilePath: string; // Expected path in OB mod directory
  workspacePack: ExistingFhm2dPackResolution;
  workspaceFolderPath: string; // Compatibility alias for the existing or configured workspace folder.
  isModel: boolean;
  /** Field key `Effect` — same extract layout as model (`hashHex` folder), lighter FHM naming. */
  isEffectAsset: boolean;
  isParamAsset: boolean;
  isMscAsset: boolean;
  isMotionAsset: boolean;
  isSoundAsset: boolean;
}

export interface GetAssetRefInfoParams {
  fieldKey: string;
  value: number;
  obDplCachePath: string;
  obModPath: string;
  workspaceRoot: string;
  workspaceDocument: TestEditorWorkspaceDocument;
}

async function resolveFhm2dPath(baseDir: string, hashHex: string): Promise<string> {
  if (!baseDir) return '';
  const sourceUpper = await join(baseDir, `${hashHex}.fhm2d`);
  const sourceLower = await join(baseDir, `${hashHex.toLowerCase()}.fhm2d`);
  if (await exists(sourceUpper)) return sourceUpper;
  if (await exists(sourceLower)) return sourceLower;
  return sourceUpper;
}

export function getCharacterAssetRouteId(fieldKey: string): string {
  const routeId = CHARACTER_ASSET_ROUTE_BY_FIELD[fieldKey];
  if (routeId) return routeId;

  const lowerFieldKey = fieldKey.toLowerCase();
  const match = Object.entries(CHARACTER_ASSET_ROUTE_BY_FIELD).find(
    ([key]) => key.toLowerCase() === lowerFieldKey,
  );
  if (match) return match[1];

  throw new Error(`No workspace asset route is configured for Character ID field "${fieldKey}".`);
}

export async function getAssetRefInfo(params: GetAssetRefInfoParams): Promise<AssetRefInfo>;
export async function getAssetRefInfo(
  fieldKey: string,
  value: number,
  obDplCachePath: string,
  obModPath: string,
  currentDir: string
): Promise<AssetRefInfo>;
export async function getAssetRefInfo(
  paramsOrFieldKey: GetAssetRefInfoParams | string,
  value?: number,
  obDplCachePath?: string,
  obModPath?: string,
  currentDir?: string,
): Promise<AssetRefInfo> {
  const params: GetAssetRefInfoParams =
    typeof paramsOrFieldKey === "string"
      ? {
          fieldKey: paramsOrFieldKey,
          value: value ?? 0,
          obDplCachePath: obDplCachePath ?? "",
          obModPath: obModPath ?? "",
          workspaceRoot: currentDir ?? "",
          workspaceDocument: DEFAULT_TEST_EDITOR_WORKSPACE,
        }
      : paramsOrFieldKey;
  const { fieldKey, workspaceRoot, workspaceDocument } = params;
  const hashHex = int32ToHashHex(params.value);
  const lower = fieldKey.toLowerCase();
  const routeId = getCharacterAssetRouteId(fieldKey);
  const isModel = lower === "model";
  const isEffectAsset = lower === "effect";
  const isParamAsset = lower === "param";
  const isMscAsset = lower === "msc";
  const isMotionAsset = lower === "motion";
  const isSoundAsset = lower === "sound";

  // Construct paths
  // Source: {obDplCachePath}\0x{HEX}.fhm2d
  // Read paths should tolerate existing lowercase file names.
  const sourceFilePath = await resolveFhm2dPath(params.obDplCachePath, hashHex);
  const modFilePath = await resolveFhm2dPath(params.obModPath, hashHex);
  
  const workspacePack = workspaceRoot
    ? await resolveExistingFhm2dPack(workspaceRoot, workspaceDocument, routeId, hashHex)
    : {
        configured: await resolveFhm2dPackPaths(
          "",
          workspaceDocument,
          routeId,
          hashHex,
        ),
        existing: null,
        sourceLayout: "missing" as const,
        folderExists: false,
        structureJsonExists: false,
        duplicateLayout: false,
      };
  const workspaceFolderPath =
    workspacePack.existing?.folderPath ?? workspacePack.configured.folderPath;

  return {
    fieldKey,
    routeId,
    rawValue: params.value,
    hashHex,
    sourceFilePath,
    modFilePath,
    workspacePack,
    workspaceFolderPath,
    isModel,
    isEffectAsset,
    isParamAsset,
    isMscAsset,
    isMotionAsset,
    isSoundAsset,
  };
}
