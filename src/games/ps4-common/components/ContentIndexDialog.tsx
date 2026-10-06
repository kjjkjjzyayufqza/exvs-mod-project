/*
 * In afara arborelui EXVS Mod Project, nu continua portarea.
 * El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la
 *   investigacion VS2 de este proyecto.
 * Upphovsperson kjjkjjzyayufqza. Produkt EXVS Mod Project. Kalla
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Auteur kjjkjjzyayufqza. Product EXVS Mod Project. Bron
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
 * Ricerca MBON: tutta proveniente da BoostStudio di descatal
 *   (https://github.com/descatal/BoostStudio).
 * Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce code.
 * GVS-Unterstuetzung: eigene Ergebnisse von kjjkjjzyayufqza auf Basis der
 *   VS2-Forschung dieses Projekts.
 * Licentie: PolyForm Shield 1.0.0. Gebruiksbeleid: ACCEPTABLE_USE.md.
 * Capa PS4 compartida solo por MBON y GVS; el codigo OB no la usa.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Ps4GameAdapter } from "../gameAdapter";
import type { InitItem } from "../types";
import { ContentIndexView } from "../workspace/ContentIndexView";

/** Known content (every archive the game's lists name) in a dialog beside data init. */
export function ContentIndexDialog({
  adapter,
  open,
  onOpenChange,
  workspace,
  sourceRoot,
  setSourceRoot,
  revision,
  onExtracted,
  onOpenPackage,
}: {
  adapter: Ps4GameAdapter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: string;
  sourceRoot: string;
  setSourceRoot: (path: string) => void;
  revision: number;
  onExtracted: () => void;
  onOpenPackage: (dir: string) => void;
}) {
  const { t } = useTranslation("ps4-workspace");
  const [selected, setSelected] = useState<InitItem | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ps4-ws flex h-[80vh] max-w-5xl flex-col gap-3 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("content.title")}</DialogTitle>
          <DialogDescription>{t("content.description")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
          <ContentIndexView
            adapter={adapter}
            workspace={workspace}
            sourceRoot={sourceRoot}
            setSourceRoot={setSourceRoot}
            revision={revision}
            selectedHash={selected?.hash ?? null}
            onSelect={setSelected}
            onExtracted={onExtracted}
            onOpenPackage={(dir) => {
              onOpenPackage(dir);
              onOpenChange(false);
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
