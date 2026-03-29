import type { NumdlbReadResult } from "./ssbhDaeIoService";

export function cloneNumdlbReadResult(data: NumdlbReadResult): NumdlbReadResult {
  return JSON.parse(JSON.stringify(data)) as NumdlbReadResult;
}

export function isNumdlbDraftDirty(
  base: NumdlbReadResult | null,
  draft: NumdlbReadResult | null,
): boolean {
  if (!base || !draft) return false;
  return JSON.stringify(base) !== JSON.stringify(draft);
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
