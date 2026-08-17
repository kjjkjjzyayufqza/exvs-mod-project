import { invoke } from "@tauri-apps/api/core";
import { toWindowsPath } from "./unitModelRepackService";

export type NumatbProfileFixEntry = {
  fileIndex: number;
  oldFilename: string;
  newFilename: string;
  oldFileUrl: string;
  newFileUrl: string;
  contentProfile: string;
  nameProfileBefore: string | null;
};

export type NumatbProfileFixReport = {
  scanned: number;
  fixed: number;
  skipped: number;
  fixes: NumatbProfileFixEntry[];
  warnings: string[];
};

export async function analyzeUnitModelNumatbProfiles(params: {
  modelRoot: string;
  structureJsonPath: string;
}): Promise<NumatbProfileFixReport> {
  return await invoke<NumatbProfileFixReport>("analyze_unit_model_numatb_profiles", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
  });
}

export async function fixUnitModelNumatbProfiles(params: {
  modelRoot: string;
  structureJsonPath: string;
}): Promise<NumatbProfileFixReport> {
  return await invoke<NumatbProfileFixReport>("fix_unit_model_numatb_profiles", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
  });
}
