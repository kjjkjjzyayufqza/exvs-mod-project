/**
 * Async FS discovery of structure JSON beside an extracted folder.
 * Uses pure name resolution from `extractRepackPaths` + SubFileStructure validation.
 */

import { readDir, readTextFile } from "@tauri-apps/plugin-fs";
import { basenameFromPath, joinPreviewPath, parentFromPath } from "@/components/fhm2d-metadata";
import {
  resolveRepackOutputBesideFolder,
  resolveStructureJsonBesideFolder,
} from "./extractRepackPaths";
import { normalizeFhm2dHashName, sanitizeFhm2dStructureName } from "@/utils/fhm2dStructureMetadata";

export type StructureJsonMatchKind =
  | "preferred_structure"
  | "preferred_legacy"
  | "validated_other";

export type StructureJsonDiscovery =
  | {
      ok: true;
      folderPath: string;
      folderName: string;
      parentDir: string;
      structureJsonPath: string;
      structureFileName: string;
      matchKind: StructureJsonMatchKind;
      name: string;
      hashName: string | null;
      repackOutputPath: string;
      missingMetadata: boolean;
    }
  | {
      ok: false;
      folderPath: string;
      error: string;
    };

function hasSubFileStructure(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const sub = (parsed as { SubFileStructure?: unknown }).SubFileStructure;
  return Array.isArray(sub);
}

/**
 * Scan parent directory for JSON files that contain SubFileStructure.
 * Prefers `{folder}_structure.json` / `{folder}.json` via pure resolver.
 */
export async function discoverStructureJsonBesideFolder(
  folderPath: string,
): Promise<StructureJsonDiscovery> {
  const trimmed = folderPath.trim().replace(/[\\/]+$/g, "");
  if (!trimmed) {
    return { ok: false, folderPath: "", error: "Folder path is empty" };
  }

  const parentDir = parentFromPath(trimmed);
  if (!parentDir) {
    return {
      ok: false,
      folderPath: trimmed,
      error: "Folder has no parent directory to search for structure JSON",
    };
  }

  let entries: Awaited<ReturnType<typeof readDir>>;
  try {
    entries = await readDir(parentDir);
  } catch (error) {
    return {
      ok: false,
      folderPath: trimmed,
      error: `Could not read parent directory: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const jsonFileNames = entries
    .filter((e) => e.isFile && typeof e.name === "string" && e.name.toLowerCase().endsWith(".json"))
    .map((e) => e.name as string);

  const validated: string[] = [];
  for (const name of jsonFileNames) {
    const path = joinPreviewPath(parentDir, name);
    try {
      const parsed = JSON.parse(await readTextFile(path)) as unknown;
      if (hasSubFileStructure(parsed)) {
        validated.push(name);
      }
    } catch {
      // skip unreadable / invalid JSON
    }
  }

  if (validated.length === 0) {
    return {
      ok: false,
      folderPath: trimmed,
      error:
        "No structure JSON with SubFileStructure was found in the parent directory. Extract or create a structure JSON first.",
    };
  }

  const resolved = resolveStructureJsonBesideFolder({
    folderPath: trimmed,
    parentJsonFileNames: jsonFileNames,
    validatedStructureJsonNames: validated,
  });

  if (!resolved.ok) {
    return {
      ok: false,
      folderPath: trimmed,
      error: resolved.error,
    };
  }

  let name = sanitizeFhm2dStructureName(resolved.folderName);
  let hashName: string | null = null;
  let hasNameField = false;
  try {
    const raw = await readTextFile(resolved.structureJsonPath);
    const parsed = JSON.parse(raw) as { Name?: unknown; HashName?: unknown };
    if (typeof parsed.Name === "string" && parsed.Name.trim()) {
      name = sanitizeFhm2dStructureName(parsed.Name);
      hasNameField = true;
    }
    if (typeof parsed.HashName === "string") {
      hashName = normalizeFhm2dHashName(parsed.HashName);
    }
  } catch {
    // keep defaults from folder name
  }

  const output = resolveRepackOutputBesideFolder({
    folderPath: trimmed,
    structureJsonPath: resolved.structureJsonPath,
    hashName,
  });

  return {
    ok: true,
    folderPath: trimmed,
    folderName: resolved.folderName,
    parentDir: resolved.parentDir,
    structureJsonPath: resolved.structureJsonPath,
    structureFileName: resolved.structureFileName,
    matchKind: resolved.matchKind,
    name,
    hashName,
    repackOutputPath: output.outputPath,
    missingMetadata: !hasNameField || !hashName,
  };
}

export { basenameFromPath };
