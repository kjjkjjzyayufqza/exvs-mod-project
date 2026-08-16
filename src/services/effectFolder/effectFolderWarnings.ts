import { EFFECT_FOLDER_COMMON_PACK_NAME } from "./effectFolderCommonPack";

/**
 * Inventory warnings grouped by what the reader has to do about them.
 *
 * The backend returns one flat `warnings` array, but the entries are not equally serious: most
 * packs resolve the majority of their references through the shared pack, and rendering that
 * next to a genuine missing resource buries the one message worth acting on.
 */
export type EffectFolderWarningGroups = {
  /** References the shared pack supplied. Expected on nearly every pack. */
  resolved: string[];
  /** References nothing could supply, plus an absent shared pack. Needs action. */
  unresolved: string[];
  /** Everything else the backend reported, unchanged. */
  other: string[];
};

/**
 * The sentences `effect_folder.rs` emits, matched on their invariant halves.
 *
 * `push_reference_warnings` writes "Resolved N model and M texture reference(s) from the shared
 * pack …", the repack validator writes the model-only variant, `collect_common_pack` writes
 * "Shared effect pack … is not next to …", and each unresolved ID gets "… that exists in neither
 * this pack nor …".
 */
const RESOLVED_FROM_COMMON = `from the shared pack ${EFFECT_FOLDER_COMMON_PACK_NAME}`;
const COMMON_PACK_ABSENT = `Shared effect pack ${EFFECT_FOLDER_COMMON_PACK_NAME} is not next to`;
const RESOLVED_NOWHERE = "that exists in neither this pack nor";

export function partitionEffectFolderWarnings(
  warnings: readonly string[],
): EffectFolderWarningGroups {
  const groups: EffectFolderWarningGroups = { resolved: [], unresolved: [], other: [] };
  for (const warning of warnings) {
    if (warning.includes(COMMON_PACK_ABSENT) || warning.includes(RESOLVED_NOWHERE)) {
      groups.unresolved.push(warning);
    } else if (warning.includes(RESOLVED_FROM_COMMON)) {
      groups.resolved.push(warning);
    } else {
      groups.other.push(warning);
    }
  }
  return groups;
}
