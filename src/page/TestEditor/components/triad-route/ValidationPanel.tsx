import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CornerUpRight,
  RefreshCw,
  ShieldQuestion,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  issueLocationLabel,
  issueTitle,
  isNavigableLocation,
} from "@/services/triadRoute/issueLocation";
import { summariseIssues } from "@/services/triadRoute/routeDraft";
import type {
  IssueSeverity,
  ReferenceList,
  ValidationIssue,
} from "@/services/triadRoute/types";
import { SEVERITY_STYLE } from "./severity";

type ValidationPanelProps = {
  issues: ValidationIssue[];
  /** Reference lists the validator had to skip. */
  notChecked: ReferenceList[];
  /** False before any route is open: nothing has been checked yet. */
  hasRoute: boolean;
  isChecking: boolean;
  onRecheck: () => void;
  onFocusIssue: (location: string) => void;
};

/**
 * The route's health bar.
 *
 * It sits as a full-width strip above the editor and stays folded until the
 * modder opens it, so a clean route does not spend a column on an empty list.
 * The collapsed row still answers the only question that gates Save: is the
 * route blocked?
 */
export function ValidationPanel({
  issues,
  notChecked,
  hasRoute,
  isChecking,
  onRecheck,
  onFocusIssue,
}: ValidationPanelProps) {
  const { t } = useTranslation("test-triad-route");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<IssueSeverity | "notes" | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  const summary = useMemo(() => summariseIssues(issues), [issues]);
  const actionable = useMemo(
    () => issues.filter((issue) => issue.severity !== "info"),
    [issues],
  );
  const notes = useMemo(
    () => issues.filter((issue) => issue.severity === "info"),
    [issues],
  );

  const visible = useMemo(() => {
    if (filter === "notes") return notes;
    if (filter) return issues.filter((issue) => issue.severity === filter);
    return notesOpen ? issues : actionable;
  }, [actionable, filter, issues, notes, notesOpen]);

  const status = !hasRoute
    ? "idle"
    : summary.error > 0
      ? "blocked"
      : summary.warning > 0
        ? "warnings"
        : "ready";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="flex shrink-0 flex-col rounded-lg border bg-card/40">
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left",
                "transition-[background-color] duration-150 ease-out hover:bg-accent/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                  open && "rotate-180",
                )}
              />
              <h3 className="shrink-0 text-sm font-semibold tracking-tight">
                {t("validation.title")}
              </h3>
              <p
                className={cn(
                  "min-w-0 truncate text-xs",
                  status === "blocked"
                    ? "text-destructive"
                    : status === "warnings"
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-muted-foreground",
                )}
              >
                {!hasRoute
                  ? t("validation.idleSubtitle")
                  : status === "blocked"
                    ? t("validation.blocked", { count: summary.error })
                    : status === "warnings"
                      ? t("validation.warningStatus", { count: summary.warning })
                      : t("validation.ready")}
              </p>
            </button>
          </CollapsibleTrigger>

          {hasRoute
            ? (["error", "warning"] as const).map((severity) => {
                const count = summary[severity];
                const style = SEVERITY_STYLE[severity];
                const isActive = filter === severity;
                return (
                  <button
                    key={severity}
                    type="button"
                    disabled={count === 0}
                    aria-pressed={isActive}
                    onClick={() => {
                      setFilter(isActive && open ? null : severity);
                      setOpen(true);
                    }}
                    className={cn(
                      "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium",
                      "transition-[background-color,border-color,opacity,transform] duration-150 ease-out",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "disabled:cursor-default disabled:opacity-45",
                      count > 0 && "active:translate-y-px",
                      count > 0 ? style.badge : "border-border bg-transparent text-muted-foreground",
                      isActive && "ring-2 ring-ring",
                    )}
                  >
                    <style.icon className="size-3.5" />
                    <span className="tabular-nums">{count}</span>
                    <span>{t(`validation.${severity}`)}</span>
                  </button>
                );
              })
            : null}

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9 shrink-0"
            onClick={onRecheck}
            disabled={isChecking || !hasRoute}
            title={t("validation.revalidate")}
            aria-label={t("validation.revalidate")}
          >
            <RefreshCw className={cn("size-4", isChecking && "animate-spin")} />
          </Button>
        </div>

        <CollapsibleContent>
          <div className="flex flex-col gap-3 border-t p-3">
            {!hasRoute ? (
              <PanelNotice icon={CircleDashed} text={t("validation.idle")} />
            ) : actionable.length === 0 ? (
              <PanelNotice
                icon={CheckCircle2}
                iconClassName="text-emerald-600 dark:text-emerald-400"
                text={t("validation.clean")}
              />
            ) : (
              <ScrollArea className="max-h-56 pr-2.5">
                <div className="flex flex-col gap-1.5">
                  {visible
                    .filter((issue) => issue.severity !== "info")
                    .map((entry, index) => (
                      <IssueCard
                        key={`${entry.code}-${entry.location}-${index}`}
                        issue={entry}
                        onFocus={() => onFocusIssue(entry.location)}
                      />
                    ))}
                  {filter && visible.filter((issue) => issue.severity !== "info").length === 0 ? (
                    <p className="px-1 text-xs text-muted-foreground">
                      {t("validation.filteredEmpty")}
                    </p>
                  ) : null}
                </div>
              </ScrollArea>
            )}

            {hasRoute && notes.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  aria-expanded={notesOpen || filter === "notes"}
                  onClick={() => {
                    setFilter(null);
                    setNotesOpen((current) => !current);
                  }}
                  className={cn(
                    "inline-flex min-h-8 items-center justify-between rounded-md border px-2 text-[11px] font-medium",
                    "text-muted-foreground transition-[background-color,color] duration-150 ease-out",
                    "hover:bg-accent hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <span>{t("validation.notesHidden", { count: notes.length })}</span>
                  <span className="tabular-nums">
                    {notesOpen ? t("validation.hideNotes") : t("validation.showNotes")}
                  </span>
                </button>
                {notesOpen || filter === "notes" ? (
                  <div className="flex flex-col gap-1.5">
                    {notes.map((entry, index) => (
                      <IssueCard
                        key={`${entry.code}-${entry.location}-note-${index}`}
                        issue={entry}
                        onFocus={() => onFocusIssue(entry.location)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {hasRoute && notChecked.length > 0 ? (
              <footer className="flex items-start gap-2 rounded-md border border-dashed px-2.5 py-2">
                <ShieldQuestion className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium">{t("validation.notCheckedTitle")}</p>
                  <p
                    className="mt-0.5 text-[11px] leading-snug text-muted-foreground"
                    style={{ textWrap: "pretty" }}
                  >
                    {t("validation.notCheckedBody", {
                      lists: notChecked.map((list) => t(`validation.list.${list}`)).join("、"),
                    })}
                  </p>
                </div>
              </footer>
            ) : null}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function PanelNotice({
  icon: Icon,
  iconClassName,
  text,
}: {
  icon: typeof CheckCircle2;
  iconClassName?: string;
  text: string;
}) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
      <Icon className={cn("mt-px size-4 shrink-0", iconClassName)} />
      <span style={{ textWrap: "pretty" }}>{text}</span>
    </p>
  );
}

function IssueCard({ issue, onFocus }: { issue: ValidationIssue; onFocus: () => void }) {
  const { t } = useTranslation("test-triad-route");
  const style = SEVERITY_STYLE[issue.severity];
  const title = issueTitle((key, options) => t(key, options as Record<string, string>), issue);
  const locationLabel = issueLocationLabel(
    (key, options) => t(key, options as Record<string, string>),
    issue.location,
  );
  const canFocus = isNavigableLocation(issue.location);

  return (
    <article
      className={cn(
        "rounded-md border border-l-2 p-2.5",
        style.surface,
        issue.severity === "error"
          ? "border-l-destructive"
          : issue.severity === "warning"
            ? "border-l-amber-500"
            : "border-l-border",
      )}
    >
      <div className="flex items-start gap-2">
        <style.icon className={cn("mt-0.5 size-3.5 shrink-0", style.text)} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-snug" style={{ textWrap: "pretty" }}>
            {title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {canFocus ? (
              <button
                type="button"
                onClick={onFocus}
                className={cn(
                  "inline-flex min-h-7 items-center gap-1 rounded border bg-background/70 px-1.5",
                  "text-[10px] text-muted-foreground",
                  "transition-[background-color,color,transform] duration-150 ease-out",
                  "hover:bg-accent hover:text-foreground active:translate-y-px",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <CornerUpRight className="size-3" />
                {locationLabel}
              </button>
            ) : (
              <span className="text-[10px] text-muted-foreground">{locationLabel}</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
