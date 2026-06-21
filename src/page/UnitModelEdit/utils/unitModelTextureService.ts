import { invoke } from "@tauri-apps/api/core";
import type { TextureManagerEntry } from "@/page/SceneEdit/store/sceneTextureManagerStore";
import { toWindowsPath } from "./unitModelRepackService";

const unitModelTextureSyncQueue = new Map<string, Promise<void>>();

export interface UnitModelTextureEntry {
  id: string;
  index: number;
  fileType: string;
  fileIndex: number;
  fileUrl: string;
  filename: string;
  path: string;
  exists: boolean;
  sizeBytes: number;
  internalName: string | null;
  format: string;
  width: number;
  height: number;
  structureRefCount: number;
  numatbReferenceCount: number;
  referencedBy: string[];
  canRemove: boolean;
}

export interface UnitModelTextureInventory {
  modelRoot: string;
  structureJsonPath: string;
  textures: UnitModelTextureEntry[];
  warnings: string[];
}

export interface UnitModelTextureContainerSyncResult {
  modelRoot: string;
  structureJsonPath: string;
  changed: boolean;
}

export async function listUnitModelTextures(
  modelRoot: string,
  structureJsonPath: string,
): Promise<UnitModelTextureInventory> {
  return await invoke<UnitModelTextureInventory>("list_unit_model_textures", {
    modelRoot: toWindowsPath(modelRoot),
    structureJsonPath: toWindowsPath(structureJsonPath),
  });
}

export async function syncUnitModelTextureContainers(
  modelRoot: string,
  structureJsonPath: string,
): Promise<UnitModelTextureContainerSyncResult> {
  const normalizedModelRoot = toWindowsPath(modelRoot);
  const normalizedStructurePath = toWindowsPath(structureJsonPath);
  const queueKey = normalizedStructurePath.toLowerCase();
  const previous = unitModelTextureSyncQueue.get(queueKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => current);
  unitModelTextureSyncQueue.set(queueKey, queued);
  await previous.catch(() => undefined);
  try {
    return await invoke<UnitModelTextureContainerSyncResult>("sync_unit_model_texture_containers", {
      modelRoot: normalizedModelRoot,
      structureJsonPath: normalizedStructurePath,
    });
  } finally {
    release();
    if (unitModelTextureSyncQueue.get(queueKey) === queued) {
      unitModelTextureSyncQueue.delete(queueKey);
    }
  }
}

export async function addUnitModelNutexb(params: {
  modelRoot: string;
  structureJsonPath: string;
  sourcePath: string;
  targetFilename: string;
}): Promise<UnitModelTextureInventory> {
  return await invoke<UnitModelTextureInventory>("add_unit_model_nutexb", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
    sourcePath: toWindowsPath(params.sourcePath),
    targetFilename: params.targetFilename,
  });
}

export async function removeUnitModelNutexb(params: {
  modelRoot: string;
  structureJsonPath: string;
  fileIndex: number;
}): Promise<UnitModelTextureInventory> {
  return await invoke<UnitModelTextureInventory>("remove_unit_model_nutexb", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
    fileIndex: params.fileIndex,
  });
}

export function unitTextureToManagerEntry(
  texture: UnitModelTextureEntry,
): TextureManagerEntry {
  return {
    id: texture.id,
    filename: texture.filename,
    status: "existing",
    scope: "model",
    infoCategory: null,
    format: texture.format,
    width: texture.width,
    height: texture.height,
    sizeBytes: texture.sizeBytes,
    referencedBy: texture.referencedBy,
    thumbnailDataUrl: null,
    nutexbPath: texture.path,
    sourceImagePath: null,
  };
}
