/**
 * Locating the arcade route packages inside the editor workspace and reading
 * the reference lists the route editor resolves names through.
 */

import { invoke } from "@tauri-apps/api/core";
import { exists } from "@tauri-apps/plugin-fs";
import { ExtractFHMData, ExtractType, Fhm2d_type_format } from "@/models/fhm2d";
import { initCatalogContentFromDplCache } from "@/services/testEditorWorkspace/initWorkspaceContentPack";
import { renameExtractPayloads } from "@/services/testEditorWorkspace/renameExtractPayloads";
import { formatHash, type TriadWorkspacePaths } from "@/services/triadRoute/types";
import { MISSION_SCRIPT_EXTENSION } from "../../utils/mscWorkspaceUtils";
import {
  resolveWorkspaceContent,
  workspacePackIdentityFromResolved,
  type ResolvedWorkspaceContentLocation,
} from "@/services/testEditorWorkspace/contentCatalog";
import type {
  TestEditorWorkspaceDocument,
  WorkspacePackIdentity,
} from "@/services/testEditorWorkspace/types";
import type { CharacterListData } from "@/models/characterListEntry";
import {
  buildCharacterListUnitCatalog,
  emptyUnitCatalog,
  unitCatalogLabel,
  type UnitCatalog,
} from "./characterListUnitCatalog";

/** Workspace content ids the route editor needs, in the order it reports them. */
export const TRIAD_CONTENT_IDS = [
  "triad-battle-list",
  "scene-id-table",
  "outmission",
  "pilot-name-list",
] as const;

export type TriadContentId = (typeof TRIAD_CONTENT_IDS)[number];

export interface ResolvedTriadPacks {
  locations: Record<TriadContentId, ResolvedWorkspaceContentLocation>;
  paths: TriadWorkspacePaths;
  /** Content the editor cannot open without. */
  missing: TriadContentId[];
  /** Everything not unpacked yet, including the optional pilot name list. */
  notUnpacked: TriadContentId[];
}

/** Route roots a mission script package can have been unpacked into. */
function missionRouteRoots(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
): string[] {
  const prefixes = new Set<string>();
  for (const routeId of ["mission.script", "mission.data"]) {
    const prefix = document.assetRoutes[routeId]?.prefix;
    if (prefix) prefixes.add(prefix);
  }
  const root = stripTrailingSep(workspaceRoot);
  return [...prefixes].map((prefix) => `${root}/${prefix}`);
}

function stripTrailingSep(path: string): string {
  return path.replace(/[\\/]+$/g, "");
}

/** dplcache file for one stage script package, e.g. `...\0x67AF23FA.fhm2d`. */
export function buildStageScriptSourceFhm2dPath(
  dplCacheDir: string,
  packageHash: number,
): string {
  const base = stripTrailingSep(dplCacheDir.trim());
  if (!base) return "";
  return `${base}\\${formatHash(packageHash)}.fhm2d`;
}

/** Payload name the unpacker should write, e.g. `000triad_battle_a001_001.mismsexc`. */
export function stageScriptPayloadFileName(sceneName: string): string {
  const trimmed = sceneName.trim();
  if (!trimmed) {
    throw new Error("Scene name is required to name the mission script");
  }
  if (/[\\/]/.test(trimmed) || trimmed.includes("..")) {
    throw new Error(`Unsafe scene name: ${trimmed}`);
  }
  if (trimmed.toLowerCase().endsWith(MISSION_SCRIPT_EXTENSION)) {
    return trimmed;
  }
  return `${trimmed}${MISSION_SCRIPT_EXTENSION}`;
}

/** Workspace folder the unpacker writes that package into. */
export function buildStageScriptExtractTarget(
  workspaceRoot: string,
  prefix: string,
  sceneName: string,
): string {
  return `${stripTrailingSep(workspaceRoot)}/${prefix}/${sceneName}`;
}

/**
 * Folders `load_triad_stage_script` will look in for one scene.
 *
 * Extract always writes under `mission.script`; the loader also accepts a
 * `mission.data` sibling if that route is configured.
 */
export function buildStageScriptFolderCandidates(
  scriptDirs: readonly string[],
  sceneName: string | null,
): string[] {
  if (!sceneName) return [];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const dir of scriptDirs) {
    const folder = `${stripTrailingSep(dir)}/${sceneName}`;
    const key = folder.replace(/\\/g, "/").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    paths.push(folder);
  }
  return paths;
}

/** The folder Unpack writes, matching `extractStageScriptPackage`. */
export function buildExpectedStageScriptFolder(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
  sceneName: string | null,
): string | null {
  if (!sceneName) return null;
  const prefix = document.assetRoutes["mission.script"]?.prefix ?? "051mission";
  return buildStageScriptExtractTarget(workspaceRoot, prefix, sceneName);
}

function folderOf(location: ResolvedWorkspaceContentLocation): string | null {
  const pack = location.existing ?? (location.sourceLayout === "configured" ? location.configured : null);
  return pack ? pack.folderPath : null;
}

/**
 * Resolve the four packages. `pilot-name-list` is optional: without it the
 * slot editor falls back to raw pilot hashes, which is a real limitation the
 * UI states rather than a silent degradation.
 */
export async function resolveTriadPacks(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
): Promise<ResolvedTriadPacks> {
  const entries = await Promise.all(
    TRIAD_CONTENT_IDS.map(
      async (id) => [id, await resolveWorkspaceContent(workspaceRoot, document, id)] as const,
    ),
  );
  const locations = Object.fromEntries(entries) as Record<
    TriadContentId,
    ResolvedWorkspaceContentLocation
  >;

  const required: TriadContentId[] = ["triad-battle-list", "scene-id-table", "outmission"];
  const notUnpacked = TRIAD_CONTENT_IDS.filter((id) => folderOf(locations[id]) === null);
  const missing = required.filter((id) => notUnpacked.includes(id));

  return {
    locations,
    missing,
    notUnpacked,
    paths: {
      triadListDir: folderOf(locations["triad-battle-list"]) ?? "",
      sceneIdTableDir: folderOf(locations["scene-id-table"]) ?? "",
      outmissionDir: folderOf(locations.outmission) ?? "",
      pilotNameListDir: folderOf(locations["pilot-name-list"]),
      packageRoots: [],
      // Stage scripts live one package per scene under the mission route root.
      scriptDirs: missionRouteRoots(workspaceRoot, document),
    },
  };
}

/** Pack identities to hand to `onPackMutated` after a successful write. */
export function mutatedTriadPacks(
  packs: ResolvedTriadPacks,
  ids: TriadContentId[],
): WorkspacePackIdentity[] {
  const identities: WorkspacePackIdentity[] = [];
  for (const id of ids) {
    const location = packs.locations[id];
    const pack = location.existing ?? location.configured;
    if (location.sourceLayout === "missing") continue;
    identities.push(workspacePackIdentityFromResolved(pack, location.sourceLayout));
  }
  return identities;
}

/** Which packages a write touched, derived from the files that changed. */
export function touchedContentIds(
  packs: ResolvedTriadPacks,
  writtenPaths: string[],
): TriadContentId[] {
  const normalise = (value: string) => value.replace(/\\/g, "/").toLowerCase();
  const touched = new Set<TriadContentId>();
  for (const path of writtenPaths.map(normalise)) {
    for (const id of TRIAD_CONTENT_IDS) {
      const folder = folderOf(packs.locations[id]);
      if (folder && path.startsWith(normalise(folder))) {
        touched.add(id);
      }
    }
  }
  return TRIAD_CONTENT_IDS.filter((id) => touched.has(id));
}

/** Character List catalog the suit pickers resolve names through. */
export type UnitNameMap = UnitCatalog;

/**
 * Character List bin the arcade editor must share with the Character List tab:
 * `{workspace}/012list/character_list/character_list.bin` when that pack is unpacked.
 */
async function resolveCharacterListBinPath(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
): Promise<string | null> {
  const location = await resolveWorkspaceContent(workspaceRoot, document, "character-list");
  const candidates = [location.existing?.filePath, location.configured.filePath].filter(
    (path): path is string => typeof path === "string" && path.length > 0,
  );
  for (const path of [...new Set(candidates)]) {
    if (await exists(path)) {
      return path;
    }
  }
  return null;
}

/**
 * Load Character List rows so slot / briefing / course pickers use the same
 * Character ID (`entryId`) → `characterName` pairing as the Character List tab.
 */
export async function loadUnitNames(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
): Promise<UnitNameMap> {
  const filePath = await resolveCharacterListBinPath(workspaceRoot, document);
  if (!filePath) {
    return emptyUnitCatalog();
  }
  const list = await invoke<CharacterListData>("parse_typed_param_file", {
    path: filePath,
    paramType: "characterlist",
  });
  return buildCharacterListUnitCatalog(list.entries ?? []);
}

export function unitLabel(names: UnitNameMap, unitId: number): string {
  return unitCatalogLabel(names, unitId);
}

/**
 * Unpack one stage's script package next to the other mission data.
 *
 * The 343 script packages are not catalog content — a route only ever needs
 * the handful its stages use — so they are extracted on demand, into a folder
 * named after the scene the way the shipped packages are.
 */
export async function extractStageScriptPackage(input: {
  dplCacheDir: string;
  workspaceRoot: string;
  document: TestEditorWorkspaceDocument;
  packageHash: number;
  sceneName: string;
}): Promise<string> {
  const source = buildStageScriptSourceFhm2dPath(input.dplCacheDir, input.packageHash);
  if (!source) {
    throw new Error("Set the OB dplcache folder in Config first");
  }
  if (!(await exists(source))) {
    throw new Error(`Source FHM2D not found: ${source}`);
  }
  const prefix = input.document.assetRoutes["mission.script"]?.prefix ?? "051mission";
  const target = buildStageScriptExtractTarget(input.workspaceRoot, prefix, input.sceneName);
  const payloadName = stageScriptPayloadFileName(input.sceneName);
  const result = await ExtractFHMData(
    source,
    target,
    ExtractType.SingleFolder,
    Fhm2d_type_format.fhm2d_list,
    payloadName,
  );
  if (result.namingError) {
    throw new Error(result.namingError);
  }
  await renameExtractPayloads({
    folderPath: target,
    names: [payloadName],
  });
  return target;
}

/**
 * Unpack the arcade route packages straight from the OB data.
 *
 * The same extract the FHM2D Init modal runs, offered where the editor
 * notices they are missing so a modder does not have to go and find it.
 */
export async function initTriadPacks(input: {
  ids: TriadContentId[];
  dplCacheDir: string;
  workspaceRoot: string;
  document: TestEditorWorkspaceDocument;
}): Promise<TriadContentId[]> {
  const base = input.dplCacheDir.trim();
  if (!base) {
    throw new Error("Set the OB dplcache folder in Config first");
  }
  const done: TriadContentId[] = [];
  for (const contentId of input.ids) {
    await initCatalogContentFromDplCache({
      contentId,
      dplCacheDir: base,
      workspaceRoot: input.workspaceRoot,
      workspaceDocument: input.document,
    });
    done.push(contentId);
  }
  return done;
}
