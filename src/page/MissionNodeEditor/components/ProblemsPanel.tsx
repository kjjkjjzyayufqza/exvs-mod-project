import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import type { GraphIssue, IssueSeverity } from "@/services/missionGraph/issues";

const ROW = 44;

export function ProblemsPanel({ issues, onFocus }: { issues: GraphIssue[]; onFocus: (issue: GraphIssue) => void }) {
  const { t } = useTranslation("mission-node-editor");
  const [filter, setFilter] = useState<IssueSeverity | "all">("all");
  const viewport = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => issues.filter((issue) => filter === "all" || issue.severity === filter), [filter, issues]);
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => viewport.current,
    estimateSize: () => ROW,
    overscan: 8,
  });
  const counts = {
    error: issues.filter((issue) => issue.severity === "error").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
  return <section className="mission-problems" aria-label={t("dock.problems")}>
    <div className="mission-problems-filters" role="toolbar" aria-label={t("problems.filters")}>
      {(["all", "error", "warning", "info"] as const).map((key) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
        {key === "all" ? t("problems.all") : t(`problems.${key}`)}{key !== "all" ? ` ${counts[key]}` : ` ${issues.length}`}
      </button>)}
    </div>
    <div ref={viewport} className="mission-problems-list">
      {visible.length === 0 && <p className="mission-panel-caption">{t("problems.empty")}</p>}
      {visible.length <= 32
        ? visible.map((issue) => <button key={issue.id} type="button" className={`mission-problem is-${issue.severity}`} onClick={() => onFocus(issue)}>
          <span className="mission-problem-code">{issue.severity}</span>
          <span>{t(`issues.${issue.code}`, { defaultValue: issue.message })}</span>
        </button>)
        : <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((row) => {
            const issue = visible[row.index];
            return <button key={issue.id} type="button" className={`mission-problem is-${issue.severity}`}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: row.size, transform: `translateY(${row.start}px)` }}
              onClick={() => onFocus(issue)}>
              <span className="mission-problem-code">{issue.severity}</span>
              <span>{t(`issues.${issue.code}`, { defaultValue: issue.message })}</span>
            </button>;
          })}
        </div>}
    </div>
    <div className="sr-only" aria-live="polite">{t("problems.live", { errors: counts.error, warnings: counts.warning })}</div>
  </section>;
}
