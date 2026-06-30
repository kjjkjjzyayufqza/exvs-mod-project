import { join } from "@tauri-apps/api/path";
import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs";

import {
  analyzeFhm2dStructureMigration,
  normalizeFhm2dHashName,
  type Fhm2dStructureMigrationResult,
} from "./fhm2dStructureMetadata";

const STRUCTURE_JSON_SUFFIX = "_structure.json";

export type Fhm2dPackPathFields = {
  folderPath: string;
  structureJsonPath: string;
  hashFolderName?: string;
  packKey?: string;
  prefix?: string;
};

function trimTrailingSeparators(path: string): string {
  return path.trim().replace(/[\\/]+$/, "");
}

function preferredSeparator(path: string): "\\" | "/" {
  return path.includes("\\") ? "\\" : "/";
}

export function inferFhm2dStructurePathFromFolder(folderPath: string): string {
  const trimmed = trimTrailingSeparators(folderPath);
  const separator = preferredSeparator(trimmed);
  const segments = trimmed.split(/[\\/]/).filter(Boolean);
  const baseName = segments.at(-1) ?? trimmed;
  const parent = segments.slice(0, -1).join(separator);
  if (!parent) {
    return `${baseName}${STRUCTURE_JSON_SUFFIX}`;
  }
  return `${parent}${separator}${baseName}${STRUCTURE_JSON_SUFFIX}`;
}

export function applyFhm2dStructureMigrationToPack<T extends Fhm2dPackPathFields>(
  pack: T,
  migration: Fhm2dStructureMigrationResult,
): T {
  const prefix = pack.prefix ?? "";
  const packKey = prefix ? `${prefix}/${migration.name}` : migration.name;
  return {
    ...pack,
    packKey,
    hashFolderName: migration.hashName,
    folderPath: migration.rootPath ?? pack.folderPath,
    structureJsonPath: migration.structureJsonPath,
  };
}

async function resolveFromStructureJson(structureJsonPath: string): Promise<string | null> {
  if (!(await exists(structureJsonPath))) {
    return null;
  }

  try {
    const analysis = await analyzeFhm2dStructureMigration(structureJsonPath);
    if (analysis.rootPath && (await exists(analysis.rootPath))) {
      return analysis.rootPath;
    }
  } catch {
    return null;
  }

  return null;
}

async function resolveFromSiblingStructureFiles(
  folderPath: string,
  hashName: string,
): Promise<string | null> {
  const trimmed = trimTrailingSeparators(folderPath);
  const parentDir = trimmed.replace(/[\\/][^\\/]+$/, "");
  if (!parentDir) {
    return null;
  }

  let entries: Awaited<ReturnType<typeof readDir>>;
  try {
    entries = await readDir(parentDir);
  } catch {
    return null;
  }

  for (const entry of entries) {
    const name = entry.name;
    if (!name?.toLowerCase().endsWith(STRUCTURE_JSON_SUFFIX)) {
      continue;
    }

    const structurePath = await join(parentDir, name);
    try {
      const raw = await readTextFile(structurePath);
      const parsed = JSON.parse(raw) as { HashName?: unknown };
      const entryHash =
        typeof parsed.HashName === "string" ? normalizeFhm2dHashName(parsed.HashName) : null;
      if (entryHash !== hashName) {
        continue;
      }

      const stem = name.slice(0, -STRUCTURE_JSON_SUFFIX.length);
      const candidateFolder = await join(parentDir, stem);
      if (await exists(candidateFolder)) {
        return candidateFolder;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function resolveMigratedFhm2dPackPaths<T extends Fhm2dPackPathFields>(
  pack: T,
): Promise<T> {
  const folderPath = await resolveMigratedFhm2dFolderPath(pack.folderPath);
  if (folderPath === pack.folderPath) {
    return pack;
  }
  return {
    ...pack,
    folderPath,
    structureJsonPath: inferFhm2dStructurePathFromFolder(folderPath),
  };
}

/**
 * Resolve a persisted FHM2D pack folder path to the on-disk folder after metadata migration.
 * Returns the original path when it already exists or no migrated match is found.
 */
export async function resolveMigratedFhm2dFolderPath(folderPath: string): Promise<string> {
  const trimmed = folderPath.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (await exists(trimmed)) {
    return trimmed;
  }

  const inferredStructurePath = inferFhm2dStructurePathFromFolder(trimmed);
  const fromInferredStructure = await resolveFromStructureJson(inferredStructurePath);
  if (fromInferredStructure) {
    return fromInferredStructure;
  }

  const hashName = normalizeFhm2dHashName(trimmed.split(/[\\/]/).filter(Boolean).pop() ?? "");
  if (!hashName) {
    return trimmed;
  }

  const fromSiblingStructure = await resolveFromSiblingStructureFiles(trimmed, hashName);
  if (fromSiblingStructure) {
    return fromSiblingStructure;
  }

  return trimmed;
}
