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
import { useAsync } from "../ps4-common/useAsync";
import { Ps4Workspace } from "../ps4-common/workspace/Ps4Workspace";
import { StructureSplit } from "../ps4-common/workspace/StructureSplit";
import { MBON_SINGLE_ROUTE, useMbonAdapter } from "./adapter";
import { mbonApi } from "./api";
import { MbonInspector } from "./components/MbonInspector";
import { MbonPackagePanel } from "./components/MbonPackagePanel";
import { useMbonStore } from "./store";

const BOOST_STUDIO_URL = "https://github.com/descatal/BoostStudio";

/**
 * MBON (PS4) workspace in the EXVS2 Workspace layout: data init and the
 * list-based content index bring packages in, the structure editor edits FHM
 * entries, textures, models and tables, and repack writes the mod folder.
 */
export default function MbonWorkspacePage() {
  const { t } = useTranslation("mbon-workspace");
  const adapter = useMbonAdapter();
  const hydrate = useMbonStore((state) => state.hydrate);
  const workspace = useMbonStore((state) => state.workspace);
  const sourceRoot = useMbonStore((state) => state.sourceRoot);
  const modRoot = useMbonStore((state) => state.modRoot);
  const packageDir = useMbonStore((state) => state.packageDir);
  const packageRevision = useMbonStore((state) => state.packageRevision);
  const workspaceRevision = useMbonStore((state) => state.workspaceRevision);
  const selection = useMbonStore((state) => state.selection);
  const select = useMbonStore((state) => state.select);
  const verify = useMbonStore((state) => state.verify);
  const setWorkspace = useMbonStore((state) => state.setWorkspace);
  const setSourceRoot = useMbonStore((state) => state.setSourceRoot);
  const setModRoot = useMbonStore((state) => state.setModRoot);
  const openPackage = useMbonStore((state) => state.openPackage);
  const workspaceChanged = useMbonStore((state) => state.workspaceChanged);
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

  return (
    <Ps4Workspace
      adapter={adapter}
      title={t("title")}
      credit={t("credit")}
      singleRoute={MBON_SINGLE_ROUTE}
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
          game="mbon"
          provenance={credits.data}
          research={{ label: t("credits.researchLabel"), url: BOOST_STUDIO_URL, note: t("credits.researchNote") }}
        />
      }
      structure={
        <StructureSplit
          tree={<MbonPackagePanel view={view} onAdded={setPendingPath} />}
          inspector={<MbonInspector view={current} />}
        />
      }
      packageFacts={
        current
          ? {
              sourceName: current.manifest.sourceName,
              sourcePath: current.manifest.sourcePath,
              contents: t("contents", { count: current.entries.length }),
            }
          : null
      }
      verify={verify}
    />
  );
}
