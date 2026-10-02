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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreditsDialog } from "../ps4-common/components/CreditsDialog";
import { useAsync } from "../ps4-common/useAsync";
import { Ps4Workspace } from "../ps4-common/workspace/Ps4Workspace";
import { StructureSplit } from "../ps4-common/workspace/StructureSplit";
import { GVS_SINGLE_ROUTE, useGvsAdapter } from "./adapter";
import { gvsApi } from "./api";
import { GvsInspector } from "./components/GvsInspector";
import { GvsPackagePanel } from "./components/GvsPackagePanel";
import { useGvsStore, type GvsSelection } from "./store";
import { nodeAt } from "./tree";

const REPOSITORY_URL = "https://github.com/kjjkjjzyayufqza/exvs-mod-project";

/**
 * GVS (PS4) workspace in the EXVS2 Workspace layout: data init and the
 * list-based content index bring packages in, the structure editor edits the
 * uncompressed archive tree, textures and SSBH models, and repack writes the
 * mod folder.
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
  const verify = useGvsStore((state) => state.verify);
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
  const view = { ...loaded, data: current };
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

  return (
    <Ps4Workspace
      adapter={adapter}
      title={t("title")}
      credit={t("credit")}
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
      structure={
        <StructureSplit
          tree={<GvsPackagePanel view={view} onCreated={setPending} />}
          inspector={<GvsInspector view={current} />}
        />
      }
      packageFacts={
        current
          ? {
              sourceName: current.manifest.sourceName,
              sourcePath: current.manifest.sourcePath,
              contents: t("contents", { count: current.members.length }),
            }
          : null
      }
      verify={verify}
    />
  );
}
