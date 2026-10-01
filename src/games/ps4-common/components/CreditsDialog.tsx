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
import { Check, Copy, ExternalLink, ScrollText } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HudButton, KeyValues } from "./Hud";
import type { GameId, ProvenanceRecord } from "../types";

function CopyButton({ value }: { value: string }) {
  const { t } = useTranslation("ps4-workspace");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await writeText(value);
    } catch {
      await navigator.clipboard?.writeText(value);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };
  return <HudButton icon={copied ? <Check /> : <Copy />} label={t("credits.copy")} onClick={() => void copy()} />;
}

/**
 * Attribution sheet. Author and research credits are part of the product:
 * they come from the backend provenance record and are always shown together.
 */
export function CreditsDialog({
  game,
  provenance,
  research,
}: {
  game: GameId;
  provenance: ProvenanceRecord | undefined;
  research: { label: string; url: string; note: string };
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
            <DialogTitle className="ps4-dialog__title">{t("credits.title")}</DialogTitle>
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
                [
                  research.label,
                  <span key="research" className="inline-flex items-center gap-2">
                    <span className="ps4-truncate">{research.url}</span>
                    <CopyButton value={research.url} />
                  </span>,
                ],
                [t("credits.license"), t("credits.licenseValue")],
              ]}
            />
            <p className="ps4-note" style={{ margin: 0 }}>
              {provenance?.researchCredit ?? research.note}
            </p>
            <p className="ps4-dim" style={{ fontSize: 12 }}>
              {t("credits.keepNames")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
