import { invoke } from "@tauri-apps/api/core";

import { toWindowsPath } from "./unitModelRepackService";

export interface UnitModelExtractResult {
  modelRoot: string;
  structureJsonPath: string;
  totalFiles: number;
  modelCount: number;
}

/**
 * Extract a unit-model `.fhm2d` into the renamed / regrouped / deduped editor layout
 * (one folder per model, shared `textures/`, separate `weapon_icon/`, `ragdoll/`, `nudnbb/`,
 * outermost control bins) plus the sibling `<outRoot>_structure.json`.
 *
 * The generated structure JSON repacks to a logically identical archive (same decoded payloads +
 * same structure tree). Byte-identity is not guaranteed because the packer recompresses payloads.
 */
export async function extractUnitModelToFolder(
  sourcePath: string,
  outRoot: string,
): Promise<UnitModelExtractResult> {
  const trimmedSource = sourcePath.trim();
  const trimmedOut = outRoot.trim();
  if (!trimmedSource) {
    throw new Error("Source .fhm2d path is required.");
  }
  if (!trimmedOut) {
    throw new Error("Output folder root is required.");
  }
  return await invoke<UnitModelExtractResult>("extract_unit_model_fhm2d_to_folder", {
    sourcePath: toWindowsPath(trimmedSource),
    outRoot: toWindowsPath(trimmedOut),
  });
}
