/**
 * Every path the arcade route editor resolved, in one list.
 *
 * "Checks start once a route is open" tells a modder nothing about why the
 * editor is looking at the wrong workspace, at an old dplcache, or at a mod
 * folder that is not the one the game loads. Those are four different
 * failures with the same symptom, and the only thing that separates them is
 * the literal paths — so they are shown, not summarised.
 *
 * Pure on purpose: existence is probed by the view and merged in by id, so
 * this stays testable without a filesystem.
 */

import { getWorkspaceContentDescriptor } from "@/services/testEditorWorkspace/contentCatalog";
import {
  REQUIRED_TRIAD_CONTENT_IDS,
  TRIAD_CONTENT_IDS,
  type ResolvedTriadPacks,
} from "./triadRouteWorkspace";

export type WorkspacePathRowKind =
  | "workspace-root"
  | "dplcache"
  | "mod-folder"
  | "pack"
  | "script-root";

export interface WorkspacePathRow {
  /** Stable key, also used to look the row's probe result up. */
  id: string;
  kind: WorkspacePathRowKind;
  /** Package label from the content catalog; `null` for environment rows. */
  packLabel: string | null;
  /** Package hash, e.g. `0xE952325A`; `null` for environment rows. */
  hash: string | null;
  /** Empty when the path is not configured at all. */
  path: string;
  /** False for paths the editor can open a route without. */
  required: boolean;
}

export interface WorkspacePathRowsInput {
  workspaceRoot: string;
  dplCacheDir: string;
  modFolder: string;
  /** `null` before the first load finishes. */
  packs: ResolvedTriadPacks | null;
}

/**
 * Build the debug list: environment first, then the four shared packages, then
 * the roots stage scripts are looked for under.
 */
export function buildWorkspacePathRows({
  workspaceRoot,
  dplCacheDir,
  modFolder,
  packs,
}: WorkspacePathRowsInput): WorkspacePathRow[] {
  const rows: WorkspacePathRow[] = [
    environmentRow("workspace-root", workspaceRoot, true),
    environmentRow("dplcache", dplCacheDir, false),
    environmentRow("mod-folder", modFolder, false),
  ];

  if (!packs) return rows;

  for (const id of TRIAD_CONTENT_IDS) {
    const descriptor = getWorkspaceContentDescriptor(id);
    const location = packs.locations[id];
    const pack = location.existing ?? location.configured;
    rows.push({
      id: `pack:${id}`,
      kind: "pack",
      packLabel: descriptor.label,
      hash: descriptor.hashHex,
      path: pack.folderPath,
      required: REQUIRED_TRIAD_CONTENT_IDS.includes(id),
    });
  }

  for (const [index, dir] of packs.paths.scriptDirs.entries()) {
    rows.push({
      id: `script-root:${index}`,
      kind: "script-root",
      packLabel: null,
      hash: null,
      path: dir,
      required: false,
    });
  }

  return rows;
}

function environmentRow(
  kind: WorkspacePathRowKind,
  path: string,
  required: boolean,
): WorkspacePathRow {
  return {
    id: kind,
    kind,
    packLabel: null,
    hash: null,
    path: path.trim(),
    required,
  };
}
