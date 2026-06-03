/**
 * Stage model replacement: shared types and pure resolution helpers.
 *
 * `base`, every sub-model, and `sky` are all SSBH models stored at {folder}/0/...
 * Replacement imports a new DAE/FBX whose on-disk folder name is forced to the
 * target folder, then wipes and rewrites that folder on save.
 */

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
