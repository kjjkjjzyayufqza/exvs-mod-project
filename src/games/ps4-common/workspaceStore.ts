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
import { readSetting, readSettingMirror, writeSetting } from "./settings";
import type { GameId } from "./types";

export interface VerifyState {
  dir: string;
  identical: boolean;
  digest: string;
}

export interface WorkspaceStore<S> {
  /** Folder holding extracted packages; repacks land in its `_out`. */
  workspace: string;
  /** Folder of original game files (a PS4 `archives` tree). */
  sourceRoot: string;
  packageDir: string | null;
  selection: S | null;
  /** Bumped after every package mutation so views refetch. */
  packageRevision: number;
  /** Per-file revisions keep preview caches honest after edits. */
  fileRevisions: Record<string, number>;
  verify: VerifyState | null;
  hydrate: () => Promise<void>;
  setWorkspace: (path: string) => void;
  setSourceRoot: (path: string) => void;
  openPackage: (dir: string | null) => void;
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
    packageDir: `${game}.packageDir`,
  };
  return create<WorkspaceStore<S>>((set) => ({
    workspace: readSettingMirror(keys.workspace),
    sourceRoot: readSettingMirror(keys.sourceRoot),
    packageDir: readSettingMirror(keys.packageDir) || null,
    selection: null,
    packageRevision: 0,
    fileRevisions: {},
    verify: null,
    hydrate: async () => {
      const [workspace, sourceRoot, packageDir] = await Promise.all([
        readSetting(keys.workspace),
        readSetting(keys.sourceRoot),
        readSetting(keys.packageDir),
      ]);
      set({ workspace, sourceRoot, packageDir: packageDir || null });
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
    openPackage: (packageDir) => {
      set({ packageDir, selection: null, verify: null });
      void writeSetting(keys.packageDir, packageDir ?? "");
    },
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
