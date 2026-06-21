import type { NumdlbMappingRow } from "./daeSsbhTypes";
import type { NumdlbReadResult } from "./ssbhDaeIoService";

/** Trailing `__part<N>` suffix our DAE/FBX -> SSBH mesh-split pipeline appends (dae_to_ssbh.rs). */
const PART_SUFFIX_RE = /__part\d+$/i;

/** Remove the generated `__part<N>` suffix from a mesh object name (any digit count). */
export function stripPartSuffix(meshObjectName: string): string {
  return meshObjectName.replace(PART_SUFFIX_RE, "");
}

/**
 * Set every row's materialLabel to its mesh name with the generated `__part<N>` suffix removed.
 * Overwrites all rows unconditionally. Unchanged rows are returned by reference so React can skip
 * re-rendering them.
 */
export function applyMeshNameAsMaterialLabel(entries: NumdlbMappingRow[]): NumdlbMappingRow[] {
  return entries.map((row) => {
    const next = stripPartSuffix(row.meshObjectName);
    return row.materialLabel === next ? row : { ...row, materialLabel: next };
  });
}

/**
 * Resolve the numatb file a numdlb references, as a forward-slash path next to the numdlb.
 * Picks the first `.numatb` among the numdlb's material file names; returns null when none.
 */
export function numatbPathForNumdlb(
  numdlbFilePath: string,
  materialFileNames: string[],
): string | null {
  const numatbName = materialFileNames.find((name) => name.trim().toLowerCase().endsWith(".numatb"));
  if (!numatbName) return null;
  const normalized = numdlbFilePath.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  const dir = slash >= 0 ? normalized.slice(0, slash) : "";
  return dir ? `${dir}/${numatbName.trim()}` : numatbName.trim();
}

function cloneStructured<T>(data: T): T {
  return structuredClone(data);
}

export function cloneNumdlbReadResult(data: NumdlbReadResult): NumdlbReadResult {
  return cloneStructured(data);
}

function materialNamesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function mappingRowsEqual(a: NumdlbMappingRow[], b: NumdlbMappingRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ra = a[i];
    const rb = b[i];
    if (
      ra.meshObjectName !== rb.meshObjectName ||
      ra.meshObjectSubindex !== rb.meshObjectSubindex ||
      ra.materialLabel !== rb.materialLabel
    ) {
      return false;
    }
  }
  return true;
}

export function isNumdlbDraftDirty(
  base: NumdlbReadResult | null,
  draft: NumdlbReadResult | null,
): boolean {
  if (!base || !draft) return false;
  if (base.modelName !== draft.modelName) return true;
  if (base.skeletonFileName !== draft.skeletonFileName) return true;
  if (base.meshFileName !== draft.meshFileName) return true;
  if (base.animationFileName !== draft.animationFileName) return true;
  if (!materialNamesEqual(base.materialFileNames, draft.materialFileNames)) return true;
  if (!mappingRowsEqual(base.entries, draft.entries)) return true;
  return false;
}

/** Throws with a clear message if the draft cannot be saved. */
export function assertNumdlbValidForSave(data: NumdlbReadResult): void {
  if (!data.modelName.trim()) {
    throw new Error("Model name must not be empty.");
  }
  if (!data.meshFileName.trim()) {
    throw new Error("Mesh file name must not be empty.");
  }
  if (!data.skeletonFileName.trim()) {
    throw new Error("Skeleton file name must not be empty.");
  }
  for (let i = 0; i < data.entries.length; i++) {
    if (!data.entries[i].materialLabel.trim()) {
      throw new Error(`Material label must not be empty (row ${i + 1}).`);
    }
  }
}
