import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FileCode, FilePlus2, Loader2, MonitorPlay, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { PlanKind, PlannedWrite, RoutePlan } from "@/services/triadRoute/types";

/** The order the sections read best in: tables first, then per-stage files. */
const KIND_ORDER: PlanKind[] = [
  "course-table",
  "scene-table",
  "scene-id-table",
  "briefing",
  "script",
];

const KIND_ICON = {
  "course-table": Table2,
  "scene-table": Table2,
  "scene-id-table": Table2,
  briefing: MonitorPlay,
  script: FileCode,
} as const;

type SavePreviewDialogProps = {
  /** `null` keeps the dialog closed; the plan arrives before it opens. */
  plan: RoutePlan | null;
  /** Set while the plan is still being computed. */
  isPlanning?: boolean;
  /** Why the plan could not be computed, when it could not. */
  planError?: string | null;
  isSaving?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Trim a long absolute path down to the part that identifies the file. */
function shortPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts.slice(-2).join("/");
}

/**
 * What saving is about to do, before it does it.
 *
 * The route editor writes five different packages at once and leaves a `.bak`
 * beside each replaced file. Listing them first turns "I pressed save" into
 * "I know which five files changed", which is the difference between a tool a
 * modder trusts with their workspace and one they keep backing up by hand.
 */
export function SavePreviewDialog({
  plan,
  isPlanning,
  planError,
  isSaving,
  onCancel,
  onConfirm,
}: SavePreviewDialogProps) {
  const { t } = useTranslation("test-triad-route");

  const sections = useMemo(() => {
    if (!plan) return [];
    return KIND_ORDER.map((kind) => ({
      kind,
      writes: plan.writes.filter((write) => write.kind === kind),
    })).filter((section) => section.writes.length > 0);
  }, [plan]);

  const created = plan?.writes.filter((write) => !write.replacesExisting).length ?? 0;
  const untouched = plan?.writes.filter((write) => write.unchanged).length ?? 0;
  const isOpen = plan !== null || Boolean(isPlanning) || Boolean(planError);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="max-h-[85vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("save.previewTitle")}</DialogTitle>
          <DialogDescription>{t("save.previewDescription")}</DialogDescription>
        </DialogHeader>

        {isPlanning ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("save.planning")}
          </p>
        ) : planError ? (
          <p
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            style={{ textWrap: "pretty" }}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {t("save.planFailed", { message: planError })}
          </p>
        ) : plan ? (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {t("save.fileCount", { count: plan.writes.length })}
              </span>
              {created > 0 ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <FilePlus2 className="size-3.5" />
                  {t("save.createdCount", { count: created })}
                </span>
              ) : null}
              {untouched > 0 ? <span>{t("save.unchangedCount", { count: untouched })}</span> : null}
            </div>

            <ScrollArea className="max-h-[46vh]">
              <div className="flex flex-col gap-3 pr-3">
                {sections.map((section) => {
                  const Icon = KIND_ICON[section.kind];
                  return (
                    <section key={section.kind} className="flex flex-col gap-1">
                      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Icon className="size-3.5" />
                        {t(`save.kind.${section.kind}`)}
                      </h4>
                      {section.writes.map((write) => (
                        <PlanRow key={write.path} write={write} />
                      ))}
                    </section>
                  );
                })}
              </div>
            </ScrollArea>

            <p className="text-[11px] text-muted-foreground" style={{ textWrap: "pretty" }}>
              {t("save.backupNote")}
            </p>
          </>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" disabled={isSaving} onClick={onCancel}>
            {t("wizard.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!plan || isSaving || isPlanning}
            onClick={onConfirm}
          >
            {isSaving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {isSaving ? t("save.saving") : t("save.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanRow({ write }: { write: PlannedWrite }) {
  const { t } = useTranslation("test-triad-route");

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-xs",
        write.unchanged ? "border-dashed text-muted-foreground" : "bg-card/60",
      )}
    >
      {write.stageIndex !== null ? (
        <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-semibold tabular-nums">
          {t("stages.stage", { index: write.stageIndex })}
        </span>
      ) : null}
      <span className="truncate font-mono text-[11px]" title={write.path}>
        {shortPath(write.path)}
      </span>
      <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground">
        {t("save.bytes", { count: write.byteLen })}
      </span>
      <span
        className={cn(
          "shrink-0 rounded px-1 text-[10px] font-medium",
          write.unchanged
            ? "text-muted-foreground"
            : write.replacesExisting
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        )}
      >
        {write.unchanged
          ? t("save.rowUnchanged")
          : write.replacesExisting
            ? t("save.rowReplaced")
            : t("save.rowCreated")}
      </span>
    </div>
  );
}
