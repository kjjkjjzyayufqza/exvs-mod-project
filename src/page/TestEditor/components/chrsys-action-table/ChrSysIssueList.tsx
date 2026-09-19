import { AlertTriangle, CircleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { CHRSYS_I18N_NAMESPACE } from "./chrSysLabels"
import type { ChrSysIssue, ChrSysTableKey } from "./chrSysTypes"

interface ChrSysIssueListProps {
  issues: ChrSysIssue[]
  onSelect: (tableKey: ChrSysTableKey, row: number) => void
}

export function ChrSysIssueList({ issues, onSelect }: ChrSysIssueListProps) {
  const { t } = useTranslation(CHRSYS_I18N_NAMESPACE)
  if (issues.length === 0) {
    return (
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        {t("issues.none")}
      </p>
    )
  }
  return (
    <ul className="max-h-40 divide-y divide-border/40 overflow-y-auto overscroll-contain">
      {issues.map((issue, index) => (
        <li key={`${issue.table}-${issue.row}-${issue.field}-${index}`}>
          <button
            type="button"
            disabled={issue.row === null}
            onClick={() =>
              issue.row !== null &&
              onSelect(issue.table === "action" ? "actionTable" : "transitionTable", issue.row)
            }
            className={cn(
              "flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors duration-150 ease-out",
              issue.row !== null && "hover:bg-muted/60",
            )}
          >
            {issue.level === "error" ? (
              <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden />
            )}
            <span className="min-w-0 flex-1 text-[11px] leading-snug">
              <span className="font-mono tabular-nums text-muted-foreground">
                {issue.table}
                {issue.row === null ? "" : ` #${issue.row}`}
                {issue.field === null ? "" : ` 0x${issue.field.toString(16).toUpperCase().padStart(2, "0")}`}
              </span>{" "}
              {issue.message}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
