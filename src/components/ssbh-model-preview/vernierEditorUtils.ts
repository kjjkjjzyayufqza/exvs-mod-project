import type { TypedParamFile } from "@/page/TestEditor/components/param-editor/typedParamTypes";

export function cloneVernierData(d: TypedParamFile): TypedParamFile {
  return structuredClone(d);
}

/**
 * Structural dirty check. Entry edits preserve key order ({@link TypedParamDataPanel} replaces
 * values with spread copies), so a stable JSON compare is a reliable, cheap equality test for the
 * small per-package vernier tables (~tens of entries).
 */
export function isVernierDraftDirty(
  base: TypedParamFile | null,
  draft: TypedParamFile | null,
): boolean {
  if (!base || !draft) return false;
  return JSON.stringify(base) !== JSON.stringify(draft);
}
