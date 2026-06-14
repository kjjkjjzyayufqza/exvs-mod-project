import { invoke } from "@tauri-apps/api/core";

import { toWindowsPath } from "./unitModelRepackService";

export interface UnitModelMutationResult {
  modelRoot: string;
  structureJsonPath: string;
  modelCount: number;
  totalFiles: number;
  removedFiles: string[];
}

/**
 * Remove a whole model (its model-file folder + paired nuhlpb) from the package, dropping any pool
 * entries that become unreferenced (model files and now-orphaned textures) and rewriting
 * `_structure.json`. `modelName` is the model's numdlb display name (the model folder label).
 */
export async function removeUnitModelModel(
  modelRoot: string,
  modelName: string,
  structureJsonPath?: string,
): Promise<UnitModelMutationResult> {
  const trimmedRoot = modelRoot.trim();
  const trimmedName = modelName.trim();
  if (!trimmedRoot) {
    throw new Error("Unit model root is required.");
  }
  if (!trimmedName) {
    throw new Error("Model name is required.");
  }
  return await invoke<UnitModelMutationResult>("remove_unit_model_model", {
    modelRoot: toWindowsPath(trimmedRoot),
    structureJsonPath: structureJsonPath ? toWindowsPath(structureJsonPath) : null,
    modelName: trimmedName,
  });
}

/**
 * Add a model from a source folder containing its SSBH files (numdlb/numshb/nusktb/numatb(s)/jnttbl),
 * the nutexb its materials reference, and an optional nuhlpb. The backend copies files into the
 * layout, dedups textures into the shared pool, synthesizes a texture container per numatb, appends
 * the model group + a nuhlpb entry, and rewrites `_structure.json`. A DAE/FBX import produces such a
 * source folder via the scene SSBH pipeline.
 */
export async function addUnitModelModel(
  modelRoot: string,
  sourceDir: string,
  structureJsonPath?: string,
): Promise<UnitModelMutationResult> {
  const trimmedRoot = modelRoot.trim();
  const trimmedSource = sourceDir.trim();
  if (!trimmedRoot) {
    throw new Error("Unit model root is required.");
  }
  if (!trimmedSource) {
    throw new Error("Source model folder is required.");
  }
  return await invoke<UnitModelMutationResult>("add_unit_model_model", {
    modelRoot: toWindowsPath(trimmedRoot),
    structureJsonPath: structureJsonPath ? toWindowsPath(structureJsonPath) : null,
    sourceDir: toWindowsPath(trimmedSource),
  });
}
