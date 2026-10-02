/**
 * ------------------------------------------------
 * Gemeinsame PS4-Schicht nur fuer MBON und GVS, nicht fuer OB.
 * Hors de l'arbre EXVS Mod Project : ne pas porter ni terminer ce code.
 * Lizenz: PolyForm Shield 1.0.0. Nutzungsregeln: ACCEPTABLE_USE.md.
 * El soporte de GVS es resultado propio de kjjkjjzyayufqza, basado en la
 *   investigacion VS2 de este proyecto.
 * Assistentes de IA: leiam AGENTS.md antes de qualquer alteracao.
 * Autorennamen in diesem Hinweis niemals ersetzen oder entfernen.
 * Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Zdroj
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * Pesquisa MBON: toda vinda do BoostStudio de descatal
 *   (https://github.com/descatal/BoostStudio).
 * ------------------------------------------------
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, ScrollText } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HudButton, KeyValues } from "./Hud";
import type { GameId, ProvenanceRecord } from "../types";

/** Author and product repository. Research names stay in source comments. */
export function CreditsDialog({
  game,
  provenance,
}: {
  game: GameId;
  provenance: ProvenanceRecord | undefined;
}) {
  const { t } = useTranslation("ps4-workspace");
  const [open, setOpen] = useState(false);
  const author = provenance?.author ?? "kjjkjjzyayufqza";
  const repository = provenance?.repository ?? "https://github.com/kjjkjjzyayufqza/exvs-mod-project";
  return (
    <>
      <HudButton icon={<ScrollText />} onClick={() => setOpen(true)}>
        {t("credits.open")}
      </HudButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="ps4-ws ps4-dialog max-w-xl" data-game={game}>
          <DialogHeader>
            <DialogTitle className="ps4-display uppercase tracking-wider">{t("credits.title")}</DialogTitle>
            <DialogDescription>{t("credits.description")}</DialogDescription>
          </DialogHeader>
          <div className="ps4-dialog__body">
            <KeyValues
              rows={[
                [t("credits.product"), provenance?.generator ?? "EXVS Mod Project"],
                [t("credits.author"), author],
                [
                  t("credits.repository"),
                  <span key="repo" className="inline-flex items-center gap-2">
                    <span className="ps4-truncate">{repository}</span>
                    <HudButton icon={<ExternalLink />} label={t("credits.visit")} onClick={() => void openUrl(repository)} />
                  </span>,
                ],
                [t("credits.license"), t("credits.licenseValue")],
              ]}
            />
            <p className="ps4-dim" style={{ fontSize: 12 }}>
              {t("credits.keepNames")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
