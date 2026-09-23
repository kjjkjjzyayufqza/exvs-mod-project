import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { GraphBuild } from "@/services/missionGraph/graph";
import type { GraphIssue } from "@/services/missionGraph/issues";
import { PhaseDebugger } from "./PhaseDebugger";
import { ProblemsPanel } from "./ProblemsPanel";
import type { BuildLogEntry } from "../hooks/useMissionBuild";
import type { DockTab } from "../hooks/useMissionSelection";

export function MissionBottomDock({
  tab, onTab, issues, onFocus, build, stale, log,
}: {
  tab: DockTab; onTab: (tab: DockTab) => void; issues: GraphIssue[]; onFocus: (issue: GraphIssue) => void;
  build: GraphBuild | null; stale: boolean; log: BuildLogEntry[];
}) {
  const { t } = useTranslation("mission-node-editor");
  const errors = issues.filter((issue) => issue.severity === "error").length;
  return <section className="mission-dock" aria-label={t("dock.label")}>
    <div className="flex flex-wrap gap-1 border-b" role="tablist" aria-label={t("dock.label")}>
      {([
        ["problems", `${t("dock.problems")} (${errors})`],
        ["source", t("dock.source")],
        ["trace", t("dock.trace")],
        ["log", t("dock.log")],
      ] as const).map(([key, label]) => <Button key={key} size="sm" className="mission-hit" role="tab" aria-selected={tab === key}
        variant={tab === key ? "secondary" : "ghost"} onClick={() => onTab(key)}>{label}</Button>)}
    </div>
    <div className="mission-dock-body">
      {tab === "problems" && <ProblemsPanel issues={issues} onFocus={onFocus} />}
      {tab === "source" && (build
        ? <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">{stale ? t("dock.stale") : t("dock.fresh")}</p>
          <Textarea aria-label="Generated MSC C" readOnly className="h-48 min-h-0 resize-y bg-muted/30 p-3 font-mono text-xs shadow-none" value={build.c} />
        </div>
        : <p className="mission-panel-caption">{t("dock.noSource")}</p>)}
      {tab === "trace" && (build
        ? <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">{t("dock.traceScope")}</p>
          <PhaseDebugger model={build.model} />
        </div>
        : <p className="mission-panel-caption">{t("dock.noTrace")}</p>)}
      {tab === "log" && <ul className="max-h-48 space-y-1 overflow-auto font-mono text-[11px]">
        {log.length ? log.map((entry) => <li key={entry.at} className={entry.kind === "error" ? "text-destructive" : "text-muted-foreground"}>{entry.message}</li>) : <li className="text-muted-foreground">{t("dock.emptyLog")}</li>}
      </ul>}
    </div>
  </section>;
}
