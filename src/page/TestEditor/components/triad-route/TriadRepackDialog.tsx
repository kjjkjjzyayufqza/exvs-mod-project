import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  FileCode,
  Loader2,
  MonitorPlay,
  PackageCheck,
  Table2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { repackFolderUsingStructureToModFolder } from "@/utils/repackRunner";
import {
  canRepack,
  needsRepack,
  type TriadRepackEntry,
  type TriadRepackKind,
  type TriadRepackPlan,
} from "@/services/triadRoute/types";

/** Tables first: they are what decides whether a stage exists at all. */
const KIND_ORDER: TriadRepackKind[] = [
  "route-tables",
  "scene-id-table",
  "briefings",
  "pilot-names",
  "script",
];

const KIND_ICON = {
  "route-tables": Table2,
  "scene-id-table": Table2,
  briefings: MonitorPlay,
  "pilot-names": Users,
  script: FileCode,
} as const;

/** How many edited payload names a row spells out before summarising. */
const EDITED_PREVIEW = 3;

export type TriadRepackDialogProps = {
  open: boolean;
  plan: TriadRepackPlan | null;
  isPlanning: boolean;
  planError: string | null;
  modFolder: string;
  onClose: () => void;
  /** Re-run the plan, so the dialog shows the new state after a repack. */
  onRefresh: () => void;
  /** Lets the workspace drop its "this pack changed" marker. */
  onRepacked?: (entry: TriadRepackEntry) => void;
};

type RunState =
  | { status: "idle" }
  | { status: "running"; done: number; total: number; current: string }
  | { status: "done"; succeeded: string[]; failed: { id: string; message: string }[] };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Which mission packages the game is still missing, and the button that fixes it.
 *
 * Saving a route writes unpacked workspace folders; the game reads `.fhm2d`
 * packages. Nothing in the editor used to stand between those two facts, and
 * the failure is silent: repack the briefing and the stage script but not
 * `triad_battle_list` and `sceneidtable`, and the new course simply is not on
 * the select screen, with no error anywhere to say why.
 *
 * So this lists every mission package — not only the ones this session
 * touched — says where each one stands against the mod folder, and ticks the
 * ones that would change what the game loads.
 */
export function TriadRepackDialog({
  open,
  plan,
  isPlanning,
  planError,
  modFolder,
  onClose,
  onRefresh,
  onRepacked,
}: TriadRepackDialogProps) {
  const { t } = useTranslation("test-triad-route");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [run, setRun] = useState<RunState>({ status: "idle" });

  const entries = useMemo(() => plan?.entries ?? [], [plan]);
  const outstanding = useMemo(
    () => entries.filter((entry) => needsRepack(entry.status)),
    [entries],
  );
  const blocked = useMemo(
    () => entries.filter((entry) => !canRepack(entry.status)),
    [entries],
  );

  // A fresh plan pre-ticks exactly what a repack would change, so the common
  // case is one click and the uncommon case is still visible underneath.
  useEffect(() => {
    if (!plan) return;
    setSelected(new Set(plan.entries.filter((entry) => needsRepack(entry.status)).map((e) => e.id)));
    setRun({ status: "idle" });
  }, [plan]);

  const sections = useMemo(
    () =>
      KIND_ORDER.map((kind) => ({
        kind,
        rows: entries.filter((entry) => entry.kind === kind),
      })).filter((section) => section.rows.length > 0),
    [entries],
  );

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selected.has(entry.id) && canRepack(entry.status)),
    [entries, selected],
  );

  const toggle = useCallback((id: string, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const isRunning = run.status === "running";

  const repack = useCallback(async () => {
    if (selectedEntries.length === 0) return;
    const succeeded: string[] = [];
    const failed: { id: string; message: string }[] = [];

    for (const [index, entry] of selectedEntries.entries()) {
      setRun({
        status: "running",
        done: index,
        total: selectedEntries.length,
        current: entry.label,
      });
      try {
        await repackFolderUsingStructureToModFolder({
          structurePath: entry.structurePath,
          inputFolderPath: entry.folderPath,
          modFolderPath: modFolder,
        });
        succeeded.push(entry.id);
        onRepacked?.(entry);
      } catch (error) {
        failed.push({ id: entry.id, message: errorMessage(error) });
      }
    }

    setRun({ status: "done", succeeded, failed });
    if (failed.length === 0) {
      toast.success(t("repack.done", { count: succeeded.length }));
    } else {
      toast.error(t("repack.partial", { done: succeeded.length, failed: failed.length }));
    }
    onRefresh();
  }, [selectedEntries, modFolder, onRepacked, onRefresh, t]);

  const hasModFolder = modFolder.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !isRunning ? onClose() : undefined)}>
      <DialogContent className="max-h-[88vh] max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("repack.title")}</DialogTitle>
          <DialogDescription>{t("repack.description")}</DialogDescription>
        </DialogHeader>

        {!hasModFolder ? (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {t("repack.noModFolder")}
          </p>
        ) : (
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={modFolder}>
            {t("repack.modFolder", { path: modFolder })}
          </p>
        )}

        {isPlanning ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("repack.planning")}
          </p>
        ) : planError ? (
          <p
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            style={{ textWrap: "pretty" }}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {t("repack.planFailed", { message: planError })}
          </p>
        ) : plan ? (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span
                className={cn(
                  "font-medium",
                  outstanding.length > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400",
                )}
              >
                {outstanding.length > 0
                  ? t("repack.outstanding", { count: outstanding.length })
                  : t("repack.allCurrent")}
              </span>
              <span className="text-muted-foreground">
                {t("repack.packageCount", { count: entries.length })}
              </span>
              {blocked.length > 0 ? (
                <span className="text-destructive">
                  {t("repack.blockedCount", { count: blocked.length })}
                </span>
              ) : null}
              <button
                type="button"
                className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                disabled={isRunning}
                onClick={() =>
                  setSelected(
                    new Set(entries.filter((entry) => canRepack(entry.status)).map((e) => e.id)),
                  )
                }
              >
                {t("repack.selectAll")}
              </button>
              <button
                type="button"
                className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                disabled={isRunning}
                onClick={() => setSelected(new Set(outstanding.map((entry) => entry.id)))}
              >
                {t("repack.selectOutstanding")}
              </button>
            </div>

            <ScrollArea className="max-h-[48vh]">
              <div className="flex flex-col gap-3 pr-3">
                {sections.map((section) => {
                  const Icon = KIND_ICON[section.kind];
                  return (
                    <section key={section.kind} className="flex flex-col gap-1">
                      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Icon className="size-3.5" />
                        {t(`repack.kind.${section.kind}`)}
                      </h4>
                      {section.rows.map((entry) => (
                        <PackageRow
                          key={entry.id}
                          entry={entry}
                          checked={selected.has(entry.id)}
                          disabled={isRunning || !canRepack(entry.status) || !hasModFolder}
                          result={
                            run.status === "done"
                              ? run.failed.find((item) => item.id === entry.id)?.message ??
                                (run.succeeded.includes(entry.id) ? "" : null)
                              : null
                          }
                          onToggle={(checked) => toggle(entry.id, checked)}
                        />
                      ))}
                    </section>
                  );
                })}
              </div>
            </ScrollArea>

            <p className="text-[11px] text-muted-foreground" style={{ textWrap: "pretty" }}>
              {t("repack.note")}
            </p>
          </>
        ) : null}

        <DialogFooter>
          {isRunning ? (
            <span className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t("repack.running", {
                done: run.done + 1,
                total: run.total,
                name: run.current,
              })}
            </span>
          ) : null}
          <Button type="button" variant="ghost" disabled={isRunning} onClick={onClose}>
            {t("wizard.cancel")}
          </Button>
          <Button
            type="button"
            disabled={isRunning || selectedEntries.length === 0 || !hasModFolder}
            onClick={() => void repack()}
          >
            <PackageCheck className={cn("mr-1.5 size-4", isRunning && "animate-pulse")} />
            {t("repack.action", { count: selectedEntries.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Trim a long absolute path down to the part that identifies the file. */
function shortPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts.slice(-2).join("/");
}

function PackageRow({
  entry,
  checked,
  disabled,
  result,
  onToggle,
}: {
  entry: TriadRepackEntry;
  checked: boolean;
  disabled: boolean;
  /** `null` when this row has not run, `""` on success, otherwise the error. */
  result: string | null;
  onToggle: (checked: boolean) => void;
}) {
  const { t } = useTranslation("test-triad-route");
  const outstanding = needsRepack(entry.status);
  const edited = entry.editedPayloads;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-md border px-2.5 py-2 text-xs",
        outstanding ? "border-amber-500/40 bg-amber-500/5" : "bg-card/60",
        !canRepack(entry.status) && "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => onToggle(Boolean(next))}
          aria-label={entry.label}
        />
        <span className="truncate font-medium" title={entry.folderPath}>
          {entry.label}
        </span>
        {entry.packHash ? (
          <span className="shrink-0 rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
            {entry.packHash}
          </span>
        ) : null}
        {entry.inRoute ? (
          <span className="shrink-0 rounded bg-sky-500/10 px-1 text-[10px] font-medium text-sky-700 dark:text-sky-400">
            {t("repack.inRoute")}
          </span>
        ) : null}
        {!entry.required ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {t("load.optional")}
          </span>
        ) : null}
        <StatusBadge status={entry.status} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-6 text-[10px] text-muted-foreground">
        <span className="font-mono" title={entry.outputPath ?? entry.structurePath}>
          {entry.outputPath ? shortPath(entry.outputPath) : shortPath(entry.structurePath)}
        </span>
        <span className="tabular-nums">
          {t("repack.payloads", { count: entry.payloadCount })}
        </span>
        {edited.length > 0 ? (
          <span className="text-amber-700 dark:text-amber-400" title={edited.join("\n")}>
            {edited.length > EDITED_PREVIEW
              ? t("repack.editedMore", {
                  files: edited.slice(0, EDITED_PREVIEW).join(", "),
                  more: edited.length - EDITED_PREVIEW,
                })
              : t("repack.edited", { files: edited.join(", ") })}
          </span>
        ) : null}
      </div>

      {entry.missingPayloads.length > 0 ? (
        <p className="pl-6 text-[10px] text-destructive" title={entry.missingPayloads.join("\n")}>
          {t("repack.missingPayloads", {
            count: entry.missingPayloads.length,
            files: entry.missingPayloads.slice(0, EDITED_PREVIEW).join(", "),
          })}
        </p>
      ) : null}

      {result ? (
        <p className="pl-6 text-[10px] text-destructive" style={{ textWrap: "pretty" }}>
          {result}
        </p>
      ) : result === "" ? (
        <p className="pl-6 text-[10px] text-emerald-700 dark:text-emerald-400">
          {t("repack.rowDone")}
        </p>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: TriadRepackEntry["status"] }) {
  const { t } = useTranslation("test-triad-route");
  const tone = needsRepack(status)
    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
    : status === "current"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "bg-destructive/10 text-destructive";

  return (
    <span className={cn("ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", tone)}>
      {t(`repack.status.${status}`)}
    </span>
  );
}
