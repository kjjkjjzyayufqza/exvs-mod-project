import { invoke } from "@tauri-apps/api/core";
import { parseBgmListPack } from "@/page/TestEditor/components/bgm-list/bgmListDocument";
import type { CharacterListData } from "@/models/characterListEntry";
import type { StageListData } from "@/models/stageListEntry";
import { resolveMapWorkspace } from "@/services/mapLibrary/mapLibraryService";
import { resolveWorkspaceContent } from "@/services/testEditorWorkspace/contentCatalog";
import { loadWorkspaceDocumentFor } from "@/services/testEditorWorkspace/resolveFromRoot";
import { bgmEntriesToOptions, characterEntriesToUnitOptions, EMPTY_CATALOG, stageEntriesToMapOptions, type ResourceCatalog, type ResourceOption } from "./resources";

/**
 * Best-effort names from a bound EXVS2 Workspace. BGM titles come from the
 * HUD BGM list `cueHash` (E1 that the list contains the hash). That is not
 * proof `sys_0(0x33f)` plays the cue. Failures leave the catalog empty.
 */
export async function loadWorkspaceResourceCatalog(workspaceRoot: string): Promise<ResourceCatalog> {
  if (!workspaceRoot.trim()) return EMPTY_CATALOG;
  try {
    const { root, document } = await loadWorkspaceDocumentFor(workspaceRoot);
    const bgm = await resolveWorkspaceContent(root, document, "bgm-list");
    const folder = bgm.existing?.folderPath;
    if (!folder) return EMPTY_CATALOG;
    const parsed = await parseBgmListPack(folder);
    return { ...EMPTY_CATALOG, bgm: bgmEntriesToOptions(parsed.entries) };
  } catch {
    return EMPTY_CATALOG;
  }
}

/** Titles and `cueHash` values from the workspace `bgm_list.bin`, for the mission Opening BGM picker. */
export async function loadBgmListOptions(workspaceRoot: string): Promise<ResourceOption[]> {
  if (!workspaceRoot.trim()) return [];
  const { root, document } = await loadWorkspaceDocumentFor(workspaceRoot);
  const bgm = await resolveWorkspaceContent(root, document, "bgm-list");
  const folder = bgm.existing?.folderPath;
  if (!folder) return [];
  const parsed = await parseBgmListPack(folder);
  return bgmEntriesToOptions(parsed.entries);
}

/** Suit names and Character IDs from the workspace `character_list.bin`, for the mission Unit ID picker. */
export async function loadCharacterListUnitOptions(workspaceRoot: string): Promise<ResourceOption[]> {
  if (!workspaceRoot.trim()) return [];
  const { root, document } = await loadWorkspaceDocumentFor(workspaceRoot);
  const location = await resolveWorkspaceContent(root, document, "character-list");
  const path = location.existing?.filePath;
  if (!path) return [];
  const list = await invoke<CharacterListData>("parse_typed_param_file", {
    path,
    paramType: "characterlist",
  });
  return characterEntriesToUnitOptions(list.entries ?? []);
}

type UnitListCache = { root: string; units: ResourceOption[] };
let unitListCache: UnitListCache | null = null;
let unitListGeneration = 0;
let unitListInflight: { root: string; generation: number; promise: Promise<ResourceOption[]> } | null = null;

/**
 * Character-list options for the node editor.
 * A cached copy is reused until `refresh` is set, which is when the React Flow
 * page becomes active again. Concurrent calls share one parse.
 */
export function loadCachedCharacterListUnitOptions(workspaceRoot: string, refresh = false): Promise<ResourceOption[]> {
  if (!workspaceRoot.trim()) return Promise.resolve([]);
  if (refresh) {
    unitListCache = null;
    unitListGeneration += 1;
    unitListInflight = null;
  }
  if (unitListCache?.root === workspaceRoot) return Promise.resolve(unitListCache.units);
  if (unitListInflight?.root === workspaceRoot && unitListInflight.generation === unitListGeneration) {
    return unitListInflight.promise;
  }
  const generation = unitListGeneration;
  const promise = loadCharacterListUnitOptions(workspaceRoot).then((units) => {
    if (generation === unitListGeneration) unitListCache = { root: workspaceRoot, units };
    if (unitListInflight?.promise === promise) unitListInflight = null;
    return units;
  }, (error: unknown) => {
    if (unitListInflight?.promise === promise) unitListInflight = null;
    throw error;
  });
  unitListInflight = { root: workspaceRoot, generation, promise };
  return promise;
}

/** Names and lookup ids from the workspace `stage_list.bin`, for the mission Map hash search. */
export async function loadStageListMapOptions(workspaceRoot: string): Promise<ResourceOption[]> {
  const workspace = await resolveMapWorkspace(workspaceRoot);
  const list = await invoke<StageListData>("parse_typed_param_file", {
    path: workspace.stageListPath,
    paramType: "stagelist",
  });
  return stageEntriesToMapOptions(list.entries);
}
