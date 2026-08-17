/**
 * Pure path helpers for Extract-page folder repack:
 * selected asset folder → sibling structure JSON in parent dir → output `.fhm2d` path.
 *
 * These functions do not touch the filesystem so unit tests can drive them with fixtures.
 * Async discovery that needs `readDir` / `readTextFile` lives in `findStructureJsonBesideFolder`.
 */

import { basenameFromPath, joinPreviewPath, parentFromPath } from "@/components/fhm2d-metadata";
import { buildRepackOutputPath, buildRepackOutputPathFromMetadata } from "@/utils/repackRunner";
import { normalizeFhm2dHashName } from "@/utils/fhm2dStructureMetadata";

export type StructureJsonResolution =
  | {
      ok: true;
      folderPath: string;
      folderName: string;
      parentDir: string;
      structureJsonPath: string;
      structureFileName: string;
      matchKind: "preferred_structure" | "preferred_legacy" | "validated_other";
    }
  | {
      ok: false;
      folderPath: string;
      folderName: string;
      parentDir: string;
      error: string;
    };

export type RepackOutputResolution = {
  parentDir: string;
  outputPath: string;
  hashName: string | null;
  packStem: string;
};

/**
 * Ordered preferred structure JSON basenames for a folder name.
 * Modern layout: `{folderName}_structure.json`
 * Legacy layout: `{folderName}.json`
 */
export function preferredStructureJsonNames(folderName: string): string[] {
  const name = folderName.trim();
  if (!name) return [];
  return [`${name}_structure.json`, `${name}.json`];
}

/**
 * Case-insensitive lookup of a file name in a parent directory listing.
 */
export function findFileNameIgnoreCase(
  parentFileNames: readonly string[],
  wantedName: string,
): string | null {
  const wanted = wantedName.trim().toLowerCase();
  if (!wanted) return null;
  for (const name of parentFileNames) {
    if (name.toLowerCase() === wanted) return name;
  }
  return null;
}

/**
 * Pure: resolve structure JSON path beside an extracted folder using only parent
 * directory file names (and optional validated structure names that contain SubFileStructure).
 *
 * Preference order:
 * 1. `{folder}_structure.json` if present (and validated when validated list is provided)
 * 2. `{folder}.json` if present (same)
 * 3. Any other parent JSON listed in `validatedStructureJsonNames` (name match not required)
 *
 * Does not invent a structure JSON when nothing matches.
 */
export function resolveStructureJsonBesideFolder(params: {
  folderPath: string;
  parentJsonFileNames: readonly string[];
  /** Optional: basenames known to contain SubFileStructure. When provided, preferred names must be in this set (or fall through to other validated names). */
  validatedStructureJsonNames?: readonly string[];
}): StructureJsonResolution {
  const folderPath = params.folderPath.trim().replace(/[\\/]+$/g, "");
  const folderName = basenameFromPath(folderPath);
  const parentDir = parentFromPath(folderPath);

  if (!folderPath) {
    return {
      ok: false,
      folderPath: "",
      folderName: "",
      parentDir: "",
      error: "Folder path is empty",
    };
  }
  if (!folderName) {
    return {
      ok: false,
      folderPath,
      folderName: "",
      parentDir,
      error: "Could not determine folder name from path",
    };
  }
  if (!parentDir) {
    return {
      ok: false,
      folderPath,
      folderName,
      parentDir: "",
      error: "Folder has no parent directory to search for structure JSON",
    };
  }

  const preferred = preferredStructureJsonNames(folderName);
  const validatedSet =
    params.validatedStructureJsonNames != null
      ? new Set(params.validatedStructureJsonNames.map((n) => n.toLowerCase()))
      : null;

  const isAllowed = (fileName: string) =>
    validatedSet == null || validatedSet.has(fileName.toLowerCase());

  for (let i = 0; i < preferred.length; i += 1) {
    const preferredName = preferred[i]!;
    const actual = findFileNameIgnoreCase(params.parentJsonFileNames, preferredName);
    if (!actual || !isAllowed(actual)) continue;
    return {
      ok: true,
      folderPath,
      folderName,
      parentDir,
      structureJsonPath: joinPreviewPath(parentDir, actual),
      structureFileName: actual,
      matchKind: i === 0 ? "preferred_structure" : "preferred_legacy",
    };
  }

  if (validatedSet && validatedSet.size > 0) {
    for (const name of params.parentJsonFileNames) {
      if (!name.toLowerCase().endsWith(".json")) continue;
      if (!validatedSet.has(name.toLowerCase())) continue;
      // Skip preferred names already checked
      if (preferred.some((p) => p.toLowerCase() === name.toLowerCase())) continue;
      return {
        ok: true,
        folderPath,
        folderName,
        parentDir,
        structureJsonPath: joinPreviewPath(parentDir, name),
        structureFileName: name,
        matchKind: "validated_other",
      };
    }
  }

  const preferredHint = preferred.join(" or ");
  return {
    ok: false,
    folderPath,
    folderName,
    parentDir,
    error: `No structure JSON found beside folder. Expected ${preferredHint} in parent directory (must contain SubFileStructure).`,
  };
}

/**
 * Pure: build the `.fhm2d` output path next to the extracted folder (parent dir).
 * Prefers HashName from structure metadata when provided; otherwise falls back to
 * the structure JSON stem (same rules as `buildRepackOutputPath`).
 */
export function resolveRepackOutputBesideFolder(params: {
  folderPath: string;
  structureJsonPath: string;
  hashName?: string | null;
}): RepackOutputResolution {
  const folderPath = params.folderPath.trim().replace(/[\\/]+$/g, "");
  const parentDir = parentFromPath(folderPath);
  const hashName =
    typeof params.hashName === "string" && params.hashName.trim()
      ? normalizeFhm2dHashName(params.hashName)
      : null;

  if (hashName) {
    return {
      parentDir,
      outputPath: joinPreviewPath(parentDir, `${hashName}.fhm2d`),
      hashName,
      packStem: hashName,
    };
  }

  const fallback = buildRepackOutputPath(params.structureJsonPath, parentDir);
  // buildRepackOutputPath uses backslashes; normalize to preview join style for UI consistency
  const packStem = basenameFromPath(fallback).replace(/\.fhm2d$/i, "");
  return {
    parentDir,
    outputPath: joinPreviewPath(parentDir, `${packStem}.fhm2d`),
    hashName: null,
    packStem,
  };
}

/**
 * Async: resolve output path using HashName from structure JSON when present
 * (reuses shipped `buildRepackOutputPathFromMetadata`).
 */
export async function resolveRepackOutputBesideFolderFromMetadata(params: {
  folderPath: string;
  structureJsonPath: string;
}): Promise<RepackOutputResolution> {
  const folderPath = params.folderPath.trim().replace(/[\\/]+$/g, "");
  const parentDir = parentFromPath(folderPath);
  const outputPath = await buildRepackOutputPathFromMetadata(
    params.structureJsonPath,
    parentDir,
  );
  const packStem = basenameFromPath(outputPath).replace(/\.fhm2d$/i, "");
  const hashName = normalizeFhm2dHashName(packStem);
  return {
    parentDir,
    outputPath,
    hashName: hashName && packStem.toLowerCase() === hashName.toLowerCase() ? hashName : null,
    packStem,
  };
}
