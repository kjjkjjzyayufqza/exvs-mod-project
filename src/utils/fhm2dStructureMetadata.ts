import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";

export interface Fhm2dStructureMigrationAnalysis {
  structureJsonPath: string;
  needsMigration: boolean;
  name: string | null;
  hashName: string | null;
  suggestedName: string;
  suggestedHashName: string | null;
  rootPath: string | null;
}

export interface Fhm2dStructureMigrationResult {
  oldStructureJsonPath: string;
  structureJsonPath: string;
  oldRootPath: string | null;
  rootPath: string | null;
  name: string;
  hashName: string;
  updatedFileUrlCount: number;
}

export interface Fhm2dStructureMigrationPromptRequest {
  analysis: Fhm2dStructureMigrationAnalysis;
  title?: string;
}

type Fhm2dStructureMigrationPromptHandler = (
  request: Fhm2dStructureMigrationPromptRequest,
) => Promise<string | null>;

let migrationPromptHandler: Fhm2dStructureMigrationPromptHandler | null = null;

export function setFhm2dStructureMigrationPromptHandler(
  handler: Fhm2dStructureMigrationPromptHandler | null,
): () => void {
  migrationPromptHandler = handler;
  return () => {
    if (migrationPromptHandler === handler) {
      migrationPromptHandler = null;
    }
  };
}

export function sanitizeFhm2dStructureName(input: string): string {
  const normalized = input
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[.()[\]]+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .replace(/[_-]{2,}/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
  return normalized || "fhm2d_pack";
}

export function normalizeFhm2dHashName(input: string | null | undefined): string | null {
  const value = input?.trim() ?? "";
  const match = /(?:0x)?([0-9a-fA-F]{8})/.exec(value);
  return match ? `0x${match[1].toUpperCase()}` : null;
}

async function fallbackPromptForMigration(
  request: Fhm2dStructureMigrationPromptRequest,
): Promise<string | null> {
  const { analysis, title } = request;
  const hashLine = analysis.suggestedHashName
    ? `HashName: ${analysis.suggestedHashName}`
    : "HashName: not found";
  const ok = await confirm(
    [
      "This FHM2D structure JSON is missing Name/HashName metadata.",
      hashLine,
      "",
      "Migrate it before loading?",
    ].join("\n"),
    {
      title: title ?? "Migrate FHM2D structure",
      kind: "warning",
    },
  );
  if (!ok) return null;

  const entered = window.prompt("Name for this FHM2D pack", analysis.suggestedName);
  return entered == null ? null : sanitizeFhm2dStructureName(entered);
}

export async function analyzeFhm2dStructureMigration(
  structureJsonPath: string,
): Promise<Fhm2dStructureMigrationAnalysis> {
  return await invoke<Fhm2dStructureMigrationAnalysis>("analyze_fhm2d_structure_migration", {
    structureJsonPath,
  });
}

export async function migrateFhm2dStructureMetadata(
  structureJsonPath: string,
  name: string,
): Promise<Fhm2dStructureMigrationResult> {
  return await invoke<Fhm2dStructureMigrationResult>("migrate_fhm2d_structure_metadata", {
    structureJsonPath,
    name,
  });
}

export async function promptAndMigrateFhm2dStructureIfNeeded(params: {
  structureJsonPath: string;
  title?: string;
}): Promise<Fhm2dStructureMigrationResult | null> {
  const analysis = await analyzeFhm2dStructureMigration(params.structureJsonPath);
  if (!analysis.needsMigration) return null;

  const name = migrationPromptHandler
    ? await migrationPromptHandler({ analysis, title: params.title })
    : await fallbackPromptForMigration({ analysis, title: params.title });
  if (name == null) return null;
  return await migrateFhm2dStructureMetadata(params.structureJsonPath, sanitizeFhm2dStructureName(name));
}
