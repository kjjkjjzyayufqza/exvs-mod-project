import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { join, resourceDir } from "@tauri-apps/api/path";
import {
  createEmptyRegistryDocument,
  WORKSPACE_REGISTRY_FILENAME,
  type ResourceRegistryDocument,
} from "./types";
import { importCustomUnitRows, mergeImportedEntries } from "./importCustomUnit";

export const CUSTOM_UNIT_GLOBAL_MIGRATED_KEY = "resourceRegistryCustomUnitMigrated";
export const BUNDLED_CUSTOM_UNIT_RELATIVE_PATH = "tools/custom_unit.json";
export const WORKSPACE_CUSTOM_UNIT_FILENAME = "custom_unit.json";

export interface CustomUnitMigrationResult {
  sourcePath: string;
  doc: ResourceRegistryDocument;
  warnings: string[];
}

export function buildRegistryDocumentFromCustomUnitJson(
  raw: string,
): { doc: ResourceRegistryDocument; warnings: string[] } {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("custom_unit.json must be a JSON array");
  }
  const { entries, warnings } = importCustomUnitRows(parsed as never[]);
  const doc = mergeImportedEntries(createEmptyRegistryDocument(), entries);
  return { doc, warnings };
}

export async function resolveBundledCustomUnitPath(): Promise<string> {
  const base = await resourceDir();
  return join(base, BUNDLED_CUSTOM_UNIT_RELATIVE_PATH);
}

export async function readBundledCustomUnitRegistry(): Promise<CustomUnitMigrationResult | null> {
  const bundledPath = await resolveBundledCustomUnitPath();
  if (!(await exists(bundledPath))) {
    return null;
  }
  const raw = await readTextFile(bundledPath);
  const { doc, warnings } = buildRegistryDocumentFromCustomUnitJson(raw);
  if (doc.entries.length === 0) {
    return null;
  }
  return { sourcePath: bundledPath, doc, warnings };
}

export async function readWorkspaceCustomUnitRegistry(
  workspacePath: string,
): Promise<CustomUnitMigrationResult | null> {
  const trimmed = workspacePath.trim();
  if (!trimmed) {
    return null;
  }

  const registryPath = await join(trimmed, WORKSPACE_REGISTRY_FILENAME);
  if (await exists(registryPath)) {
    return null;
  }

  const customUnitPath = await join(trimmed, WORKSPACE_CUSTOM_UNIT_FILENAME);
  if (!(await exists(customUnitPath))) {
    return null;
  }

  const raw = await readTextFile(customUnitPath);
  const { doc, warnings } = buildRegistryDocumentFromCustomUnitJson(raw);
  if (doc.entries.length === 0) {
    return null;
  }

  return { sourcePath: customUnitPath, doc, warnings };
}
