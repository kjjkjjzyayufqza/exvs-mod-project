import { getBaseName, getParentDir, toWindowsPath, trimTrailingSeparators } from "./effectFolderService";

/**
 * The shared effect pack every other pack draws models and textures from.
 *
 * Effect packs live side by side under `006effect/`, and a `.efxbn` names its model and colour
 * map by CRC32 rather than by path, so a reference can point at a file in a sibling pack. Across
 * the 11 shipped non-common packs, 59.4% of model references (523 of 880) and 69.5% of texture
 * references (1,191 of 1,714) resolve **only** inside this pack — indexing the opened pack alone
 * leaves the majority of every effect unresolved.
 *
 * The pack is present under both game roots (`mod/006effect/` and the unpacked tree) with the
 * same 1,041 files, so the sibling lookup below holds for either.
 */
export const EFFECT_FOLDER_COMMON_PACK_NAME = "000common_001";

/** True when `effectRoot` already points at the shared pack. */
export function isEffectFolderCommonPackRoot(effectRoot: string): boolean {
  const name = getBaseName(trimTrailingSeparators(toWindowsPath(effectRoot)));
  return name.toLowerCase() === EFFECT_FOLDER_COMMON_PACK_NAME;
}

/**
 * The shared pack that sits next to `effectRoot`, or null when `effectRoot` is that pack.
 *
 * Mirrors `inferEffectFolderStructurePath`: the pack root's parent is the `006effect` directory,
 * and every pack — shared included — is a direct child of it. Throws when there is no parent to
 * search rather than guessing a root.
 */
export function inferEffectFolderCommonPackPath(effectRoot: string): string | null {
  const normalized = trimTrailingSeparators(toWindowsPath(effectRoot));
  const parent = getParentDir(normalized);
  const name = getBaseName(normalized);
  if (!parent || !name) {
    throw new Error(`Cannot infer common effect pack path from effect root: ${effectRoot}`);
  }
  if (name.toLowerCase() === EFFECT_FOLDER_COMMON_PACK_NAME) return null;
  return `${parent}\\${EFFECT_FOLDER_COMMON_PACK_NAME}`;
}
