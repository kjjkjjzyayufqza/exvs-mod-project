/**
 * Stage model replacement: shared types and pure resolution helpers.
 *
 * `base`, every sub-model, and `sky` are all SSBH models stored at {folder}/0/...
 * Replacement imports a new DAE/FBX whose on-disk folder name is forced to the
 * target folder, then commits under `{folder}/0/...` on save.
 *
 * Legacy base layouts use a named subfolder, e.g. `base/001stage001_base/0/...`.
 * Only that named subfolder is removed after a successful replace — never the
 * entire `base` slot directory.
 */

/** Minimal bundle fields needed to locate a legacy on-disk model subfolder. */
export type ModelBundlePathRef = {
  modlPath: string;
};

/** A resolved replace target: the on-disk folder plus whether it is the base slot. */
export interface ModelReplaceTargetInfo {
  /** Disk folder name: "base", "sky", or a sub-model folder. */
  folderName: string;
  /** True for the base model (rendered from page state baseModel). */
  isBase: boolean;
}

/** A staged, not-yet-committed model replacement. */
export interface ModelReplacement extends ModelReplaceTargetInfo {
  sessionImportId: string;
  sourcePath: string;
  sourceName: string;
  /**
   * Named model folder under the slot from the pre-replace bundle (e.g.
   * `001stage001_base` from `.../base/001stage001_base/0/...`). Omitted when the
   * loaded model already uses `{slot}/0/...`.
   */
  legacySlotSubfolder?: string | null;
}

/**
 * Derive the legacy named subfolder under a stage slot from the bundle's numdlb path.
 * Returns null when the model already lives under `{slot}/0/...`.
 */
export function resolveLegacyModelSubfolderUnderSlot(
  bundle: ModelBundlePathRef | null | undefined,
  slotFolderName: string,
): string | null {
  const modlPath = bundle?.modlPath?.trim();
  if (!modlPath || !slotFolderName.trim()) {
    return null;
  }

  const normalized = modlPath.replace(/\\/g, "/");
  const marker = `/${slotFolderName}/`;
  const markerIndex = normalized.toLowerCase().lastIndexOf(marker.toLowerCase());
  if (markerIndex < 0) {
    return null;
  }

  const afterSlot = normalized.slice(markerIndex + marker.length);
  const firstSegment = afterSlot.split("/").find((segment) => segment.length > 0);
  if (!firstSegment || firstSegment === "0") {
    return null;
  }

  return firstSegment;
}

/** Relative path under stageRoot for executeDelete (e.g. `base/001stage001_base`). */
export function buildLegacySlotSubfolderDeletePath(
  slotFolderName: string,
  legacySubfolder: string,
): string {
  return `${slotFolderName}/${legacySubfolder}`;
}

/** True when the outliner node is an on-disk SSBH model (base or sub-model). */
export function canReplaceModelNode(node: { role: string }): boolean {
  return node.role === "base" || node.role === "sub_model";
}

/**
 * Resolve an outliner node id to a replace target, or null when the node is not an
 * on-disk model. base → {folderName:"base", isBase:true}; a sub-model id (incl.
 * "sky") → {folderName, isBase:false}.
 */
export function resolveModelReplaceTarget(
  nodeId: string,
  subModels: ReadonlyArray<{ folderName: string }>,
): ModelReplaceTargetInfo | null {
  if (nodeId === "base") {
    return { folderName: "base", isBase: true };
  }
  const sub = subModels.find((s) => s.folderName === nodeId);
  if (sub) {
    return { folderName: sub.folderName, isBase: false };
  }
  return null;
}
