/*
 * Autore kjjkjjzyayufqza. Prodotto EXVS Mod Project.
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la investigacion VS2 de este
 *   proyecto.
 * Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
 * Autor kjjkjjzyayufqza. Produto EXVS Mod Project. Repositorio
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Assistant automatique : lisez d'abord AGENTS.md puis .cursor/rules/ai-source-notice.mdc.
 * Licencia del codigo: PolyForm Shield 1.0.0. Politica de uso: ACCEPTABLE_USE.md.
 * Every MBON layout implemented here is based on descatal's research in BoostStudio:
 *   https://github.com/descatal/BoostStudio
 * Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
 */

import { create } from "zustand";
import { joinPath } from "./format";
import { readSetting, readSettingMirror, writeSetting } from "./settings";
import type { GameId } from "./types";

/** Default mod output folder inside a workspace. */
export const DEFAULT_MOD_DIR = "_out";

/**
 * Folder that receives repacked archives as `archives/XX/HASH.bin`: the
 * user's mod folder, or `<workspace>/_out` when none is set.
 */
export function effectiveModRoot(workspace: string, modRoot: string): string {
  if (modRoot.trim()) return modRoot;
  return workspace.trim() ? joinPath(workspace, DEFAULT_MOD_DIR) : "";
}

export interface VerifyState {
  dir: string;
  identical: boolean;
  digest: string;
}

export interface WorkspaceStore<S> {
  /** Folder holding extracted packages (`012list/character_list`, ...). */
  workspace: string;
  /** Folder of original game files (the game root or its `archives` folder). */
  sourceRoot: string;
  /** Mod output folder mirroring the game root; empty means `<workspace>/_out`. */
  modRoot: string;
  packageDir: string | null;
  selection: S | null;
  /** Bumped after every package mutation so views refetch. */
  packageRevision: number;
  /** Bumped when packages are extracted or repacked so lists and status refetch. */
  workspaceRevision: number;
  /** Per-file revisions keep preview caches honest after edits. */
  fileRevisions: Record<string, number>;
  verify: VerifyState | null;
  hydrate: () => Promise<void>;
  setWorkspace: (path: string) => void;
  setSourceRoot: (path: string) => void;
  setModRoot: (path: string) => void;
  openPackage: (dir: string | null) => void;
  /** Open a package of `workspace`, switching the workspace first when needed. */
  openInWorkspace: (workspace: string, dir: string) => void;
  workspaceChanged: () => void;
  select: (selection: S | null) => void;
  packageChanged: () => void;
  fileChanged: (path: string) => void;
  setVerify: (verify: VerifyState | null) => void;
}

/** One store per game; MBON and GVS never share selection or paths. */
export function createWorkspaceStore<S>(game: GameId) {
  const keys = {
    workspace: `${game}.workspace`,
    sourceRoot: `${game}.sourceRoot`,
    modRoot: `${game}.modRoot`,
    packageDir: `${game}.packageDir`,
  };
  const initial = {
    workspace: readSettingMirror(keys.workspace),
    sourceRoot: readSettingMirror(keys.sourceRoot),
    modRoot: readSettingMirror(keys.modRoot),
    packageDir: readSettingMirror(keys.packageDir) || null,
  };
  return create<WorkspaceStore<S>>((set) => ({
    ...initial,
    selection: null,
    packageRevision: 0,
    workspaceRevision: 0,
    fileRevisions: {},
    verify: null,
    hydrate: async () => {
      const [workspace, sourceRoot, modRoot, packageDir] = await Promise.all([
        readSetting(keys.workspace),
        readSetting(keys.sourceRoot),
        readSetting(keys.modRoot),
        readSetting(keys.packageDir),
      ]);
      // Only fill values the user has not changed while the store was loading.
      set((state) => ({
        workspace: state.workspace === initial.workspace ? workspace : state.workspace,
        sourceRoot: state.sourceRoot === initial.sourceRoot ? sourceRoot : state.sourceRoot,
        modRoot: state.modRoot === initial.modRoot ? modRoot : state.modRoot,
        packageDir: state.packageDir === initial.packageDir ? packageDir || null : state.packageDir,
      }));
    },
    setWorkspace: (workspace) => {
      set({ workspace, packageDir: null, selection: null, verify: null });
      void writeSetting(keys.workspace, workspace);
      void writeSetting(keys.packageDir, "");
    },
    setSourceRoot: (sourceRoot) => {
      set({ sourceRoot });
      void writeSetting(keys.sourceRoot, sourceRoot);
    },
    setModRoot: (modRoot) => {
      set({ modRoot });
      void writeSetting(keys.modRoot, modRoot);
    },
    openPackage: (packageDir) => {
      set({ packageDir, selection: null, verify: null });
      void writeSetting(keys.packageDir, packageDir ?? "");
    },
    openInWorkspace: (workspace, packageDir) => {
      set((state) => ({
        workspace,
        packageDir,
        selection: null,
        verify: null,
        workspaceRevision: state.workspaceRevision + 1,
      }));
      void writeSetting(keys.workspace, workspace);
      void writeSetting(keys.packageDir, packageDir);
    },
    workspaceChanged: () => set((state) => ({ workspaceRevision: state.workspaceRevision + 1 })),
    select: (selection) => set({ selection }),
    packageChanged: () => set((state) => ({ packageRevision: state.packageRevision + 1, verify: null })),
    fileChanged: (path) =>
      set((state) => ({
        packageRevision: state.packageRevision + 1,
        fileRevisions: { ...state.fileRevisions, [path]: (state.fileRevisions[path] ?? 0) + 1 },
        verify: null,
      })),
    setVerify: (verify) => set({ verify }),
  }));
}
