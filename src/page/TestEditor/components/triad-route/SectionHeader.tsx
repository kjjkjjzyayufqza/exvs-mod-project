import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { worstSeverity } from "@/services/triadRoute/issueLocation";
import type { ValidationIssue } from "@/services/triadRoute/types";
import { SEVERITY_STYLE } from "./severity";

type SectionHeaderProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Findings addressed to this section, summarised as one badge. */
  issues?: ValidationIssue[];
  /** Buttons that act on the section. */
  actions?: ReactNode;
};

/**
 * One heading shape for every panel in the route editor.
 *
 * The badge on the right answers the question a modder has when scrolling past
 * a collapsed-looking section: is there anything wrong in here? It reports the
 * worst severity the section holds, in the same colours the checks panel uses.
 */
export function SectionHeader({
  icon: Icon,
  title,
  description,
  issues,
  actions,
}: SectionHeaderProps) {
  const { t } = useTranslation("test-triad-route");
  const severity = issues ? worstSeverity(issues) : null;

  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span style={{ textWrap: "balance" }}>{title}</span>
          {severity && issues ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-px",
                "text-[10px] font-medium tabular-nums",
                SEVERITY_STYLE[severity].badge,
              )}
            >
              {t("validation.sectionIssues", { count: issues.length })}
            </span>
          ) : null}
        </h3>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground" style={{ textWrap: "pretty" }}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
