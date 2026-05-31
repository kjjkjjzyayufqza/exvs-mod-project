import type { NuhlpbReadResult } from "./ssbhDaeIoService";

function cloneStructured<T>(data: T): T {
  return structuredClone(data);
}

export function cloneNuhlpbReadResult(data: NuhlpbReadResult): NuhlpbReadResult {
  return cloneStructured(data);
}

export function isNuhlpbDraftDirty(
  base: NuhlpbReadResult | null,
  draft: NuhlpbReadResult | null,
): boolean {
  if (!base || !draft) return false;
  if (base.majorVersion !== draft.majorVersion || base.minorVersion !== draft.minorVersion) {
    return true;
  }
  if (base.aimConstraints.length !== draft.aimConstraints.length) return true;
  if (base.orientConstraints.length !== draft.orientConstraints.length) return true;
  return (
    JSON.stringify(base.aimConstraints) !== JSON.stringify(draft.aimConstraints) ||
    JSON.stringify(base.orientConstraints) !== JSON.stringify(draft.orientConstraints)
  );
}
