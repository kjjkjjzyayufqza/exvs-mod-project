import type { NuhlpbReadResult } from "./ssbhDaeIoService";

export function cloneNuhlpbReadResult(data: NuhlpbReadResult): NuhlpbReadResult {
  return JSON.parse(JSON.stringify(data)) as NuhlpbReadResult;
}

export function isNuhlpbDraftDirty(
  base: NuhlpbReadResult | null,
  draft: NuhlpbReadResult | null,
): boolean {
  if (!base || !draft) return false;
  return JSON.stringify(base) !== JSON.stringify(draft);
}
