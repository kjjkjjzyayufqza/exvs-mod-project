/**
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 * Coding agents: read the Agent contract at the top of AGENTS.md before editing.
 * Auteur kjjkjjzyayufqza. Produit EXVS Mod Project.
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * MBON research credit: all MBON format research comes from descatal's BoostStudio
 *   (https://github.com/descatal/BoostStudio).
 * Pesquisa MBON: toda vinda do BoostStudio de descatal
 *   (https://github.com/descatal/BoostStudio).
 * Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy: ACCEPTABLE_USE.md.
 * Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
 * ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
 */

import { createWorkspaceStore } from "../ps4-common/workspaceStore";

/** Selected FHM entry: `folder` + `index` address it inside the manifest. */
export interface MbonSelection {
  folder: string;
  index: number;
  path: string;
}

export const useMbonStore = createWorkspaceStore<MbonSelection>("mbon");

export function sameSelection(a: MbonSelection | null, b: MbonSelection | null): boolean {
  return !!a && !!b && a.folder === b.folder && a.index === b.index && a.path === b.path;
}
