import type { TextureAddSelection } from "@/page/SceneEdit/components/TextureAddConfirmModal";
import type { TextureManagerEntry } from "@/page/SceneEdit/store/sceneTextureManagerStore";
import {
  findTextureEntryForDuplicate,
  invalidateNutexbInternalName as invalidateNutexbInternalNameDefault,
} from "@/page/SceneEdit/utils/sceneTextureAddPlan";
import {
  convertImageToNutexb as convertImageToNutexbDefault,
  replaceNutexbInPlace as replaceNutexbInPlaceDefault,
} from "@/page/SceneEdit/utils/sceneTextureConvert";
import {
  addUnitModelWeaponIcon as addUnitModelWeaponIconDefault,
  type UnitModelWeaponIconInventory,
} from "./unitModelWeaponIconService";

export type WeaponIconAddDeps = {
  convertImageToNutexb: typeof convertImageToNutexbDefault;
  replaceNutexbInPlace: typeof replaceNutexbInPlaceDefault;
  addUnitModelWeaponIcon: typeof addUnitModelWeaponIconDefault;
  invalidateNutexbInternalName: typeof invalidateNutexbInternalNameDefault;
};

const defaultDeps: WeaponIconAddDeps = {
  convertImageToNutexb: convertImageToNutexbDefault,
  replaceNutexbInPlace: replaceNutexbInPlaceDefault,
  addUnitModelWeaponIcon: addUnitModelWeaponIconDefault,
  invalidateNutexbInternalName: invalidateNutexbInternalNameDefault,
};

export type WeaponIconAddResult = {
  addedCount: number;
  replacedCount: number;
  inventory: UnitModelWeaponIconInventory | null;
};

/**
 * Apply confirmed Add-HUD-icon selections.
 * Images convert with the same nutexb pipeline as unit textures, then land in
 * `weapon_icon/` via `add_unit_model_weapon_icon` (structure JSON included).
 * Name conflicts overwrite the existing HUD file in place and keep fileIndex.
 */
export async function applyWeaponIconAddSelections(
  params: {
    modelRoot: string;
    structureJsonPath: string;
    selections: readonly TextureAddSelection[];
    existingEntries: readonly TextureManagerEntry[];
    onProgress?: (done: number, total: number) => void;
  },
  deps: WeaponIconAddDeps = defaultDeps,
): Promise<WeaponIconAddResult> {
  let addedCount = 0;
  let replacedCount = 0;
  let inventory: UnitModelWeaponIconInventory | null = null;
  let done = 0;
  const total = params.selections.length;

  for (const { candidate, ddsFormat, replace } of params.selections) {
    if (replace) {
      const existing = findTextureEntryForDuplicate(params.existingEntries, candidate);
      if (!existing?.nutexbPath) {
        throw new Error(
          existing
            ? `Cannot replace ${candidate.filename}: existing weapon icon has no path`
            : `Cannot replace ${candidate.filename}: matching weapon icon not found`,
        );
      }
      await deps.replaceNutexbInPlace({
        sourcePath: candidate.sourcePath,
        targetNutexbPath: existing.nutexbPath,
        ddsFormat,
      });
      deps.invalidateNutexbInternalName(existing.nutexbPath);
      replacedCount += 1;
    } else {
      const sourceNutexbPath = candidate.isNutexb
        ? candidate.sourcePath
        : (
            await deps.convertImageToNutexb({
              sourcePath: candidate.sourcePath,
              ddsFormat,
            })
          ).outputNutexbPath;
      inventory = await deps.addUnitModelWeaponIcon({
        modelRoot: params.modelRoot,
        structureJsonPath: params.structureJsonPath,
        sourcePath: sourceNutexbPath,
        targetFilename: candidate.nutexbFilename,
      });
      deps.invalidateNutexbInternalName(sourceNutexbPath);
      addedCount += 1;
    }
    done += 1;
    params.onProgress?.(done, total);
  }

  return { addedCount, replacedCount, inventory };
}
