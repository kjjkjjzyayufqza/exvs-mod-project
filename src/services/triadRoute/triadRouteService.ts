/**
 * Tauri bridge for the arcade (Triad Battle) route editor.
 *
 * Every payload here is small — the three route tables total well under
 * 100 KB and one briefing is about 1.5 KB — so the commands are plain
 * request/response with no chunking.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  AppliedCategoryOrder,
  AppliedRoute,
  BriefingDraft,
  CreatedScene,
  NewSceneRequest,
  StageScriptConfig,
  GeneratedSceneIdentity,
  HashedSceneName,
  RoutePlan,
  RouteValidationContext,
  RouteValidationResult,
  TriadRepackPlan,
  TriadRouteDocument,
  TriadWorkspacePaths,
  TriadWorkspaceSnapshot,
} from "./types";

/** Read the course / scene / ribbon tables, the scene map and the briefings. */
export async function loadTriadWorkspace(
  paths: TriadWorkspacePaths,
): Promise<TriadWorkspaceSnapshot> {
  return await invoke<TriadWorkspaceSnapshot>("load_triad_workspace", {
    pathsJson: paths,
  });
}

/** Read one stage's briefing into the editor's draft shape. */
export async function loadTriadBriefing(
  outmissionDir: string,
  sceneKey: number,
): Promise<BriefingDraft> {
  return await invoke<BriefingDraft>("load_triad_briefing", {
    outmissionDir,
    sceneKey,
  });
}

/**
 * Read one stage's mission script.
 *
 * Rejects a stage whose script package is not unpacked yet, naming the init
 * step, rather than pretending the stage has no units.
 */
export async function loadTriadStageScript(
  scriptDirs: string[],
  sceneKey: number,
  sceneName: string | null,
): Promise<StageScriptConfig> {
  return await invoke<StageScriptConfig>("load_triad_stage_script", {
    scriptDirs,
    sceneKey,
    sceneName,
  });
}

/** Result of renaming the briefing payloads to their scene names. */
export interface BriefingRenameReport {
  renamed: string[];
  unchanged: number;
  unnamed: string[];
}

/**
 * Give every briefing the name of its scene.
 *
 * Cosmetic only — the game and this editor both resolve briefings through the
 * package structure — but it turns 341 files called `0.bin` into names a
 * modder can read. The structure JSON is rewritten in the same pass.
 */
export async function renameTriadBriefings(
  outmissionDir: string,
): Promise<BriefingRenameReport> {
  return await invoke<BriefingRenameReport>("rename_triad_briefings", { outmissionDir });
}

/** Run the cross-table invariants. Pure: no file is read. */
export async function validateTriadRoute(
  document: TriadRouteDocument,
  context: RouteValidationContext,
): Promise<RouteValidationResult> {
  return await invoke<RouteValidationResult>("validate_triad_route", {
    documentJson: document,
    contextJson: context,
  });
}

/**
 * Write the route into the workspace folders.
 *
 * Every output is computed before anything is written, so a route that turns
 * out to be impossible leaves the workspace untouched. Each replaced file gets
 * a `.bak` sibling holding the pre-edit bytes.
 */
export async function applyTriadRoute(
  document: TriadRouteDocument,
  paths: TriadWorkspacePaths,
): Promise<AppliedRoute> {
  return await invoke<AppliedRoute>("apply_triad_route", {
    documentJson: document,
    pathsJson: paths,
  });
}

/**
 * Reorder one category on the course select screen.
 *
 * The screen groups by category and orders by the course's number within it,
 * so moving one course means renumbering the whole category. `courseIdOrder`
 * is every course id in the category, in the order they should appear; the
 * first becomes number 1. This writes the course table directly, so open
 * edits to the category have to be saved or dropped first.
 */
export async function renumberTriadCategory(
  paths: TriadWorkspacePaths,
  category: number,
  courseIdOrder: number[],
): Promise<AppliedCategoryOrder> {
  return await invoke<AppliedCategoryOrder>("renumber_triad_category", {
    pathsJson: paths,
    category,
    courseIdOrder,
  });
}

/** Generate official-style scene names and hashes, with a clash check. */
export async function generateTriadSceneIdentity(params: {
  category: string;
  courseNumber: number;
  stageNumbers: number[];
  existingSceneKeys: number[];
  existingPackageHashes: number[];
}): Promise<GeneratedSceneIdentity[]> {
  return await invoke<GeneratedSceneIdentity[]>("generate_triad_scene_identity", {
    category: params.category,
    courseNumber: params.courseNumber,
    stageNumbers: params.stageNumbers,
    existingSceneKeys: params.existingSceneKeys,
    existingPackageHashes: params.existingPackageHashes,
  });
}

/**
 * Create the files a set of brand-new scenes needs, by cloning donors.
 *
 * The whole course is created in one call so the second stage cannot be given
 * an id the first one just claimed. Nothing is written for a scene whose name
 * hashes onto an id already in use; the call fails instead.
 */
export async function createTriadScenes(
  requests: NewSceneRequest[],
  existingSceneKeys: number[],
  existingPackageHashes: number[],
): Promise<CreatedScene[]> {
  return await invoke<CreatedScene[]>("create_triad_scenes", {
    requestsJson: requests,
    existingSceneKeys,
    existingPackageHashes,
  });
}

/**
 * Hash scene names the modder typed, with the same clash check.
 *
 * `workspace` lets the check see everything `createTriadScenes` sees — the
 * briefings the outmission package already holds, and the files a scene of
 * that name already has here — so a name cannot read as free and then fail
 * on create. Each result says whether its ids are only held by this
 * workspace's own copy, which is the case `replaceExisting` covers.
 */
export async function hashTriadSceneNames(
  names: string[],
  existingSceneKeys: number[],
  existingPackageHashes: number[],
  workspace: { outmissionDir: string; workspaceRoot: string; scriptPrefix: string },
): Promise<HashedSceneName[]> {
  return await invoke<HashedSceneName[]>("hash_triad_scene_names", {
    names,
    existingSceneKeys,
    existingPackageHashes,
    outmissionDir: workspace.outmissionDir,
    workspaceRoot: workspace.workspaceRoot,
    scriptPrefix: workspace.scriptPrefix,
  });
}

/**
 * Describe what saving would write, without writing anything.
 *
 * Runs the same planner the save does, so the preview cannot describe a
 * different set of files than the one that lands on disk.
 */
export async function previewTriadRoute(
  document: TriadRouteDocument,
  paths: TriadWorkspacePaths,
): Promise<RoutePlan> {
  return await invoke<RoutePlan>("preview_triad_route", {
    documentJson: document,
    pathsJson: paths,
  });
}

/**
 * List every mission package and say which ones the game is still missing.
 *
 * Saving writes workspace folders; the game reads `.fhm2d`. A route whose
 * tables were never repacked simply does not appear on the select screen, so
 * the answer has to come from comparing the workspace against the mod folder
 * rather than from what the modder remembers packing. Reads only.
 */
export async function planTriadRepack(
  paths: TriadWorkspacePaths,
  modFolder: string,
  routeSceneNames: string[],
): Promise<TriadRepackPlan> {
  return await invoke<TriadRepackPlan>("plan_triad_repack_packages", {
    pathsJson: paths,
    modFolder,
    routeSceneNames,
  });
}
