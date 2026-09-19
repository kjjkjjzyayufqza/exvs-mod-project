/**
 * Tauri bridge for the arcade (Triad Battle) route editor.
 *
 * Every payload here is small — the three route tables total well under
 * 100 KB and one briefing is about 1.5 KB — so the commands are plain
 * request/response with no chunking.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  AppliedRoute,
  BriefingDraft,
  StageScriptConfig,
  GeneratedSceneIdentity,
  RouteValidationContext,
  RouteValidationResult,
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
