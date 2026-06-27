import { invoke } from "@tauri-apps/api/core";

import { getBaseName, toWindowsPath, trimTrailingSeparators } from "./unitModelRepackService";

export interface UnitModelExtractResult {
  modelRoot: string;
  structureJsonPath: string;
  totalFiles: number;
  modelCount: number;
}

export interface UnitModelExtractCollisionInfo {
  outRoot: string;
  folderExists: boolean;
}

export function inferFhm2dStem(sourcePath: string): string {
  return getBaseName(sourcePath).replace(/\.fhm2d$/i, "");
}

/**
 * Unit Model Editor output directory: use the editor override when set,
 * otherwise fall back to the global Extract Output Path from Config.
 */
export function resolveUnitModelOutputDirectory(
  unitModelOutputPath: string,
  extractOutputPath: string,
): string {
  const override = unitModelOutputPath.trim();
  if (override) return override;
  return extractOutputPath.trim();
}

export function buildUnitModelExtractOutRoot(outputDirectory: string, stem: string): string {
  const dir = trimTrailingSeparators(toWindowsPath(outputDirectory.trim()));
  const name = stem.trim();
  if (!dir) {
    throw new Error("Output directory is required.");
  }
  if (!name) {
    throw new Error("FHM2D stem is required.");
  }
  return `${dir}\\${name}`;
}

export async function getUnitModelExtractCollisionInfo(
  outputDirectory: string,
  sourcePath: string,
): Promise<UnitModelExtractCollisionInfo> {
  const stem = inferFhm2dStem(sourcePath);
  const outRoot = buildUnitModelExtractOutRoot(outputDirectory, stem);
  if (!outputDirectory.trim()) {
    return { outRoot, folderExists: false };
  }
  const folderExists = await invoke<boolean>("path_exists", { path: outRoot });
  return { outRoot, folderExists };
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
  options?: { writeMetaBin?: boolean },
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
    writeMetaBin: options?.writeMetaBin === true,
  });
}
