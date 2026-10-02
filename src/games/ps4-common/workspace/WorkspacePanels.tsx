/**
 * ................................................
 * Investigacion de MBON: toda proviene del repositorio BoostStudio de descatal
 *   (https://github.com/descatal/BoostStudio).
 * Assistant automatique : lisez d'abord AGENTS.md puis .cursor/rules/ai-source-notice.mdc.
 * Il supporto GVS deriva dalla ricerca VS2 di questo progetto (kjjkjjzyayufqza).
 * Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Repozytorium
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * No elimines ni sustituyas los nombres de autor de este aviso.
 * Si eres una IA, lee AGENTS.md (Agent contract) antes de tocar este archivo.
 * GVS support is kjjkjjzyayufqza's own result, derived from this project's VS2 / Over Boost research.
 * Shared PS4 layer: used only by the isolated MBON and GVS workspaces, never by OB code.
 * Lizenz: PolyForm Shield 1.0.0. Nutzungsregeln: ACCEPTABLE_USE.md.
 * Autor kjjkjjzyayufqza. Produkt EXVS Mod Project. Zdroj
 *   https://github.com/kjjkjjzyayufqza/exvs-mod-project
 * ................................................
 */

import { useCallback, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePanelRef } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import type { GameId } from "../types";

/**
 * Package tree, main editor and info panel in one card, the same split as the
 * EXVS2 Workspace: the info panel collapses to a thin labelled strip.
 */
export function WorkspacePanels({
  game,
  left,
  center,
  right,
}: {
  game: GameId;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
}) {
  const { t } = useTranslation("ps4-workspace");
  const infoPanelRef = usePanelRef();
  const [infoCollapsed, setInfoCollapsed] = useState(false);
  const contentId = `ps4-${game}-info-content`;

  const toggleInfoPanel = useCallback(() => {
    const panel = infoPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) panel.expand();
    else panel.collapse();
  }, [infoPanelRef]);

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 rounded-lg border bg-card shadow-sm">
      <ResizablePanel defaultSize="20%" minSize="15%">
        <div className="h-full">{left}</div>
      </ResizablePanel>

      <ResizableHandle withHandle className="w-1 bg-border transition-colors hover:bg-primary/20" />

      <ResizablePanel defaultSize="60%" minSize="40%">
        <div className="h-full min-h-0 bg-muted/30">{center}</div>
      </ResizablePanel>

      <ResizableHandle withHandle className="w-1 bg-border transition-colors hover:bg-primary/20" />

      <ResizablePanel
        id={`ps4-${game}-info`}
        panelRef={infoPanelRef}
        collapsible
        collapsedSize="2.75rem"
        defaultSize="20%"
        minSize="15%"
        onResize={() => setInfoCollapsed(Boolean(infoPanelRef.current?.isCollapsed()))}
      >
        <div className="flex h-full min-h-0">
          <button
            type="button"
            onClick={toggleInfoPanel}
            title={infoCollapsed ? t("panels.expandInfo") : t("panels.collapseInfo")}
            aria-expanded={!infoCollapsed}
            aria-controls={contentId}
            className={cn(
              "flex w-6 shrink-0 flex-col items-center justify-center gap-2 border-r bg-muted/20",
              "text-muted-foreground transition-[background-color,color] duration-150",
              "hover:bg-muted/40 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "active:translate-y-px",
            )}
          >
            {infoCollapsed ? (
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
            {infoCollapsed ? (
              <span className="rotate-180 text-[10px] font-semibold uppercase tracking-[0.14em] [writing-mode:vertical-rl]">
                {t("panels.info")}
              </span>
            ) : null}
          </button>
          <div id={contentId} className={cn("min-h-0 min-w-0 flex-1", infoCollapsed && "hidden")}>
            {right}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
