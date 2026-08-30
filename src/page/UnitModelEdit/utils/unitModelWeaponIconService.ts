import { invoke } from "@tauri-apps/api/core";
import { toWindowsPath } from "./unitModelRepackService";

export interface UnitModelWeaponIconEntry {
  hudIndex: number;
  fileIndex: number;
  filename: string;
  path: string;
  fileUrl: string;
  exists: boolean;
  sizeBytes: number;
  internalName: string | null;
  format: string;
  width: number;
  height: number;
}

export interface UnitModelWeaponIconInventory {
  modelRoot: string;
  structureJsonPath: string;
  folderPresent: boolean;
  icons: UnitModelWeaponIconEntry[];
  warnings: string[];
}

export async function listUnitModelWeaponIcons(
  modelRoot: string,
  structureJsonPath: string,
): Promise<UnitModelWeaponIconInventory> {
  return await invoke<UnitModelWeaponIconInventory>("list_unit_model_weapon_icons", {
    modelRoot: toWindowsPath(modelRoot),
    structureJsonPath: toWindowsPath(structureJsonPath),
  });
}

export async function addUnitModelWeaponIcon(params: {
  modelRoot: string;
  structureJsonPath: string;
  sourcePath: string;
  targetFilename: string;
  insertAt?: number | null;
}): Promise<UnitModelWeaponIconInventory> {
  return await invoke<UnitModelWeaponIconInventory>("add_unit_model_weapon_icon", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
    sourcePath: toWindowsPath(params.sourcePath),
    targetFilename: params.targetFilename,
    insertAt: params.insertAt ?? null,
  });
}

export async function reorderUnitModelWeaponIcons(params: {
  modelRoot: string;
  structureJsonPath: string;
  fileIndices: number[];
}): Promise<UnitModelWeaponIconInventory> {
  return await invoke<UnitModelWeaponIconInventory>("reorder_unit_model_weapon_icons", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
    fileIndices: params.fileIndices,
  });
}

export async function removeUnitModelWeaponIcon(params: {
  modelRoot: string;
  structureJsonPath: string;
  fileIndex: number;
}): Promise<UnitModelWeaponIconInventory> {
  return await invoke<UnitModelWeaponIconInventory>("remove_unit_model_weapon_icon", {
    modelRoot: toWindowsPath(params.modelRoot),
    structureJsonPath: toWindowsPath(params.structureJsonPath),
    fileIndex: params.fileIndex,
  });
}

export function isWeaponIconFileUrl(fileUrl: string | undefined | null): boolean {
  if (!fileUrl) return false;
  const normalized = fileUrl.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("/weapon_icon/");
}

export function weaponIconHudLabel(hudIndex: number): string {
  return `HUD ${hudIndex}`;
}
