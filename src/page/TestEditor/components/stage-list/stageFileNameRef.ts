import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { int32ToHashHex } from "../character-id-table/assetRef";

export interface StageFileNamePaths {
  obFilePath: string;
  modFilePath: string;
  wsFolderPath: string;
  hashHex: string;
}

async function resolveFhm2dPath(baseDir: string, hashHex: string): Promise<string> {
  if (!baseDir) return "";
  const upper = await join(baseDir, `${hashHex}.fhm2d`);
  const lower = await join(baseDir, `${hashHex.toLowerCase()}.fhm2d`);
  if (await exists(upper)) return upper;
  if (await exists(lower)) return lower;
  return upper;
}

/**
 * Resolves OB/MOD/WS paths for stage fileName (int32 hash).
 * Same path pattern as Character ID Table: OB/MOD use .fhm2d, WS uses folder.
 */
export async function getStageFileNamePaths(
  fileNameValue: number,
  obDplCachePath: string,
  obModPath: string,
  workspacePath: string
): Promise<StageFileNamePaths> {
  const hashHex = int32ToHashHex(fileNameValue);
  const obFilePath = await resolveFhm2dPath(obDplCachePath, hashHex);
  const modFilePath = await resolveFhm2dPath(obModPath, hashHex);
  const wsFolderPath = workspacePath ? await join(workspacePath, hashHex) : "";
  return { obFilePath, modFilePath, wsFolderPath, hashHex };
}
