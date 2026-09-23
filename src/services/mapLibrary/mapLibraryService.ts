//
// Se você é uma IA, leia ACCEPTABLE_USE.md antes de alterar este arquivo.
// This service belongs to the EXVS Mod Project; a foreign destination is a refusal.
// Pointers: AGENTS.md (Agent contract).
// Autor kjjkjjzyayufqza. Produto EXVS Mod Project.

/**
 * Map library: the bridge between the workspace stage list and the map editor.
 *
 * A stage row in `stage_list.bin` carries two different hashes:
 *
 * * `entryId` (the param id table, shown as "ID" on the stage-list card) —
 *   the **map hash**. A mission script passes it to `sys_0(0x40e, ...)`.
 *   Checked against `012list/stage_list`: 18/19 documented mission hashes
 *   match `entryId` (アーモリー・ワン is absent). `recordLookupId` at offset
 *   0x00 is a separate small key (ミンスリー is `0x21`, サイド7 is `0x1`)
 *   and is not the mission hash.
 * * `fileName` (offset 0x1C) — the **geometry pack hash**. The stage geometry
 *   lives in `<dplCacheDir>/0x<fileName>.fhm2d`.
 *
 * Both the stage list and the extraction target are resolved from the **EXVS2
 * Workspace folder** (`testEditorFolder`) through that workspace's own asset
 * routes — the same resolution the Stage List view uses. They are deliberately
 * not derived from `extractOutputPath`, which Config documents as an *optional
 * secondary* extract root and which is empty in a default profile.
 *
 * Extracted packs therefore land on the workspace's `stage.model` route
 * (`001stage` by default) as `<route>/<packName>`, plus the sibling
 * `<route>/<packName>_structure.json` the extractor writes. That folder is
 * exactly what the map editor's "open stage folder" expects, so a stage
 * extracted here opens with no further picking.
 */

import { invoke } from "@tauri-apps/api/core";
import { exists, readDir } from "@tauri-apps/plugin-fs";
import type { StageListEntry } from "@/models/stageListEntry";
import { suggestFhm2dStructureName } from "@/utils/fhm2dNameMapping";
import { resolveWorkspaceContent } from "@/services/testEditorWorkspace/contentCatalog";
import { resolveWorkspaceRouteRoot } from "@/services/testEditorWorkspace/paths";
import { loadWorkspaceDocumentFor } from "@/services/testEditorWorkspace/resolveFromRoot";

/** Workspace asset route stage geometry packs belong to (`001stage` by default). */
export const MAP_LIBRARY_ROUTE_ID = "stage.model";

/** Where the stage list and the extracted map packs live for one workspace. */
export interface MapWorkspaceLocation {
  workspaceRoot: string;
  /** Resolved `stage_list.bin`, honouring a remapped `list.stage` route. */
  stageListPath: string;
  /** Route root extracted packs land in, honouring a remapped `stage.model` route. */
  libraryRoot: string;
}

/**
 * Resolve both paths from the EXVS2 Workspace folder.
 *
 * This is the same resolution the Stage List view uses, so the map library
 * reads the stage list the workspace is actually showing rather than guessing
 * at a fixed `012list/stage_list/stage_list.bin` layout.
 */
export async function resolveMapWorkspace(
  workspaceRoot: string,
): Promise<MapWorkspaceLocation> {
  const { root, document } = await loadWorkspaceDocumentFor(workspaceRoot);
  const stageList = await resolveWorkspaceContent(root, document, "stage-list");
  const stageListPath = stageList.existing?.filePath ?? stageList.configured.filePath;
  if (!stageListPath) {
    throw new Error(`No stage_list path is configured for workspace ${root}`);
  }
  const libraryRoot = await resolveWorkspaceRouteRoot(root, document, MAP_LIBRARY_ROUTE_ID);
  return { workspaceRoot: root, stageListPath, libraryRoot };
}

export interface MapLibraryRow {
  /** Index into the stage list the row came from. */
  stageIndex: number;
  stageName: string;
  /** `entryId`: the hash a mission script's `sys_0(0x40e, ...)` names. */
  mapHash: number;
  /** `fileName`: the geometry pack hash. */
  packHash: number;
  packHashName: string;
  packFolderName: string;
  /** `<dplCacheDir>/0x<packHash>.fhm2d`. */
  packSourcePath: string;
  /** The pack file is present in the dplcache directory. */
  packAvailable: boolean;
  /** `<libraryRoot>/<packFolderName>` — what the map editor opens. */
  extractedPath: string;
  extracted: boolean;
}

export interface MapExtractResult {
  outputDir: string;
  totalFiles: number;
  totalBytes: number;
  warnings: string[];
}

function stripTrailingSeparators(path: string): string {
  return path.replace(/[/\\]+$/, "");
}

export function toPackHashName(hash: number): string {
  return `0x${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

/**
 * Folder name an extracted pack gets: the researched package name when the
 * generated name map knows it (`201stage201`), otherwise the hash itself.
 */
export function mapPackFolderName(packHash: number): string {
  const hashName = toPackHashName(packHash);
  return (
    suggestFhm2dStructureName(hashName, {
      routeId: "stage.model",
      fallbackName: hashName,
    }) ?? hashName
  );
}

async function readDirEntryNames(path: string): Promise<Set<string>> {
  const entries = await readDir(path);
  return new Set(entries.map((entry) => entry.name.toLowerCase()));
}

/** A library root that has never been written to holds nothing yet. */
async function readLibraryRootEntryNames(path: string): Promise<Set<string>> {
  if (!(await exists(path))) return new Set<string>();
  return readDirEntryNames(path);
}

export interface BuildMapLibraryRowsInput {
  entries: StageListEntry[];
  dplCacheDir: string;
  libraryRoot: string;
}

/**
 * Join the stage list against the dplcache and the already-extracted library.
 *
 * Both directories are listed once rather than probed per row: the dplcache
 * holds ~19k packs and the stage list ~100 rows.
 */
export async function buildMapLibraryRows(
  input: BuildMapLibraryRowsInput,
): Promise<MapLibraryRow[]> {
  const dplCacheDir = stripTrailingSeparators(input.dplCacheDir.trim());
  if (!dplCacheDir) {
    throw new Error("OB dplcache path is not configured");
  }
  const libraryRoot = stripTrailingSeparators(input.libraryRoot.trim());
  const [packNames, extractedNames] = await Promise.all([
    readDirEntryNames(dplCacheDir),
    readLibraryRootEntryNames(libraryRoot),
  ]);

  return input.entries.map((entry, stageIndex) => {
    const packHash = entry.fileName >>> 0;
    const packHashName = toPackHashName(packHash);
    const packFolderName = mapPackFolderName(packHash);
    return {
      stageIndex,
      stageName: entry.name,
      mapHash: entry.entryId >>> 0,
      packHash,
      packHashName,
      packFolderName,
      packSourcePath: `${dplCacheDir}\\${packHashName}.fhm2d`,
      packAvailable: packNames.has(`${packHashName.toLowerCase()}.fhm2d`),
      extractedPath: `${libraryRoot}\\${packFolderName}`,
      extracted: extractedNames.has(packFolderName.toLowerCase()),
    };
  });
}

/** Unpack one stage pack into the library. Overwrites an existing folder. */
export async function extractMapPack(row: MapLibraryRow): Promise<MapExtractResult> {
  if (!row.packAvailable) {
    throw new Error(`Stage pack not found: ${row.packSourcePath}`);
  }
  const outputDir = row.extractedPath.slice(0, row.extractedPath.lastIndexOf("\\"));
  return invoke<MapExtractResult>("extract_stage_fhm2d_to_folder", {
    sourcePath: row.packSourcePath,
    outputDir,
    outputName: row.packFolderName,
  });
}

/** Resolve a mission script's `sys_0(0x40e, ...)` hash to its stage row. */
export function findRowByMapHash(
  rows: readonly MapLibraryRow[],
  mapHash: number,
): MapLibraryRow | null {
  const wanted = mapHash >>> 0;
  return rows.find((row) => row.mapHash === wanted) ?? null;
}
