import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, PanelBottom, PanelLeft, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export function MissionWorkbench({
  showLibrary, showInspector, showDock, onToggleLibrary, onToggleInspector, onToggleDock, toolbar, alerts, navigator, canvas, details, dock,
}: {
  showLibrary: boolean; showInspector: boolean; showDock: boolean;
  onToggleLibrary: () => void; onToggleInspector: () => void; onToggleDock: () => void;
  toolbar: ReactNode; alerts: ReactNode; navigator: ReactNode; canvas: ReactNode; details: ReactNode; dock: ReactNode;
}) {
  const { t } = useTranslation("mission-node-editor");
  const stage = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!top.current) return;
    const measure = () => stage.current?.style.setProperty("--mission-hud-top", `${Math.ceil(top.current!.getBoundingClientRect().height) + 12}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(top.current);
    measure();
    return () => observer.disconnect();
  }, []);
  return <div ref={stage} className="mission-stage"
    data-library={showLibrary ? "on" : "off"} data-inspector={showInspector ? "on" : "off"} data-dock={showDock ? "on" : "off"}>
    <div className="mission-stage-canvas">{canvas}</div>
    <div className="mission-hud">
      <div ref={top} className="mission-plane-top">
        <div className="mission-plane mission-plane-toolbar">{toolbar}</div>
      </div>
      {alerts}
      {showLibrary
        ? <aside className="mission-plane mission-plane-left" aria-label={t("panels.actions")}>
          <div className="mission-panel-head">
            <span className="mission-panel-title">{t("panels.actions")}</span>
            <Button type="button" size="icon" className="mission-hit mission-panel-collapse" variant="ghost"
              aria-label={t("panels.collapseActions")} onClick={onToggleLibrary}><ChevronLeft size={16} /></Button>
          </div>
          <div className="mission-panel-scroll">{navigator}</div>
        </aside>
        : <Button type="button" size="icon" className="mission-panel-rail mission-panel-rail-left mission-hit" variant="secondary"
          aria-label={t("panels.expandActions")} onClick={onToggleLibrary}><PanelLeft size={16} /></Button>}
      {showInspector
        ? <div className="mission-plane mission-plane-right-wrap">
          <div className="mission-panel-head mission-panel-head-right">
            <span className="mission-panel-title">{t("panels.details")}</span>
            <Button type="button" size="icon" className="mission-hit mission-panel-collapse" variant="ghost"
              aria-label={t("panels.collapseDetails")} onClick={onToggleInspector}><ChevronRight size={16} /></Button>
          </div>
          {details}
        </div>
        : <Button type="button" size="icon" className="mission-panel-rail mission-panel-rail-right mission-hit" variant="secondary"
          aria-label={t("panels.expandDetails")} onClick={onToggleInspector}><PanelRight size={16} /></Button>}
      {showDock
        ? <div className="mission-plane mission-plane-bottom">
          <div className="mission-panel-head mission-panel-head-dock">
            <Button type="button" size="icon" className="mission-hit mission-panel-collapse" variant="ghost"
              aria-label={t("panels.collapseDock")} onClick={onToggleDock}><ChevronDown size={16} /></Button>
          </div>
          {dock}
        </div>
        : <Button type="button" size="icon" className="mission-panel-rail mission-panel-rail-bottom mission-hit" variant="secondary"
          aria-label={t("panels.expandDock")} onClick={onToggleDock}><PanelBottom size={16} /></Button>}
    </div>
  </div>;
}
