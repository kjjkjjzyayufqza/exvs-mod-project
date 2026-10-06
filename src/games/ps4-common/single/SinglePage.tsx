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
import { FolderArchive, FolderTree, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Ps4GameAdapter } from "../gameAdapter";
import { RepackPanel } from "./components/RepackPanel";
import { UnpackPanel } from "./components/UnpackPanel";

type Tab = "unpack" | "repack";

export interface SinglePageProps {
  adapter: Ps4GameAdapter;
  /** Page title next to the game code, e.g. `Single MBON archive`. */
  title: string;
  /** One-line description under the title. */
  intro: string;
  /** Extra header actions (the credits dialog). */
  tools?: ReactNode;
  workspace: string;
  modRoot: string;
  hydrate: () => Promise<void>;
  setModRoot: (path: string) => void;
  /** Make `workspace` the game's workspace and open `packageDir` in it. */
  openInWorkspace: (workspace: string, packageDir: string) => void;
}

/**
 * Single-archive page shared by MBON and GVS, laid out like the Over Boost
 * "Single FHM2D" page: unpack one archive into a named package folder, or
 * repack one package folder into the game layout.
 */
export function SinglePage({
  adapter,
  title,
  intro,
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

  return (
    <div className="h-full min-h-0 overflow-auto" data-game={adapter.game}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-16">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="rounded-md bg-primary px-1.5 py-0.5 text-xs font-bold tracking-wide text-primary-foreground">
                {adapter.code}
              </span>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">{intro}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(adapter.workspaceRoute)}>
              <FolderTree className="h-4 w-4" />
              {t("single.toWorkspace")}
            </Button>
            {tools}
          </div>
        </header>

        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="flex min-h-0 flex-col gap-4">
          <TabsList className="grid w-full max-w-sm grid-cols-2" aria-label={t("single.tabsLabel")}>
            <TabsTrigger value="unpack" className="gap-2 text-xs">
              <PackageOpen className="h-3.5 w-3.5" />
              {t("single.tabs.unpack")}
            </TabsTrigger>
            <TabsTrigger value="repack" className="gap-2 text-xs">
              <FolderArchive className="h-3.5 w-3.5" />
              {t("single.tabs.repack")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="unpack" className="mt-0 focus-visible:outline-none">
            <UnpackPanel adapter={adapter} workspace={workspace} onOpenInWorkspace={openPackage} />
          </TabsContent>
          <TabsContent value="repack" className="mt-0 focus-visible:outline-none">
            <RepackPanel adapter={adapter} workspace={workspace} modRoot={modRoot} setModRoot={setModRoot} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
