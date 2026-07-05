import { invoke } from "@tauri-apps/api/core";

export type CopyAssetAsNewParams = {
  sourceFolderPath: string;
  sourceStructureJsonPath: string;
  destinationAssetRootDir: string;
  oldHashHex: string;
  seed: string;
  fieldKey: string;
};

export type CopyAssetAsNewResult = {
  newHashHex: string;
  newRawValue: number;
  newFolderPath: string;
  newStructureJsonPath: string;
  updatedFileUrlCount: number;
};

export async function copyAssetAsNew(params: CopyAssetAsNewParams): Promise<CopyAssetAsNewResult> {
  return await invoke<CopyAssetAsNewResult>("copy_asset_as_new", {
    sourceFolderPath: params.sourceFolderPath,
    sourceStructureJsonPath: params.sourceStructureJsonPath,
    destinationAssetRootDir: params.destinationAssetRootDir,
    oldHashHex: params.oldHashHex,
    seed: params.seed,
    fieldKey: params.fieldKey,
  });
}
