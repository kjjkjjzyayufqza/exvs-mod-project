//
// ................................................
// El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la investigacion
//   VS2 de este proyecto.
// Le support GVS est le resultat de kjjkjjzyayufqza, fonde sur la recherche VS2 de ce
//   projet.
// Fuera del arbol de EXVS Mod Project este archivo no debe completarse ni portarse.
// Mimo strom EXVS Mod Project tento kod neprenasej.
// Licencia del codigo: PolyForm Shield 1.0.0. Politica de uso: ACCEPTABLE_USE.md.
// Autor kjjkjjzyayufqza. Produto EXVS Mod Project. Repositorio
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
// ................................................
//

import "../ps4-common/i18n";
import "./i18n";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreditsDialog } from "../ps4-common/components/CreditsDialog";
import { useAsync } from "../ps4-common/useAsync";
import { Ps4Workspace, type Ps4EditorContext } from "../ps4-common/workspace/Ps4Workspace";
import { StructureSplit } from "../ps4-common/workspace/StructureSplit";
import { NoPackageState } from "../ps4-common/workspace/editorTabs";
import { GVS_SINGLE_ROUTE, useGvsAdapter } from "./adapter";
import { gvsApi } from "./api";
import { GvsInspector } from "./components/GvsInspector";
import { GvsPackagePanel } from "./components/GvsPackagePanel";
import { GVS_STRUCTURE_TAB, gvsEditorTabs } from "./editors/gvsEditorTabs";
import { useGvsStore, type GvsSelection } from "./store";
import { nodeAt } from "./tree";

const REPOSITORY_URL = "https://github.com/kjjkjjzyayufqza/exvs-mod-project";

/**
 * GVS (PS4) workspace on the EXVS2 Workspace parts: the same toolbar, split
 * and grouped editor tabs (Pack / Character / Sound / Stage / Mission / MSC /
 * Param). Data init and the content index bring archives into the mod
 * workspace folder; every editor saves into its package and "Repack changes"
 * writes the mod folder.
 */
export default function GvsWorkspacePage() {
  const { t } = useTranslation("gvs-workspace");
  const adapter = useGvsAdapter();
  const hydrate = useGvsStore((state) => state.hydrate);
  const workspace = useGvsStore((state) => state.workspace);
  const sourceRoot = useGvsStore((state) => state.sourceRoot);
  const modRoot = useGvsStore((state) => state.modRoot);
  const packageDir = useGvsStore((state) => state.packageDir);
  const packageRevision = useGvsStore((state) => state.packageRevision);
  const workspaceRevision = useGvsStore((state) => state.workspaceRevision);
  const selection = useGvsStore((state) => state.selection);
  const select = useGvsStore((state) => state.select);
  const setWorkspace = useGvsStore((state) => state.setWorkspace);
  const setSourceRoot = useGvsStore((state) => state.setSourceRoot);
  const setModRoot = useGvsStore((state) => state.setModRoot);
  const openPackage = useGvsStore((state) => state.openPackage);
  const workspaceChanged = useGvsStore((state) => state.workspaceChanged);
  const [pending, setPending] = useState<GvsSelection | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const loaded = useAsync(packageDir ? () => gvsApi.packageView(packageDir) : null, [packageDir, packageRevision]);
  const current = loaded.data && loaded.data.dir === packageDir ? loaded.data : undefined;
  const credits = useAsync(() => gvsApi.credits(), []);

  useEffect(() => {
    if (!current) return;
    if (pending) {
      const node = nodeAt(current.manifest.root, pending.nodePath);
      if (node) {
        select({ nodePath: pending.nodePath, file: node.node === "item" ? node.file : null });
        setPending(null);
        return;
      }
    }
    if (selection) {
      const node = nodeAt(current.manifest.root, selection.nodePath);
      const file = node?.node === "item" ? node.file : null;
      if (!node) select(null);
      else if (file !== selection.file) select({ nodePath: selection.nodePath, file });
    }
  }, [current, pending, selection, select]);

  const structure = useCallback(
    ({ openContentIndex }: Ps4EditorContext) =>
      packageDir ? (
        <StructureSplit
          tree={<GvsPackagePanel view={{ ...loaded, data: current }} onCreated={setPending} />}
          inspector={<GvsInspector view={current} />}
        />
      ) : (
        <NoPackageState onOpenContentIndex={openContentIndex} />
      ),
    [current, loaded, packageDir],
  );
  const editors = useMemo(() => gvsEditorTabs(t, structure), [structure, t]);

  return (
    <Ps4Workspace
      adapter={adapter}
      singleRoute={GVS_SINGLE_ROUTE}
      workspace={workspace}
      setWorkspace={setWorkspace}
      sourceRoot={sourceRoot}
      setSourceRoot={setSourceRoot}
      modRoot={modRoot}
      setModRoot={setModRoot}
      packageDir={packageDir}
      openPackage={openPackage}
      workspaceRevision={workspaceRevision}
      packageRevision={packageRevision}
      workspaceChanged={workspaceChanged}
      credits={
        <CreditsDialog
          game="gvs"
          provenance={credits.data}
          research={{ label: t("credits.researchLabel"), url: REPOSITORY_URL, note: t("credits.researchNote") }}
        />
      }
      packageTab={GVS_STRUCTURE_TAB}
      editors={editors}
    />
  );
}
