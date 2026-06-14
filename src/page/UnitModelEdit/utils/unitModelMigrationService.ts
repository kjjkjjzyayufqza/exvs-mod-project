import { invoke } from "@tauri-apps/api/core";

import { toWindowsPath } from "./unitModelRepackService";

export type UnitModelMigrationState = "notUnit" | "current" | "legacy";

export interface UnitModelMigrationAnalysis {
  modelRoot: string;
  structureJsonPath: string | null;
  state: UnitModelMigrationState;
  canMigrate: boolean;
  reason: string | null;
  modelCount: number;
  totalFiles: number;
  plannedFileMoves: number;
  plannedFileUrlUpdates: number;
  warnings: string[];
}

export interface UnitModelMigrationResult {
  modelRoot: string;
  structureJsonPath: string;
  migrated: boolean;
  modelCount: number;
  totalFiles: number;
  movedFiles: number;
  updatedFileUrls: number;
  removedLegacyFiles: string[];
  backupStructureJsonPath: string | null;
  warnings: string[];
}

export async function analyzeUnitModelFolderMigration(
  modelRoot: string,
  structureJsonPath?: string | null,
): Promise<UnitModelMigrationAnalysis> {
  return await invoke<UnitModelMigrationAnalysis>("analyze_unit_model_folder_migration", {
    modelRoot: toWindowsPath(modelRoot),
    structureJsonPath: structureJsonPath ? toWindowsPath(structureJsonPath) : undefined,
  });
}

export async function migrateUnitModelFolderLayout(
  modelRoot: string,
  structureJsonPath?: string | null,
): Promise<UnitModelMigrationResult> {
  return await invoke<UnitModelMigrationResult>("migrate_unit_model_folder_layout", {
    modelRoot: toWindowsPath(modelRoot),
    structureJsonPath: structureJsonPath ? toWindowsPath(structureJsonPath) : undefined,
  });
}
