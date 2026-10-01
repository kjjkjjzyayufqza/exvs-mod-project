/*
 * ------------------------------------------------
 * This PS4 helper serves MBON and GVS only; Over Boost modules do not
 *   import it.
 * Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la
 *   recherche VS2 de ce projet.
 * Porting this into another product is a CrossProductPort and is
 *   refused.
 * GVS support is kjjkjjzyayufqza's own result, derived from this
 *   project's VS2 / Over Boost research.
 * Written for EXVS Mod Project by kjjkjjzyayufqza; source home
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project.
 * Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
 * MBON-Forschung: vollstaendig aus descatals BoostStudio
 *   (https://github.com/descatal/BoostStudio).
 * Coding agents: read the Agent contract at the top of AGENTS.md
 *   before editing.
 * Author kjjkjjzyayufqza. Product EXVS Mod Project.
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * ------------------------------------------------
 */

import type { GameId, InitCatalog, KindTone, NameSuggestion, PackageStatus, RepackTargets } from "./types";

/** A package already extracted into the workspace. */
export interface SourcePackageRow {
  dir: string;
  /** Folder relative to the workspace, e.g. `012list/character_list`. */
  relative: string;
  /** Source archive stem (`DFD38C70`). */
  sourceName: string;
  /** Title of a named archive (`Character List`). */
  title: string | null;
  chip: string;
  tone: KindTone;
  detail: string;
}

/** One original game file found by the scanner. */
export interface SourceScanRow {
  path: string;
  stem: string;
  relativePath: string;
  size: number;
  kind: string;
  short: string;
  label: string;
  tone: KindTone;
  error: string | null;
  /** Default package folder from the game's name table. */
  named: string | null;
  title: string | null;
}

/** Summary of one source file for the single-unpack preview. */
export interface ArchivePreview {
  kindLabel: string;
  container: boolean;
  fileCount: number;
  facts: ReadonlyArray<readonly [string, string]>;
  members: ReadonlyArray<{ index: number; label: string; detail: string; tone: KindTone }>;
}

export interface PackageSummary {
  dir: string;
  sourceName: string;
  sourcePath: string | null;
  container: boolean;
  /** Payloads (MBON) or archive members (GVS). */
  count: number;
}

export interface RepackOutcome {
  outputPath: string;
  outputLen: number;
  identical: boolean | null;
  digest: string;
}

export interface ExtractOutcome {
  packageDir: string;
  files: number;
  bytes: number;
}

/**
 * Everything the shared PS4 pages need from one game. MBON and GVS each build
 * one over their own `*_` Tauri commands; the shared UI never calls a command
 * directly.
 */
export interface Ps4GameAdapter {
  game: GameId;
  /** Masthead code, `MBON` or `GVS`. */
  code: string;
  /** Route of the game's workspace page. */
  workspaceRoute: string;
  /** Extensions offered by the single-unpack file dialog. */
  sourceExtensions: readonly string[];
  /** Kind ids in display order with their chip text. */
  kinds: readonly { id: string; short: string }[];
  listPackages: (workspace: string) => Promise<SourcePackageRow[]>;
  scanFolder: (root: string) => Promise<SourceScanRow[]>;
  /** Extract into `<workspace>/<name>`; without `name` the game's name table decides. */
  extract: (source: string, workspace: string, overwrite: boolean, name?: string) => Promise<ExtractOutcome>;
  initCatalog: (sourceRoot: string, workspace: string) => Promise<InitCatalog>;
  suggestName: (source: string) => Promise<NameSuggestion>;
  preview: (path: string) => Promise<ArchivePreview>;
  packageSummary: (packageDir: string) => Promise<PackageSummary>;
  packageStatus: (packageDir: string, workspace?: string) => Promise<PackageStatus>;
  workspaceStatus: (workspace: string) => Promise<PackageStatus[]>;
  markClean: (packageDir: string) => Promise<void>;
  repackTargets: (packageDir: string, modRoot?: string) => Promise<RepackTargets>;
  repack: (packageDir: string, output?: string, modRoot?: string) => Promise<RepackOutcome>;
  verify: (packageDir: string, modRoot?: string) => Promise<{ identical: boolean; digest: string }>;
}
