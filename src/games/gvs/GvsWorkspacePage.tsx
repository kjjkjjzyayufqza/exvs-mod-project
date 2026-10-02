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
import { StatusBar, StatusSegment } from "../ps4-common/components/StatusBar";
import { WorkspaceFrame } from "../ps4-common/components/WorkspaceFrame";
import { baseName } from "../ps4-common/format";
import { useAsync } from "../ps4-common/useAsync";
import { gvsApi } from "./api";
import { GvsInspector } from "./components/GvsInspector";
import { GvsPackagePanel } from "./components/GvsPackagePanel";
import { GvsSourcesPanel } from "./components/GvsSourcesPanel";
import { useGvsStore, type GvsSelection } from "./store";
import { nodeAt, pathKey } from "./tree";

/**
 * GVS (PS4) workspace: uncompressed FHM2D-style archives extracted into named
 * packages; textures, SSBH models and structure edits, then a canonical repack.
 */
export default function GvsWorkspacePage() {
  const { t } = useTranslation("gvs-workspace");
  const { t: tc } = useTranslation("ps4-workspace");
  const hydrate = useGvsStore((state) => state.hydrate);
  const workspace = useGvsStore((state) => state.workspace);
  const packageDir = useGvsStore((state) => state.packageDir);
  const packageRevision = useGvsStore((state) => state.packageRevision);
  const selection = useGvsStore((state) => state.selection);
  const select = useGvsStore((state) => state.select);
  const verify = useGvsStore((state) => state.verify);
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

  const verifyState = verify && verify.dir === packageDir ? verify : null;

  return (
    <WorkspaceFrame
      game="gvs"
      code="GVS"
      platform={tc("platform")}
      title={t("title")}
      credit={t("credit")}
      tools={
        <CreditsDialog game="gvs" provenance={credits.data} />
      }
      sourcesKey={packageDir}
      left={<GvsSourcesPanel />}
      center={<GvsPackagePanel view={view} onCreated={setPending} />}
      right={<GvsInspector view={current} />}
      status={
        <StatusBar game="gvs">
          <StatusSegment title={workspace || undefined}>
            {tc("status.workspace")}: {workspace ? baseName(workspace) : "-"}
          </StatusSegment>
          <StatusSegment title={packageDir ?? undefined}>
            {tc("status.package")}: {current ? current.manifest.sourceName : "-"}
          </StatusSegment>
          <StatusSegment>{tc("status.members", { count: current?.members.length ?? 0 })}</StatusSegment>
          <StatusSegment title={selection ? pathKey(selection.nodePath) : undefined}>
            <span
              className="ps4-lamp"
              data-state={verifyState ? (verifyState.identical ? "ok" : "warn") : undefined}
              aria-hidden="true"
            />
            {verifyState
              ? verifyState.identical
                ? tc("status.identical")
                : tc("status.modified")
              : tc("status.unverified")}
          </StatusSegment>
        </StatusBar>
      }
    />
  );
}
