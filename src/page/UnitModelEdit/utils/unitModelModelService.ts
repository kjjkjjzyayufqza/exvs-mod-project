import { Channel, invoke } from "@tauri-apps/api/core";

import type {
  ImportConfig,
  StaticMeshImportProgress,
} from "@/page/SceneEdit/utils/sceneSessionService";
import { toWindowsPath } from "./unitModelRepackService";
import { syncUnitModelTextureContainers } from "./unitModelTextureService";

export interface UnitModelMutationResult {
  modelRoot: string;
  structureJsonPath: string;
  modelCount: number;
  totalFiles: number;
  removedFiles: string[];
  syncWarning?: string;
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

export interface UnitModelReplaceTargetPreview {
  modelName: string;
  modelIndex: number;
  numdlbPath: string | null;
  numshbPath: string | null;
  nusktbPath: string | null;
  jnttblPath: string | null;
  numatbPaths: string[];
  nuhlpbPath: string | null;
}

export interface UnitModelReplacePreview {
  source: UnitModelSourceValidation;
  target: UnitModelReplaceTargetPreview;
  compatibility: {
    skeleton: {
      sourceBoneCount: number;
      targetBoneCount: number;
      matchingBoneNames: number;
      missingInSource: string[];
      newInSource: string[];
    };
    jnttbl: {
      sourceBoneCount: number;
      targetBoneCount: number | null;
    };
    materials: {
      keptLabels: string[];
      removedLabels: string[];
      addedLabels: string[];
    };
  };
  textures: {
    referenced: string[];
    copiedFromSource: string[];
    reusedFromPool: string[];
    missing: string[];
    orphanedAfterReplace: string[];
  };
  warnings: string[];
  blockers: string[];
}

export interface UnitModelMeshObjectRef {
  name: string;
  subindex: number;
}

export interface UnitModelNumdlbEntryRef {
  name: string;
  subindex: number;
  materialLabel: string;
}

export interface UnitModelNumshbReplacePreview {
  target: UnitModelReplaceTargetPreview;
  sourceNumshbPath: string;
  targetNumshbPath: string;
  meshObjects: {
    source: UnitModelMeshObjectRef[];
    targetNumdlbEntries: UnitModelNumdlbEntryRef[];
    kept: UnitModelMeshObjectRef[];
    missingInSource: UnitModelMeshObjectRef[];
    newInSource: UnitModelMeshObjectRef[];
  };
  skeleton: {
    sourceInfluenceBones: string[];
    targetBoneNames: string[];
    matchingBoneNames: number;
    missingInTargetSkeleton: string[];
  };
  stats: {
    sourceObjectCount: number;
    sourceVertexCount: number;
    sourceTriangleCount: number;
  };
  warnings: string[];
  blockers: string[];
}

async function syncAllModelTextureContainers(
  mutation: UnitModelMutationResult,
  fallbackModelRoot: string,
  fallbackStructureJsonPath?: string,
): Promise<UnitModelMutationResult> {
  const modelRoot = mutation.modelRoot?.trim() || fallbackModelRoot.trim();
  const structureJsonPath = mutation.structureJsonPath?.trim() || fallbackStructureJsonPath?.trim() || "";
  if (!modelRoot) {
    return {
      ...mutation,
      syncWarning: "Texture container sync skipped: missing model root.",
    };
  }
  if (!structureJsonPath) {
    return {
      ...mutation,
      syncWarning: "Texture container sync skipped: missing structure JSON path.",
    };
  }
  try {
    await syncUnitModelTextureContainers(modelRoot, structureJsonPath);
  } catch (error) {
    return {
      ...mutation,
      syncWarning: error instanceof Error ? error.toString() : String(error),
    };
  }
  return mutation;
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
  const mutation = await invoke<UnitModelMutationResult>("remove_unit_model_model", {
    modelRoot: toWindowsPath(trimmedRoot),
    structureJsonPath: structureJsonPath ? toWindowsPath(structureJsonPath) : null,
    modelName: trimmedName,
  });
  return await syncAllModelTextureContainers(mutation, trimmedRoot, structureJsonPath);
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
  const mutation = await invoke<UnitModelMutationResult>("add_unit_model_model", {
    modelRoot: toWindowsPath(trimmedRoot),
    structureJsonPath: structureJsonPath ? toWindowsPath(structureJsonPath) : null,
    sourceDir: toWindowsPath(trimmedSource),
  });
  return await syncAllModelTextureContainers(mutation, trimmedRoot, structureJsonPath);
}

/**
 * Replace an existing model's geometry/material/skeleton in place from a prepared SSBH folder,
 * preserving the target model's name and position so shl/vernier/effect_project references stay
 * valid, and keeping its existing NUHLPB. `targetModelName` is the model's numdlb display name.
 */
export async function replaceUnitModelModel(
  modelRoot: string,
  targetModelName: string,
  sourceDir: string,
  structureJsonPath?: string,
): Promise<UnitModelMutationResult> {
  const trimmedRoot = modelRoot.trim();
  const trimmedName = targetModelName.trim();
  const trimmedSource = sourceDir.trim();
  if (!trimmedRoot) {
    throw new Error("Unit model root is required.");
  }
  if (!trimmedName) {
    throw new Error("Target model name is required.");
  }
  if (!trimmedSource) {
    throw new Error("Source model folder is required.");
  }
  const mutation = await invoke<UnitModelMutationResult>("replace_unit_model_model", {
    modelRoot: toWindowsPath(trimmedRoot),
    structureJsonPath: structureJsonPath ? toWindowsPath(structureJsonPath) : null,
    targetModelName: trimmedName,
    sourceDir: toWindowsPath(trimmedSource),
  });
  return await syncAllModelTextureContainers(mutation, trimmedRoot, structureJsonPath);
}

export async function previewUnitModelModelReplacement(
  modelRoot: string,
  targetModelName: string,
  sourceDir: string,
  structureJsonPath?: string,
): Promise<UnitModelReplacePreview> {
  const trimmedRoot = modelRoot.trim();
  const trimmedName = targetModelName.trim();
  const trimmedSource = sourceDir.trim();
  if (!trimmedRoot) {
    throw new Error("Unit model root is required.");
  }
  if (!trimmedName) {
    throw new Error("Target model name is required.");
  }
  if (!trimmedSource) {
    throw new Error("Source model folder is required.");
  }
  return await invoke<UnitModelReplacePreview>("preview_unit_model_model_replacement", {
    modelRoot: toWindowsPath(trimmedRoot),
    structureJsonPath: structureJsonPath ? toWindowsPath(structureJsonPath) : null,
    targetModelName: trimmedName,
    sourceDir: toWindowsPath(trimmedSource),
  });
}

export async function replaceUnitModelNumshb(
  modelRoot: string,
  targetModelName: string,
  sourceNumshbPath: string,
  structureJsonPath?: string,
): Promise<UnitModelMutationResult> {
  const trimmedRoot = modelRoot.trim();
  const trimmedName = targetModelName.trim();
  const trimmedSource = sourceNumshbPath.trim();
  if (!trimmedRoot) {
    throw new Error("Unit model root is required.");
  }
  if (!trimmedName) {
    throw new Error("Target model name is required.");
  }
  if (!trimmedSource) {
    throw new Error("Source NUMSHB path is required.");
  }
  return await invoke<UnitModelMutationResult>("replace_unit_model_numshb", {
    modelRoot: toWindowsPath(trimmedRoot),
    structureJsonPath: structureJsonPath ? toWindowsPath(structureJsonPath) : null,
    targetModelName: trimmedName,
    sourceNumshbPath: toWindowsPath(trimmedSource),
  });
}

export async function previewUnitModelNumshbReplacement(
  modelRoot: string,
  targetModelName: string,
  sourceNumshbPath: string,
  structureJsonPath?: string,
): Promise<UnitModelNumshbReplacePreview> {
  const trimmedRoot = modelRoot.trim();
  const trimmedName = targetModelName.trim();
  const trimmedSource = sourceNumshbPath.trim();
  if (!trimmedRoot) {
    throw new Error("Unit model root is required.");
  }
  if (!trimmedName) {
    throw new Error("Target model name is required.");
  }
  if (!trimmedSource) {
    throw new Error("Source NUMSHB path is required.");
  }
  return await invoke<UnitModelNumshbReplacePreview>("preview_unit_model_numshb_replacement", {
    modelRoot: toWindowsPath(trimmedRoot),
    structureJsonPath: structureJsonPath ? toWindowsPath(structureJsonPath) : null,
    targetModelName: trimmedName,
    sourceNumshbPath: toWindowsPath(trimmedSource),
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
  const mutation = await invoke<UnitModelMutationResult>("unit_model_import_static_mesh", {
    options: {
      modelRoot: toWindowsPath(params.modelRoot),
      structureJsonPath: toWindowsPath(params.structureJsonPath),
      sourcePath: toWindowsPath(params.sourcePath),
      config: params.config,
      includeGeometryNames: params.includeGeometryNames,
    },
    onProgress: channel,
  });
  return await syncAllModelTextureContainers(
    mutation,
    params.modelRoot,
    params.structureJsonPath,
  );
}
