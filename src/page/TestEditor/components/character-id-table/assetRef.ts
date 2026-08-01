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

/**
 * Existence flags:
 * - `boolean` — probed (true/false)
 * - `null` — not probed yet (UI should show loading, not missing)
 */
export interface AssetRefInfo {
  fieldKey: string;
  routeId: string;
  rawValue: number;
  hashHex: string;
  sourceFilePath: string; // Expected path in OB dplcache
  modFilePath: string; // Expected path in OB mod directory
  sourceExists: boolean | null;
  modExists: boolean | null;
  workspaceExists: boolean | null;
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
  /**
   * When true (default), probe OB/MOD/WS existence on disk.
   * When false, only compute expected paths and leave existence as `null`
   * (except value 0, which is known-missing without I/O).
   * Prefer false for list/selection path building; probe only when viewing an item.
   */
  probeExistence?: boolean;
}

async function resolveFhm2dPath(baseDir: string, hashHex: string): Promise<{
  filePath: string;
  exists: boolean;
}> {
  if (!baseDir) return { filePath: "", exists: false };
  const sourceUpper = await join(baseDir, `${hashHex}.fhm2d`);
  const sourceLower = await join(baseDir, `${hashHex.toLowerCase()}.fhm2d`);
  if (await exists(sourceUpper)) return { filePath: sourceUpper, exists: true };
  if (await exists(sourceLower)) return { filePath: sourceLower, exists: true };
  return { filePath: sourceUpper, exists: false };
}

async function buildDefaultFhm2dPath(baseDir: string, hashHex: string): Promise<string> {
  if (!baseDir) return "";
  return join(baseDir, `${hashHex}.fhm2d`);
}

function emptyWorkspacePack(configured: ExistingFhm2dPackResolution["configured"]): ExistingFhm2dPackResolution {
  return {
    configured,
    existing: null,
    sourceLayout: "missing",
    folderExists: false,
    structureJsonExists: false,
    duplicateLayout: false,
  };
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
          // Positional callers (registry / legacy) historically always probed.
          probeExistence: true,
        }
      : paramsOrFieldKey;
  const { fieldKey, workspaceRoot, workspaceDocument } = params;
  const probeExistence = params.probeExistence !== false;
  const hashHex = int32ToHashHex(params.value);
  const lower = fieldKey.toLowerCase();
  const routeId = getCharacterAssetRouteId(fieldKey);
  const isModel = lower === "model";
  const isEffectAsset = lower === "effect";
  const isParamAsset = lower === "param";
  const isMscAsset = lower === "msc";
  const isMotionAsset = lower === "motion";
  const isSoundAsset = lower === "sound";

  if (params.value === 0) {
    const [sourceFilePath, modFilePath, configured] = await Promise.all([
      buildDefaultFhm2dPath(params.obDplCachePath, hashHex),
      buildDefaultFhm2dPath(params.obModPath, hashHex),
      resolveFhm2dPackPaths(workspaceRoot, workspaceDocument, routeId, hashHex),
    ]);
    const workspacePack = emptyWorkspacePack(configured);

    return {
      fieldKey,
      routeId,
      rawValue: params.value,
      hashHex,
      sourceFilePath,
      modFilePath,
      sourceExists: false,
      modExists: false,
      workspaceExists: false,
      workspacePack,
      workspaceFolderPath: configured.folderPath,
      isModel,
      isEffectAsset,
      isParamAsset,
      isMscAsset,
      isMotionAsset,
      isSoundAsset,
    };
  }

  if (!probeExistence) {
    const [sourceFilePath, modFilePath, configured] = await Promise.all([
      buildDefaultFhm2dPath(params.obDplCachePath, hashHex),
      buildDefaultFhm2dPath(params.obModPath, hashHex),
      resolveFhm2dPackPaths(workspaceRoot, workspaceDocument, routeId, hashHex),
    ]);
    const workspacePack = emptyWorkspacePack(configured);

    return {
      fieldKey,
      routeId,
      rawValue: params.value,
      hashHex,
      sourceFilePath,
      modFilePath,
      sourceExists: null,
      modExists: null,
      workspaceExists: null,
      workspacePack,
      workspaceFolderPath: configured.folderPath,
      isModel,
      isEffectAsset,
      isParamAsset,
      isMscAsset,
      isMotionAsset,
      isSoundAsset,
    };
  }

  const [sourceFile, modFile, workspacePack] = await Promise.all([
    resolveFhm2dPath(params.obDplCachePath, hashHex),
    resolveFhm2dPath(params.obModPath, hashHex),
    workspaceRoot
      ? resolveExistingFhm2dPack(workspaceRoot, workspaceDocument, routeId, hashHex)
      : resolveFhm2dPackPaths(
          "",
          workspaceDocument,
          routeId,
          hashHex,
        ).then((configured) => emptyWorkspacePack(configured)),
  ]);
  const workspaceFolderPath =
    workspacePack.existing?.folderPath ?? workspacePack.configured.folderPath;

  return {
    fieldKey,
    routeId,
    rawValue: params.value,
    hashHex,
    sourceFilePath: sourceFile.filePath,
    modFilePath: modFile.filePath,
    sourceExists: sourceFile.exists,
    modExists: modFile.exists,
    workspaceExists: Boolean(workspacePack.existing),
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
