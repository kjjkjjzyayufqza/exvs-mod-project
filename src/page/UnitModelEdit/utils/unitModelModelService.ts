import { Channel, invoke } from "@tauri-apps/api/core";

import type {
  ImportConfig,
  StaticMeshImportProgress,
} from "@/page/SceneEdit/utils/sceneSessionService";
import { toWindowsPath } from "./unitModelRepackService";

export interface UnitModelMutationResult {
  modelRoot: string;
  structureJsonPath: string;
  modelCount: number;
  totalFiles: number;
  removedFiles: string[];
}

export interface UnitModelSourceValidation {
  sourceDir: string;
  modelName: string;
  requiredFiles: string[];
  textureReferences: string[];
  sourceTexturesFound: string[];
  textureReferencesNotInSource: string[];
  ignoredSourceNuhlpb: boolean;
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
 * plus any nutexb its materials reference. The backend copies files into the layout, dedups textures
 * into the shared pool, synthesizes a texture container per numatb, appends the model group with a
 * fresh empty NUHLPB, and rewrites `_structure.json`.
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

export async function validateUnitModelSourceFolder(
  sourceDir: string,
): Promise<UnitModelSourceValidation> {
  const trimmedSource = sourceDir.trim();
  if (!trimmedSource) {
    throw new Error("Source model folder is required.");
  }
  return await invoke<UnitModelSourceValidation>(
    "validate_unit_model_source_folder",
    { sourceDir: toWindowsPath(trimmedSource) },
  );
}

export async function importUnitModelStaticMesh(
  params: {
    modelRoot: string;
    structureJsonPath: string;
    sourcePath: string;
    config: ImportConfig;
    includeGeometryNames: string[];
  },
  onProgress: (progress: StaticMeshImportProgress) => void,
): Promise<UnitModelMutationResult> {
  const channel = new Channel<StaticMeshImportProgress>();
  channel.onmessage = onProgress;
  return await invoke<UnitModelMutationResult>("unit_model_import_static_mesh", {
    options: {
      modelRoot: toWindowsPath(params.modelRoot),
      structureJsonPath: toWindowsPath(params.structureJsonPath),
      sourcePath: toWindowsPath(params.sourcePath),
      config: params.config,
      includeGeometryNames: params.includeGeometryNames,
    },
    onProgress: channel,
  });
}
