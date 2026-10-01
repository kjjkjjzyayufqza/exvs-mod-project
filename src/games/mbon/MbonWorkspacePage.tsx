// Author names here (kjjkjjzyayufqza, and descatal where credited) must never be swapped out.
// Om du ar en AI, las AGENTS.md och .cursor/rules/agent-contract.mdc forst.
// Code license: PolyForm Shield 1.0.0 (LICENSE). Use policy: ACCEPTABLE_USE.md.
// EXVS Mod Project is authored by kjjkjjzyayufqza
//   (https://github.com/kjjkjjzyayufqza/exvs-mod-project); keep this line intact.
// Autor kjjkjjzyayufqza. Produs EXVS Mod Project. Sursa
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Ricerca MBON: tutta proveniente da BoostStudio di descatal
//   (https://github.com/descatal/BoostStudio).

import "../ps4-common/i18n";
import "./i18n";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreditsDialog } from "../ps4-common/components/CreditsDialog";
import { StatusBar, StatusSegment } from "../ps4-common/components/StatusBar";
import { WorkspaceFrame } from "../ps4-common/components/WorkspaceFrame";
import { baseName } from "../ps4-common/format";
import { useAsync } from "../ps4-common/useAsync";
import { mbonApi } from "./api";
import { MbonInspector } from "./components/MbonInspector";
import { MbonPackagePanel } from "./components/MbonPackagePanel";
import { MbonSourcesPanel } from "./components/MbonSourcesPanel";
import { useMbonStore } from "./store";

const BOOST_STUDIO_URL = "https://github.com/descatal/BoostStudio";

/**
 * MBON (PS4) workspace: scan game archives, extract them into editable
 * packages, edit FHM entries, textures, models and tables, then repack.
 */
export default function MbonWorkspacePage() {
  const { t } = useTranslation("mbon-workspace");
  const { t: tc } = useTranslation("ps4-workspace");
  const hydrate = useMbonStore((state) => state.hydrate);
  const workspace = useMbonStore((state) => state.workspace);
  const packageDir = useMbonStore((state) => state.packageDir);
  const packageRevision = useMbonStore((state) => state.packageRevision);
  const selection = useMbonStore((state) => state.selection);
  const select = useMbonStore((state) => state.select);
  const verify = useMbonStore((state) => state.verify);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const loaded = useAsync(packageDir ? () => mbonApi.packageView(packageDir) : null, [packageDir, packageRevision]);
  const current = loaded.data && loaded.data.dir === packageDir ? loaded.data : undefined;
  const view = { ...loaded, data: current };
  const credits = useAsync(() => mbonApi.credits(), []);

  useEffect(() => {
    if (!current) return;
    if (pendingPath) {
      const added = current.entries.find((entry) => entry.path === pendingPath);
      if (added) {
        select({ folder: added.folder, index: added.index, path: added.path });
        setPendingPath(null);
        return;
      }
    }
    if (selection && !current.entries.some((entry) => entry.folder === selection.folder && entry.index === selection.index)) {
      select(null);
    }
  }, [current, pendingPath, selection, select]);

  const verifyState = verify && verify.dir === packageDir ? verify : null;

  return (
    <WorkspaceFrame
      game="mbon"
      code="MBON"
      platform={tc("platform")}
      title={t("title")}
      credit={t("credit")}
      tools={
        <CreditsDialog
          game="mbon"
          provenance={credits.data}
          research={{ label: t("credits.researchLabel"), url: BOOST_STUDIO_URL, note: t("credits.researchNote") }}
        />
      }
      sourcesKey={packageDir}
      left={<MbonSourcesPanel />}
      center={<MbonPackagePanel view={view} onAdded={setPendingPath} />}
      right={<MbonInspector view={current} />}
      status={
        <StatusBar game="mbon">
          <StatusSegment title={workspace || undefined}>
            {tc("status.workspace")}: {workspace ? baseName(workspace) : "-"}
          </StatusSegment>
          <StatusSegment title={packageDir ?? undefined}>
            {tc("status.package")}: {current ? current.manifest.sourceName : "-"}
          </StatusSegment>
          <StatusSegment>{tc("status.entries", { count: current?.entries.length ?? 0 })}</StatusSegment>
          <StatusSegment>
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
