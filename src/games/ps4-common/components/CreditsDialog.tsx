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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FactList } from "./SectionPanel";
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
  return (
    <Button
      variant="outline"
      size="icon"
      className="h-7 w-7 shrink-0"
      title={t("credits.copy")}
      aria-label={t("credits.copy")}
      onClick={() => void copy()}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
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
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={() => setOpen(true)}
        title={t("credits.open")}
        aria-label={t("credits.open")}
      >
        <ScrollText className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl" data-game={game}>
          <DialogHeader>
            <DialogTitle>{t("credits.title")}</DialogTitle>
            <DialogDescription>{t("credits.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <FactList
              rows={[
                [t("credits.product"), provenance?.generator ?? "EXVS Mod Project"],
                [t("credits.author"), author],
                [
                  t("credits.repository"),
                  <span key="repo" className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 break-all">{repository}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      title={t("credits.visit")}
                      aria-label={t("credits.visit")}
                      onClick={() => void openUrl(repository)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </span>,
                ],
                [
                  research.label,
                  <span key="research" className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 break-all">{research.url}</span>
                    <CopyButton value={research.url} />
                  </span>,
                ],
                [t("credits.license"), t("credits.licenseValue")],
              ]}
            />
            <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              {provenance?.researchCredit ?? research.note}
            </p>
            <p className="text-xs text-muted-foreground">{t("credits.keepNames")}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
