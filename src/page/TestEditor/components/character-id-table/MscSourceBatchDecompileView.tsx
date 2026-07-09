import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { readDir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileCode2,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Wand2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getMscConvertLogPath,
  getMscConvertOutputPath,
} from "../../utils/mscWorkspaceUtils";
import {
  decompileMscScript,
  resolveMscActionOverlayForFolder,
} from "../msc-editor/mscWorkspaceActions";
import {
  buildMscSourceBatchPlan,
  clampMscBatchConcurrency,
  createInitialMscBatchRunStats,
  normalizeMscBatchSourcePath,
  runLimitedConcurrency,
  type MscBatchPlan,
  type MscBatchRunStats,
  type MscBatchSourceScope,
} from "../msc-editor/mscBatchDecompile";

const MSC_BATCH_SOURCE_ROOT_SETTING_KEY = "characterIdDebugMscBatchSourceRootPath";
const MSC_BATCH_SINGLE_FOLDER_SETTING_KEY = "characterIdDebugMscSingleSourceFolderPath";
const MSC_BATCH_SCAN_CONCURRENCY = 4;
const MSC_BATCH_PROGRESS_FLUSH_MS = 120;
const MSC_BATCH_WATCHER_SUPPRESSION_MS = 8_000;
const MSC_BATCH_WATCHER_SUPPRESSION_HEARTBEAT_MS = 3_000;
const MSC_BATCH_WATCHER_FINAL_SUPPRESSION_MS = 2_500;
const MAX_VISIBLE_FOLDERS = 80;

interface MscSourceBatchDecompileViewProps {
  defaultRootPath?: string;
  onBusyChange?: (busy: boolean) => void;
}

type MetricTone = "neutral" | "success" | "warning" | "danger" | "info";
type MscBatchRunAction = "decompile" | "overlay";

const metricToneClass: Record<MetricTone, string> = {
  neutral: "border-border bg-muted/20 text-foreground",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Metric({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: number | string;
  tone?: MetricTone;
  icon?: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 rounded-md border p-3", metricToneClass[tone])}>
      <div className="flex items-center justify-between gap-2 text-xs font-medium">
        <span className="truncate">{label}</span>
        {icon ? <span className="shrink-0 opacity-80">{icon}</span> : null}
      </div>
      <div className="mt-2 font-mono text-2xl leading-none text-foreground">{value}</div>
    </div>
  );
}

async function suppressTestEditorWatcher(durationMs: number): Promise<void> {
  await invoke("suppress_test_editor_watcher", { durationMs });
}

export function MscSourceBatchDecompileView({
  defaultRootPath,
  onBusyChange,
}: MscSourceBatchDecompileViewProps) {
  const [sourceScope, setSourceScope] = useState<MscBatchSourceScope>("batch-root");
  const [batchRootPath, setBatchRootPath] = useState(defaultRootPath ?? "");
  const [singleFolderPath, setSingleFolderPath] = useState("");
  const [plan, setPlan] = useState<MscBatchPlan | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runningAction, setRunningAction] = useState<MscBatchRunAction | null>(null);
  const [concurrency, setConcurrency] = useState(10);
  const [runStats, setRunStats] = useState<MscBatchRunStats | null>(null);

  const cancelRequestedRef = useRef(false);
  const watcherSuppressionFailedRef = useRef(false);
  const statsRef = useRef<MscBatchRunStats | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const lastProgressFlushRef = useRef(0);

  useEffect(() => {
    if (!batchRootPath.trim() && defaultRootPath?.trim()) {
      setBatchRootPath(defaultRootPath);
    }
  }, [batchRootPath, defaultRootPath]);

  useEffect(() => {
    onBusyChange?.(isScanning || isRunning);
  }, [isScanning, isRunning, onBusyChange]);

  useEffect(() => {
    return () => {
      cancelRequestedRef.current = true;
      if (progressTimerRef.current !== null) {
        window.clearTimeout(progressTimerRef.current);
      }
    };
  }, []);

  const progressPercent = useMemo(() => {
    if (!runStats) return 0;
    if (runStats.totalScripts > 0) {
      return Math.round((runStats.completedScripts / runStats.totalScripts) * 100);
    }
    if (runStats.totalFolders > 0) {
      return Math.round((runStats.completedFolders / runStats.totalFolders) * 100);
    }
    return 0;
  }, [runStats]);

  const sourcePath = sourceScope === "batch-root" ? batchRootPath : singleFolderPath;
  const activeStoreKey = sourceScope === "batch-root" ? MSC_BATCH_SOURCE_ROOT_SETTING_KEY : MSC_BATCH_SINGLE_FOLDER_SETTING_KEY;
  const sourceLabel = sourceScope === "batch-root" ? "Source root" : "Source folder";
  const sourcePlaceholder = sourceScope === "batch-root"
    ? "Select extracted 040msc folder..."
    : "Select one MSC folder with 0.bscex, 1.cscex, or 2.dscex...";
  const sourcePickerTitle = sourceScope === "batch-root"
    ? "Select extracted 040msc folder"
    : "Select one MSC source folder";
  const sourceDefaultPath = sourceScope === "batch-root"
    ? defaultRootPath
    : singleFolderPath || batchRootPath || defaultRootPath;
  const emptySourceMessage = sourceScope === "batch-root"
    ? "Select a 040msc folder first"
    : "Select one MSC source folder first";

  const visibleFolders = useMemo(() => plan?.folders.slice(0, MAX_VISIBLE_FOLDERS) ?? [], [plan]);
  const hiddenFolderCount = Math.max(0, (plan?.folders.length ?? 0) - visibleFolders.length);

  const flushStats = useCallback((immediate = false) => {
    const current = statsRef.current;
    if (!current) return;

    const publish = () => {
      lastProgressFlushRef.current = Date.now();
      progressTimerRef.current = null;
      setRunStats({ ...statsRef.current!, errors: [...statsRef.current!.errors] });
    };

    if (immediate || Date.now() - lastProgressFlushRef.current >= MSC_BATCH_PROGRESS_FLUSH_MS) {
      if (progressTimerRef.current !== null) {
        window.clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      publish();
      return;
    }

    if (progressTimerRef.current === null) {
      progressTimerRef.current = window.setTimeout(publish, MSC_BATCH_PROGRESS_FLUSH_MS);
    }
  }, []);

  const mutateStats = useCallback(
    (update: (current: MscBatchRunStats) => MscBatchRunStats, immediate = false) => {
      if (!statsRef.current) return;
      statsRef.current = update(statsRef.current);
      flushStats(immediate);
    },
    [flushStats],
  );

  const appendError = useCallback(
    (message: string) => {
      mutateStats(
        (current) => ({
          ...current,
          errors: [message, ...current.errors],
        }),
        true,
      );
    },
    [mutateStats],
  );

  const handleCopyErrors = useCallback(async () => {
    const errors = statsRef.current?.errors ?? runStats?.errors ?? [];
    if (errors.length === 0) return;
    try {
      await writeText(errors.join("\n"));
      toast.success(`Copied ${errors.length} MSC error(s)`);
    } catch (error) {
      toast.error(`Failed to copy errors: ${toErrorMessage(error)}`);
    }
  }, [runStats?.errors]);

  const clearPlanState = useCallback(() => {
    setPlan(null);
    setRunStats(null);
    setScanError(null);
  }, []);

  const handleSourceScopeChange = useCallback((value: string) => {
    const nextScope = value === "single-folder" ? "single-folder" : "batch-root";
    setSourceScope(nextScope);
    clearPlanState();
  }, [clearPlanState]);

  const handleSourcePathChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (sourceScope === "batch-root") {
      setBatchRootPath(event.target.value);
    } else {
      setSingleFolderPath(event.target.value);
    }
    clearPlanState();
  }, [clearPlanState, sourceScope]);

  const scanSource = useCallback(async (): Promise<MscBatchPlan | null> => {
    const trimmedRoot = normalizeMscBatchSourcePath(sourcePath);
    if (!trimmedRoot) {
      toast.error(emptySourceMessage);
      return null;
    }

    setIsScanning(true);
    setScanError(null);
    setPlan(null);

    try {
      const nextPlan = await buildMscSourceBatchPlan({
        sourcePath: trimmedRoot,
        sourceScope,
        readDir,
        joinPath: join,
        getOutputPath: getMscConvertOutputPath,
        getLogPath: getMscConvertLogPath,
        scanConcurrency: MSC_BATCH_SCAN_CONCURRENCY,
      });

      setPlan(nextPlan);
      if (nextPlan.totalScripts === 0) {
        toast.warning("No 0.bscex, 1.cscex, or 2.dscex files found under the selected folder");
      } else {
        toast.success(`Found ${nextPlan.totalScripts} MSC script file(s) in ${nextPlan.folders.length} folder(s)`);
      }
      return nextPlan;
    } catch (error) {
      const message = toErrorMessage(error);
      setScanError(message);
      toast.error(`MSC source scan failed: ${message}`);
      return null;
    } finally {
      setIsScanning(false);
    }
  }, [emptySourceMessage, sourcePath, sourceScope]);

  const handleRun = useCallback(async (action: MscBatchRunAction) => {
    if (isRunning) return;
    const trimmedRoot = normalizeMscBatchSourcePath(sourcePath);
    const activePlan = plan?.rootPath === trimmedRoot && plan.sourceScope === sourceScope ? plan : await scanSource();
    if (!activePlan || activePlan.totalScripts === 0) return;

    cancelRequestedRef.current = false;
    watcherSuppressionFailedRef.current = false;
    const initialStats = createInitialMscBatchRunStats(
      activePlan.folders.length,
      action === "decompile" ? activePlan.totalScripts : 0,
    );
    statsRef.current = initialStats;
    setRunStats(initialStats);
    setIsRunning(true);
    setRunningAction(action);

    let watcherSuppressionTimer: number | null = null;

    try {
      try {
        await suppressTestEditorWatcher(MSC_BATCH_WATCHER_SUPPRESSION_MS);
      } catch (error) {
        throw new Error(`Cannot pause TestEditor file watcher before batch ${action}: ${toErrorMessage(error)}`);
      }

      watcherSuppressionTimer = window.setInterval(() => {
        void suppressTestEditorWatcher(MSC_BATCH_WATCHER_SUPPRESSION_MS).catch((error) => {
          watcherSuppressionFailedRef.current = true;
          cancelRequestedRef.current = true;
          appendError(`TestEditor watcher suppression failed; stopping new jobs: ${toErrorMessage(error)}`);
        });
      }, MSC_BATCH_WATCHER_SUPPRESSION_HEARTBEAT_MS);

      if (action === "decompile") {
        const decompileJobs = activePlan.folders.flatMap((folder) =>
          folder.scripts.map((script) => ({ folder, script })),
        );

        await runLimitedConcurrency(
          decompileJobs,
          concurrency,
          () => cancelRequestedRef.current || watcherSuppressionFailedRef.current,
          async ({ folder, script }) => {
            mutateStats((current) => ({
              ...current,
              currentLabel: `${folder.name}/${script.name}`,
            }));

            try {
              await decompileMscScript({
                inputPath: script.path,
                outputPath: script.outputPath,
                logPath: script.logPath,
                mscFolderPath: folder.path,
              });
            } catch (error) {
              mutateStats((current) => ({
                ...current,
                failedScripts: current.failedScripts + 1,
              }));
              appendError(`${folder.name}/${script.name}: ${toErrorMessage(error)}`);
            } finally {
              mutateStats((current) => ({
                ...current,
                completedScripts: current.completedScripts + 1,
              }));
            }
          },
        );

        mutateStats((current) => ({
          ...current,
          completedFolders: cancelRequestedRef.current || watcherSuppressionFailedRef.current
            ? current.completedFolders
            : activePlan.folders.length,
        }));
      } else {
        await runLimitedConcurrency(
          activePlan.folders,
          concurrency,
          () => cancelRequestedRef.current || watcherSuppressionFailedRef.current,
          async (folder) => {
            mutateStats((current) => ({
              ...current,
              currentLabel: `${folder.name}: overlay`,
            }));

            const hasScript0 = folder.scripts.some((script) => script.index === 0);
            const hasScript2 = folder.scripts.some((script) => script.index === 2);
            const canResolveOverlay = hasScript0 && hasScript2;

            if (canResolveOverlay) {
              try {
                const result = await resolveMscActionOverlayForFolder(folder.path);
                mutateStats((current) => {
                  if (result.status === "resolved") {
                    return {
                      ...current,
                      resolvedOverlays: current.resolvedOverlays + 1,
                    };
                  }
                  if (result.status === "partial") {
                    return {
                      ...current,
                      partialOverlays: current.partialOverlays + 1,
                    };
                  }
                  return {
                    ...current,
                    skippedOverlays: current.skippedOverlays + 1,
                  };
                });
              } catch (error) {
                mutateStats((current) => ({
                  ...current,
                  failedOverlays: current.failedOverlays + 1,
                }));
                appendError(`${folder.name}/2.c resolve: ${toErrorMessage(error)}`);
              }
            } else if (!watcherSuppressionFailedRef.current) {
              mutateStats((current) => ({
                ...current,
                skippedOverlays: current.skippedOverlays + 1,
              }));
            }

            mutateStats((current) => ({
              ...current,
              completedFolders: current.completedFolders + 1,
            }));
          },
        );
      }

      mutateStats(
        (current) => ({
          ...current,
          currentLabel: null,
          completed: true,
          cancelled: cancelRequestedRef.current || watcherSuppressionFailedRef.current,
        }),
        true,
      );

      const finalStats = statsRef.current;
      if (!finalStats) return;
      if (finalStats.cancelled) {
        if (action === "decompile") {
          toast.warning(`Stopped after ${finalStats.completedScripts}/${activePlan.totalScripts} MSC script file(s)`);
        } else {
          toast.warning(`Stopped after ${finalStats.completedFolders}/${finalStats.totalFolders} folder(s)`);
        }
      } else if (action === "decompile" && finalStats.failedScripts > 0) {
        toast.warning(
          `Decompiled ${finalStats.completedScripts - finalStats.failedScripts}/${activePlan.totalScripts} MSC script file(s); ${finalStats.failedScripts} script error(s)`,
        );
      } else if (action === "overlay" && finalStats.failedOverlays > 0) {
        toast.warning(
          `Resolved ${finalStats.resolvedOverlays} folder(s), ${finalStats.partialOverlays} partial; ` +
          `${finalStats.failedOverlays} resolve error(s)`,
        );
      } else if (action === "decompile") {
        toast.success(`Decompiled ${activePlan.totalScripts} MSC script file(s)`);
      } else {
        toast.success(
          `Resolved ${finalStats.resolvedOverlays} folder(s); ` +
          `${finalStats.partialOverlays} partial; skipped ${finalStats.skippedOverlays} folder(s)`,
        );
      }
    } catch (error) {
      const message = toErrorMessage(error);
      appendError(message);
      mutateStats(
        (current) => ({
          ...current,
          currentLabel: null,
          completed: true,
          cancelled: true,
        }),
        true,
      );
      toast.error(message);
    } finally {
      if (watcherSuppressionTimer !== null) {
        window.clearInterval(watcherSuppressionTimer);
      }
      void suppressTestEditorWatcher(MSC_BATCH_WATCHER_FINAL_SUPPRESSION_MS).catch(() => undefined);
      setIsRunning(false);
      setRunningAction(null);
    }
  }, [appendError, concurrency, isRunning, mutateStats, plan, scanSource, sourcePath, sourceScope]);

  const handleStop = useCallback(() => {
    cancelRequestedRef.current = true;
    mutateStats((current) => ({ ...current, cancelled: true, currentLabel: "Stopping after active jobs finish" }), true);
  }, [mutateStats]);

  const handleOpenRoot = useCallback(async () => {
    const trimmedRoot = sourcePath.trim();
    if (!trimmedRoot) return;
    try {
      await openPath(trimmedRoot);
    } catch (error) {
      toast.error(`Failed to open folder: ${toErrorMessage(error)}`);
    }
  }, [sourcePath]);

  return (
    <div className="space-y-5">
      <section className="rounded-md border bg-muted/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="text-base font-semibold">Batch decompile MSC sources</div>
            <div className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Select the extracted 040msc folder or one MSC source folder, then run Decompile C first and Resolve Overlay when you want resolved callback names written back into 2.c.
              TestEditor file-tree watching is paused while this job writes outputs; use the tree refresh action after the run if you need the new files visible there.
            </div>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs font-medium">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <FileCode2 className="h-4 w-4 text-primary" />}
            {isRunning ? (runningAction === "overlay" ? "Resolving" : "Decompiling") : plan ? "Ready" : "Not scanned"}
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-md border p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="w-full space-y-1 lg:w-[180px]">
            <div className="text-sm font-semibold">Mode</div>
            <Select value={sourceScope} onValueChange={handleSourceScopeChange} disabled={isScanning || isRunning}>
              <SelectTrigger>
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="batch-root">Batch root</SelectItem>
                <SelectItem value="single-folder">Single folder</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="text-sm font-semibold">{sourceLabel}</div>
            <FilePathInput
              key={sourceScope}
              value={sourcePath}
              onChange={handleSourcePathChange}
              storeKey={activeStoreKey}
              placeholder={sourcePlaceholder}
              disabled={isScanning || isRunning}
              picker={{
                kind: "folder",
                multiple: false,
                title: sourcePickerTitle,
                defaultPath: sourceDefaultPath,
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleOpenRoot()}
            disabled={!sourcePath.trim()}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            Open
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void scanSource()}
            disabled={isScanning || isRunning || !sourcePath.trim()}
          >
            {isScanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Scan
          </Button>
        </div>
        {scanError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-all">{scanError}</span>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-md border p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Folders" value={plan?.folders.length ?? 0} tone="info" />
            <Metric label="Scripts" value={plan?.totalScripts ?? 0} tone="info" />
            <Metric
              label="Done"
              value={runStats ? (runStats.totalScripts > 0 ? runStats.completedScripts : runStats.completedFolders) : 0}
              tone="success"
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <Metric
              label="Errors"
              value={(runStats?.failedScripts ?? 0) + (runStats?.failedOverlays ?? 0)}
              tone={(runStats?.failedScripts ?? 0) + (runStats?.failedOverlays ?? 0) > 0 ? "danger" : "neutral"}
              icon={<XCircle className="h-4 w-4" />}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(concurrency)}
              onValueChange={(value) => setConcurrency(clampMscBatchConcurrency(Number.parseInt(value, 10)))}
              disabled={isRunning}
            >
              <SelectTrigger className="w-[132px]">
                <SelectValue placeholder="Workers" />
              </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 worker</SelectItem>
                  <SelectItem value="2">2 workers</SelectItem>
                  <SelectItem value="3">3 workers</SelectItem>
                  <SelectItem value="4">4 workers</SelectItem>
                  <SelectItem value="10">10 workers</SelectItem>
                  <SelectItem value="50">50 workers</SelectItem>
                </SelectContent>
              </Select>
            {isRunning ? (
              <Button type="button" variant="destructive" onClick={handleStop}>
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            ) : (
              <>
                <Button type="button" onClick={() => void handleRun("decompile")} disabled={isScanning || !sourcePath.trim()}>
                  <Play className="mr-2 h-4 w-4" />
                  Decompile C
                </Button>
                <Button type="button" variant="outline" onClick={() => void handleRun("overlay")} disabled={isScanning || !sourcePath.trim()}>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Resolve Overlay
                </Button>
              </>
            )}
          </div>
        </div>
        {runStats ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">
                {runStats.completed
                  ? runStats.cancelled
                    ? "Stopped"
                    : "Completed"
                  : isRunning
                    ? "Running"
                    : "Ready"}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {runStats.totalScripts > 0
                  ? `${runStats.completedScripts}/${runStats.totalScripts} scripts`
                  : `${runStats.completedFolders}/${runStats.totalFolders} folders`}
              </span>
            </div>
            <Progress value={progressPercent} />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Metric label="Resolve OK" value={runStats.resolvedOverlays} tone="success" icon={<Wand2 className="h-4 w-4" />} />
              <Metric label="Resolve partial" value={runStats.partialOverlays} tone={runStats.partialOverlays > 0 ? "warning" : "neutral"} />
              <Metric label="Resolve skipped" value={runStats.skippedOverlays} tone={runStats.skippedOverlays > 0 ? "warning" : "neutral"} />
              <Metric label="Resolve errors" value={runStats.failedOverlays} tone={runStats.failedOverlays > 0 ? "danger" : "neutral"} />
              <Metric label="Progress" value={`${progressPercent}%`} />
            </div>
            {runStats.currentLabel ? (
              <div className="break-all rounded border bg-muted/20 p-2 font-mono text-xs text-muted-foreground">
                {runStats.currentLabel}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {plan ? (
        <section className="space-y-3 rounded-md border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">Scan result</div>
            <div className="font-mono text-xs text-muted-foreground">
              {plan.totalScripts} script file(s), {plan.folders.length} folder(s)
            </div>
          </div>
          <div className="max-h-56 overflow-auto rounded-md border">
            {visibleFolders.map((folder) => (
              <div key={folder.path} className="grid gap-2 border-b px-3 py-2 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs text-foreground" title={folder.path}>
                    {folder.name}
                  </div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground" title={folder.path}>
                    {folder.path}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {folder.scripts.map((script) => (
                    <span key={script.path} className="rounded border bg-muted/20 px-1.5 py-0.5 font-mono text-[11px]">
                      {script.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {hiddenFolderCount > 0 ? (
            <div className="text-xs text-muted-foreground">Showing first {MAX_VISIBLE_FOLDERS} folder(s); {hiddenFolderCount} more are queued.</div>
          ) : null}
        </section>
      ) : null}

      {runStats?.errors.length ? (
        <section className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-destructive">Recent errors</div>
            <div className="flex items-center gap-2">
              <div className="font-mono text-xs text-muted-foreground">{runStats.errors.length}</div>
              <Button type="button" size="sm" variant="outline" onClick={() => void handleCopyErrors()}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copy all
              </Button>
            </div>
          </div>
          <div className="max-h-44 overflow-auto whitespace-pre-wrap rounded border bg-background/70 p-2 font-mono text-xs text-foreground">
            {runStats.errors.join("\n")}
          </div>
        </section>
      ) : null}
    </div>
  );
}
