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
import { exvs2TabMeta, NoPackageState } from "../ps4-common/workspace/editorTabs";
import { MBON_SINGLE_ROUTE, useMbonAdapter } from "./adapter";
import { mbonApi } from "./api";
import { MbonInspector } from "./components/MbonInspector";
import { MbonPackagePanel } from "./components/MbonPackagePanel";
import { useMbonStore } from "./store";

const BOOST_STUDIO_URL = "https://github.com/descatal/BoostStudio";
const STRUCTURE_TAB = exvs2TabMeta("folder-structure");

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
      packageTab={STRUCTURE_TAB.value}
      editors={[
        {
          meta: STRUCTURE_TAB,
          render: ({ openContentIndex }) =>
            packageDir ? (
              <StructureSplit
                tree={<MbonPackagePanel view={view} onAdded={setPendingPath} />}
                inspector={<MbonInspector view={current} />}
              />
            ) : (
              <NoPackageState onOpenContentIndex={openContentIndex} />
            ),
        },
      ]}
    />
  );
}
