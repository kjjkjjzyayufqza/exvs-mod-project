import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOutput, LoaderCircle, Search, Square, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import {
  exportCompleteMotionFbx,
  getBlender51PathOverride,
  getMotionFbxComposeJobStatus,
  IDLE_MOTION_FBX_COMPOSE_JOB,
  isMotionFbxComposeStopped,
  stopMotionFbxCompose,
  type MotionFbxComposeJobStatus,
} from "../motionFbxExportService";
import { MayaSection } from "../MayaInspectorSection";
import { BlenderExecutablePathField } from "./BlenderExecutablePathField";
import { MotionReportCard } from "./MotionReportCard";

type MotionBatchExportPanelProps = {
  nuanmbPaths: readonly string[];
  skeletonPath: string | null;
  numdlbPath: string | null;
  workspaceRoot: string | null;
  disabled: boolean;
};

type BatchClipStatus = "exported" | "failed" | "stopped" | "skipped";

type BatchResult = {
  path: string;
  status: BatchClipStatus;
  error: string | null;
};

type BatchProgress = {
  done: number;
  total: number;
  current: string;
};

function nuanmbStem(path: string): string {
  const base = path.replace(/[/\\]+$/, "");
  const slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
  const file = slash >= 0 ? base.slice(slash + 1) : base;
  return file.toLowerCase().endsWith(".nuanmb") ? file.slice(0, -".nuanmb".length) : file;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clipMatchesQuery(path: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return nuanmbStem(path).toLowerCase().includes(needle) || path.toLowerCase().includes(needle);
}

function formatElapsedClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function jobLogText(status: MotionFbxComposeJobStatus): string {
  return [status.stderrTail.trim(), status.stdoutTail.trim()].filter(Boolean).join("\n");
}

const CLIP_STATUS_I18N: Record<BatchClipStatus, "clipExported" | "clipFailed" | "clipStopped" | "clipSkipped"> = {
  exported: "clipExported",
  failed: "clipFailed",
  stopped: "clipStopped",
  skipped: "clipSkipped",
};

export function MotionBatchExportPanel({
  nuanmbPaths,
  skeletonPath,
  numdlbPath,
  workspaceRoot,
  disabled,
}: MotionBatchExportPanelProps) {
  const { t } = useTranslation("ssbh-motion");
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [abortedOnBlender, setAbortedOnBlender] = useState(false);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [jobStatus, setJobStatus] = useState<MotionFbxComposeJobStatus>(IDLE_MOTION_FBX_COMPOSE_JOB);
  const deferredQuery = useDeferredValue(query);
  const cancelledRef = useRef(false);
  const dismissedRef = useRef(false);

  const visiblePaths = useMemo(
    () => nuanmbPaths.filter((path) => clipMatchesQuery(path, deferredQuery)),
    [deferredQuery, nuanmbPaths],
  );
  const targets = useMemo(
    () => nuanmbPaths.filter((path) => !excluded.has(path)),
    [excluded, nuanmbPaths],
  );
  const visibleSelectedCount = visiblePaths.filter((path) => !excluded.has(path)).length;
  const canRun = Boolean(skeletonPath && numdlbPath) && targets.length > 0 && !running && !disabled;

  const toggleExcluded = useCallback((path: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const selectVisible = useCallback(() => {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const path of visiblePaths) next.delete(path);
      return next;
    });
  }, [visiblePaths]);

  const selectNoneVisible = useCallback(() => {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const path of visiblePaths) next.add(path);
      return next;
    });
  }, [visiblePaths]);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await getMotionFbxComposeJobStatus();
        if (!cancelled) setJobStatus(next);
      } catch {
        // The export invoke still owns the failure; status is display-only.
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 400);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [running]);

  const handleStop = useCallback(async () => {
    cancelledRef.current = true;
    setStopping(true);
    try {
      await stopMotionFbxCompose();
    } catch (caughtError) {
      toast.error(errorMessage(caughtError));
    }
  }, []);

  const handleExit = useCallback(async () => {
    dismissedRef.current = true;
    cancelledRef.current = true;
    if (running) {
      setStopping(true);
      try {
        await stopMotionFbxCompose();
      } catch (caughtError) {
        toast.error(errorMessage(caughtError));
      }
    }
    setResults([]);
    setProgress(null);
    setAbortedOnBlender(false);
    setJobOpen(false);
    setJobStatus(IDLE_MOTION_FBX_COMPOSE_JOB);
    setStopping(false);
    setRunning(false);
  }, [running]);

  const runBatch = useCallback(async () => {
    if (!skeletonPath || !numdlbPath || targets.length === 0) return;
    const outputDir = await open({
      title: t("batchExport.chooseFolder"),
      directory: true,
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhMotionBatchExportDir, workspaceRoot),
    });
    if (typeof outputDir !== "string" || !outputDir.trim()) return;
    rememberDialogSelection(DialogLastPathKey.ssbhMotionBatchExportDir, outputDir, "directory");

    const sep = outputDir.includes("\\") ? "\\" : "/";
    const dir = outputDir.replace(/[/\\]+$/, "");
    const collected: BatchResult[] = [];
    cancelledRef.current = false;
    dismissedRef.current = false;
    setRunning(true);
    setStopping(false);
    setJobOpen(true);
    setResults([]);
    setAbortedOnBlender(false);
    setJobStatus(IDLE_MOTION_FBX_COMPOSE_JOB);
    try {
      for (const [index, nuanmbPath] of targets.entries()) {
        if (cancelledRef.current) {
          for (const remaining of targets.slice(index)) {
            collected.push({ path: remaining, status: "skipped", error: null });
          }
          break;
        }
        setProgress({ done: index, total: targets.length, current: nuanmbStem(nuanmbPath) });
        try {
          await exportCompleteMotionFbx({
            nuanmbPath,
            nusktbPath: skeletonPath,
            numdlbPath,
            outputFbxPath: `${dir}${sep}${nuanmbStem(nuanmbPath)}.fbx`,
            blenderPath: getBlender51PathOverride(),
            actionName: null,
          });
          collected.push({ path: nuanmbPath, status: "exported", error: null });
        } catch (caughtError) {
          const message = errorMessage(caughtError);
          if (cancelledRef.current || isMotionFbxComposeStopped(caughtError)) {
            collected.push({ path: nuanmbPath, status: "stopped", error: message });
            for (const remaining of targets.slice(index + 1)) {
              collected.push({ path: remaining, status: "skipped", error: null });
            }
            break;
          }
          collected.push({ path: nuanmbPath, status: "failed", error: message });
          if (/blender/i.test(message)) {
            setAbortedOnBlender(true);
            for (const remaining of targets.slice(index + 1)) {
              collected.push({ path: remaining, status: "skipped", error: null });
            }
            break;
          }
        }
      }
    } finally {
      const failed = collected.filter((result) => result.status === "failed").length;
      const exported = collected.filter((result) => result.status === "exported").length;
      const stopped = collected.some((result) => result.status === "stopped");
      if (!dismissedRef.current) {
        setResults(collected);
        setProgress(null);
        setJobOpen(true);
        if (stopped) {
          toast.error(t("batchExport.stoppedToast"), {
            description: t("batchExport.exportedFailed", { exported, failed }),
          });
        } else if (failed === 0 && exported > 0) {
          toast.success(t("batchExport.finished"), {
            description: t("batchExport.clipsExported", { count: exported }),
          });
        } else if (failed > 0) {
          toast.error(t("batchExport.finishedWithFailures"), {
            description: t("batchExport.exportedFailed", { exported, failed }),
          });
        }
      }
      setStopping(false);
      setRunning(false);
    }
  }, [numdlbPath, skeletonPath, t, targets, workspaceRoot]);

  const failedResults = results.filter((result) => result.status === "failed");
  const exportedCount = results.filter((result) => result.status === "exported").length;
  const stopped = results.some((result) => result.status === "stopped") || stopping;
  const logText = jobLogText(jobStatus);
  const jobStatusLabel = running
    ? stopping
      ? t("batchExport.statusStopping")
      : t("batchExport.statusRunning")
    : stopped
      ? t("batchExport.statusCancelled")
      : t("batchExport.statusFinished");

  return (
    <MayaSection
      title={t("batchExport.title")}
      icon={<FolderOutput className="h-3.5 w-3.5 opacity-80" />}
      defaultOpen={false}
    >
      <div className="flex flex-col gap-2 text-[10px]">
        <p className="text-pretty text-muted-foreground">{t("batchExport.hint")}</p>
        <BlenderExecutablePathField disabled={running || disabled} />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("batchExport.searchPlaceholder")}
            aria-label={t("batchExport.searchAria")}
            className="h-8 pr-2 pl-7 text-[11px] transition-[border-color,box-shadow] duration-150 ease-out"
            disabled={disabled}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="tabular-nums text-muted-foreground">
            {t("batchExport.selectedCount", { selected: targets.length, total: nuanmbPaths.length })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 min-w-8 px-2 text-[10px] transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]"
            disabled={running || disabled || visibleSelectedCount === visiblePaths.length || visiblePaths.length === 0}
            onClick={selectVisible}
          >
            {t("batchExport.all")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 min-w-8 px-2 text-[10px] transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]"
            disabled={running || disabled || visibleSelectedCount === 0}
            onClick={selectNoneVisible}
          >
            {t("batchExport.none")}
          </Button>
        </div>
        <div className="flex max-h-48 flex-col overflow-y-auto rounded-md border border-border/40 px-1 py-1">
          {visiblePaths.length === 0 ? (
            <p className="px-1 py-2 text-muted-foreground">{t("batchExport.noMatch")}</p>
          ) : (
            visiblePaths.map((path) => {
              const stem = nuanmbStem(path);
              const id = `batch-export-${path}`;
              return (
                <div
                  key={path}
                  className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 transition-colors duration-150 ease-out hover:bg-muted/30"
                >
                  <Checkbox
                    id={id}
                    className="h-3.5 w-3.5 [&_svg]:h-2.5 [&_svg]:w-2.5"
                    checked={!excluded.has(path)}
                    disabled={running || disabled}
                    onCheckedChange={() => toggleExcluded(path)}
                  />
                  <Label
                    htmlFor={id}
                    className="w-full cursor-pointer truncate text-[10px] font-normal select-text"
                    title={stem}
                  >
                    {stem}
                  </Label>
                </div>
              );
            })
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-8 text-[10px] transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]"
            disabled={!canRun}
            onClick={() => void runBatch()}
          >
            {running ? (
              <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
            ) : (
              <FolderOutput className="mr-1 h-3.5 w-3.5" />
            )}
            {t("batchExport.exportAll", { count: targets.length })}
          </Button>
          {running ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-[10px] text-destructive transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]"
              onClick={() => void handleStop()}
              disabled={stopping}
            >
              <Square className="mr-1 h-3 w-3 fill-current" />
              {t("batchExport.stop")}
            </Button>
          ) : null}
          {jobOpen ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-[10px] transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]"
              onClick={() => void handleExit()}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              {t("batchExport.exit")}
            </Button>
          ) : null}
        </div>
        {jobOpen ? (
          <div
            className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-2"
            aria-live="polite"
            aria-busy={running}
          >
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  running
                    ? "bg-primary motion-safe:animate-pulse"
                    : stopped
                      ? "bg-amber-500"
                      : failedResults.length > 0
                        ? "bg-destructive"
                        : "bg-emerald-600",
                )}
                aria-hidden
              />
              <span className="font-medium tabular-nums">{jobStatusLabel}</span>
              {progress ? (
                <span className="font-mono text-muted-foreground" data-i18n-ignore="">
                  {progress.done + 1}/{progress.total}: {progress.current}
                </span>
              ) : null}
            </div>
            {progress ? (
              <Progress
                className="h-1"
                value={((progress.done + (running ? 0.35 : 1)) / Math.max(1, progress.total)) * 100}
              />
            ) : null}
            <div className="flex flex-col gap-0.5 font-mono text-[10px] text-muted-foreground select-text">
              {jobStatus.pid != null ? (
                <span>{t("batchExport.processPid", { pid: jobStatus.pid })}</span>
              ) : running ? (
                <span>{t("batchExport.processIdle")}</span>
              ) : null}
              {jobStatus.blenderPath ? (
                <span className="wrap-anywhere">
                  {t("batchExport.processBlender", { path: jobStatus.blenderPath })}
                </span>
              ) : null}
              {running || jobStatus.elapsedMs > 0 ? (
                <span className="tabular-nums">
                  {t("batchExport.processElapsed", { clock: formatElapsedClock(jobStatus.elapsedMs) })}
                </span>
              ) : null}
            </div>
            {logText ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">{t("batchExport.processLog")}</span>
                <pre className="max-h-24 overflow-auto rounded-sm border border-border/40 bg-background/70 px-1.5 py-1 font-mono text-[10px] leading-snug whitespace-pre-wrap select-text">
                  {logText}
                </pre>
              </div>
            ) : null}
            {abortedOnBlender ? (
              <p role="alert" className="flex gap-1.5 text-destructive wrap-anywhere">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{t("batchExport.blenderFailed")}</span>
              </p>
            ) : null}
            {results.length > 0 ? (
              <MotionReportCard title={t("batchExport.exportedFailed", { exported: exportedCount, failed: failedResults.length })}>
                {results.some((result) => result.status === "skipped") ? (
                  <div className="mt-1 text-muted-foreground">{t("batchExport.skippedRemaining")}</div>
                ) : null}
                {results.map((result) => (
                  <div
                    key={result.path}
                    className={cn(
                      "mt-1 wrap-anywhere select-text",
                      result.status === "failed" || result.status === "stopped"
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                    data-i18n-ignore=""
                  >
                    {nuanmbStem(result.path)}: {t(`batchExport.${CLIP_STATUS_I18N[result.status]}`)}
                    {result.error ? ` ${result.error}` : ""}
                  </div>
                ))}
              </MotionReportCard>
            ) : null}
          </div>
        ) : null}
      </div>
    </MayaSection>
  );
}
