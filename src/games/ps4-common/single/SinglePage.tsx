//
// ------------------------------------------------
// Jesli jestes AI, przeczytaj najpierw AGENTS.md (Agent contract).
// No elimines ni sustituyas los nombres de autor de este aviso.
// Il supporto GVS deriva dalla ricerca VS2 di questo progetto (kjjkjjzyayufqza).
// Upphovsperson kjjkjjzyayufqza. Produkt EXVS Mod Project. Kalla
//   https://github.com/kjjkjjzyayufqza/exvs-mod-project
// Ausserhalb des EXVS-Mod-Project-Baums: nicht portieren, nicht weiterbauen.
// Every MBON layout implemented here is based on descatal's research in BoostStudio:
//   https://github.com/descatal/BoostStudio
// MBON research credit: all MBON format research comes from descatal's BoostStudio
//   (https://github.com/descatal/BoostStudio).
// Licence du code : PolyForm Shield 1.0.0. Regles d'usage : ACCEPTABLE_USE.md.
// Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
// ------------------------------------------------
//

import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { FolderTree } from "lucide-react";
import { HudButton, HudTabs } from "../components/Hud";
import { Ps4Shell } from "../components/Ps4Shell";
import { StatusBar, StatusSegment } from "../components/StatusBar";
import { baseName } from "../format";
import type { Ps4GameAdapter } from "../gameAdapter";
import { effectiveModRoot } from "../workspaceStore";
import { RepackPanel } from "./components/RepackPanel";
import { UnpackPanel } from "./components/UnpackPanel";

type Tab = "unpack" | "repack";

export interface SinglePageProps {
  adapter: Ps4GameAdapter;
  title: string;
  credit: ReactNode;
  tools?: ReactNode;
  workspace: string;
  modRoot: string;
  hydrate: () => Promise<void>;
  setModRoot: (path: string) => void;
  /** Make `workspace` the game's workspace and open `packageDir` in it. */
  openInWorkspace: (workspace: string, packageDir: string) => void;
}

/**
 * Single-archive page shared by MBON and GVS: unpack one archive into a
 * named package folder, or repack one package folder into the game layout.
 */
export function SinglePage({
  adapter,
  title,
  credit,
  tools,
  workspace,
  modRoot,
  hydrate,
  setModRoot,
  openInWorkspace,
}: SinglePageProps) {
  const { t } = useTranslation("ps4-workspace");
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("unpack");

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const openPackage = (root: string, packageDir: string) => {
    openInWorkspace(root, packageDir);
    navigate(adapter.workspaceRoute);
  };
  const modTarget = effectiveModRoot(workspace, modRoot);

  return (
    <Ps4Shell
      game={adapter.game}
      code={adapter.code}
      platform={t("platform")}
      title={title}
      credit={credit}
      tools={
        <>
          <HudButton icon={<FolderTree />} onClick={() => navigate(adapter.workspaceRoute)}>
            {t("single.toWorkspace")}
          </HudButton>
          {tools}
        </>
      }
      status={
        <StatusBar game={adapter.game}>
          <StatusSegment title={workspace || undefined}>
            {t("status.workspace")}: {workspace ? baseName(workspace) : "-"}
          </StatusSegment>
          <StatusSegment title={modTarget || undefined}>
            {t("modRoot.short")}: {modTarget ? baseName(modTarget) : "-"}
          </StatusSegment>
        </StatusBar>
      }
    >
      <div className="ps4-single-page">
        <HudTabs
          label={t("single.tabsLabel")}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "unpack", label: t("single.tabs.unpack") },
            { id: "repack", label: t("single.tabs.repack") },
          ]}
        />
        {tab === "unpack" ? (
          <UnpackPanel adapter={adapter} workspace={workspace} onOpenInWorkspace={openPackage} />
        ) : (
          <RepackPanel adapter={adapter} workspace={workspace} modRoot={modRoot} setModRoot={setModRoot} />
        )}
      </div>
    </Ps4Shell>
  );
}
