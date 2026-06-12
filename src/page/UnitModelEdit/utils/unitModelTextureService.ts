import { invoke } from "@tauri-apps/api/core";
import type { TextureManagerEntry } from "@/page/SceneEdit/store/sceneTextureManagerStore";
import { toWindowsPath } from "./unitModelRepackService";

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

export async function listUnitModelTextures(
  modelRoot: string,
  structureJsonPath: string,
): Promise<UnitModelTextureInventory> {
  return await invoke<UnitModelTextureInventory>("list_unit_model_textures", {
    modelRoot: toWindowsPath(modelRoot),
    structureJsonPath: toWindowsPath(structureJsonPath),
  });
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
