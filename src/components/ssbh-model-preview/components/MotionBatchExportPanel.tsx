import { useCallback, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOutput, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import { exportCompleteMotionFbx, getBlender51PathOverride } from "../motionFbxExportService";
import { MayaSection } from "../MayaInspectorSection";
import { MotionReportCard } from "./MotionReportCard";

type MotionBatchExportPanelProps = {
  nuanmbPaths: readonly string[];
  skeletonPath: string | null;
  numdlbPath: string | null;
  workspaceRoot: string | null;
  disabled: boolean;
};

type BatchResult = {
  path: string;
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

export function MotionBatchExportPanel({
  nuanmbPaths,
  skeletonPath,
  numdlbPath,
  workspaceRoot,
  disabled,
}: MotionBatchExportPanelProps) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [abortedOnBlender, setAbortedOnBlender] = useState(false);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());

  const targets = useMemo(
    () => nuanmbPaths.filter((path) => !excluded.has(path)),
    [excluded, nuanmbPaths],
  );
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

  const selectAll = useCallback(() => setExcluded(new Set()), []);
  const selectNone = useCallback(
    () => setExcluded(new Set(nuanmbPaths)),
    [nuanmbPaths],
  );

  const runBatch = useCallback(async () => {
    if (!skeletonPath || !numdlbPath || targets.length === 0) return;
    const outputDir = await open({
      title: "Choose batch export folder",
      directory: true,
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhMotionBatchExportDir, workspaceRoot),
    });
    if (typeof outputDir !== "string" || !outputDir.trim()) return;
    rememberDialogSelection(DialogLastPathKey.ssbhMotionBatchExportDir, outputDir, "directory");

    const sep = outputDir.includes("\\") ? "\\" : "/";
    const dir = outputDir.replace(/[/\\]+$/, "");
    const collected: BatchResult[] = [];
    setRunning(true);
    setResults([]);
    setAbortedOnBlender(false);
    try {
      for (const [index, nuanmbPath] of targets.entries()) {
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
          collected.push({ path: nuanmbPath, error: null });
        } catch (caughtError) {
          const message = errorMessage(caughtError);
          collected.push({ path: nuanmbPath, error: message });
          if (/blender/i.test(message)) {
            // The same executable serves every clip: a resolve failure would
            // fail the whole batch identically, so stop immediately.
            setAbortedOnBlender(true);
            break;
          }
        }
      }
    } finally {
      const failed = collected.filter((result) => result.error !== null).length;
      const exported = collected.length - failed;
      setResults(collected);
      setProgress(null);
      setRunning(false);
      if (failed === 0 && exported > 0) {
        toast.success("Batch export finished", { description: `${exported} clips exported` });
      } else if (failed > 0) {
        toast.error("Batch export finished with failures", {
          description: `${exported} exported, ${failed} failed`,
        });
      }
    }
  }, [numdlbPath, skeletonPath, targets, workspaceRoot]);

  const failedResults = results.filter((result) => result.error !== null);
  const exportedCount = results.length - failedResults.length;

  return (
    <MayaSection
      title="Batch motion FBX export"
      icon={<FolderOutput className="h-3.5 w-3.5 opacity-80" />}
      defaultOpen={false}
    >
      <div className="flex flex-col gap-2 text-[10px]">
        <p className="text-muted-foreground">
          Export every selected NUANMB as its own CompleteMotionFbx into one folder.
        </p>
        <div className="flex items-center gap-1.5">
          <span className="tabular-nums text-muted-foreground">
            {targets.length}/{nuanmbPaths.length} selected
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[10px]"
            disabled={running || disabled || targets.length === nuanmbPaths.length}
            onClick={selectAll}
          >
            All
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[10px]"
            disabled={running || disabled || targets.length === 0}
            onClick={selectNone}
          >
            None
          </Button>
        </div>
        <div className="flex max-h-40 flex-col overflow-y-auto rounded-sm border border-border/40 px-1 py-1">
          {nuanmbPaths.map((path) => {
            const stem = nuanmbStem(path);
            const id = `batch-export-${stem}`;
            return (
              <div
                key={path}
                className="flex items-center gap-1.5 rounded-sm px-1 py-0.5 transition-colors hover:bg-muted/30"
              >
                <Checkbox
                  id={id}
                  className="h-3 w-3 [&_svg]:h-2.5 [&_svg]:w-2.5"
                  checked={!excluded.has(path)}
                  disabled={running || disabled}
                  onCheckedChange={() => toggleExcluded(path)}
                />
                <Label
                  htmlFor={id}
                  className="w-full cursor-pointer truncate text-[10px] font-normal"
                  title={stem}
                >
                  {stem}
                </Label>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 text-[10px]"
            disabled={!canRun}
            onClick={() => void runBatch()}
          >
            {running ? (
              <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderOutput className="mr-1 h-3.5 w-3.5" />
            )}
            Export all to folder ({targets.length})
          </Button>
        </div>
        {progress ? (
          <div className="flex flex-col gap-1">
            <Progress
              className="h-1"
              value={(progress.done / Math.max(1, progress.total)) * 100}
            />
            <span className="font-mono text-muted-foreground">
              {progress.done + 1}/{progress.total}: {progress.current}
            </span>
          </div>
        ) : null}
        {abortedOnBlender ? (
          <p role="alert" className="flex gap-1.5 text-destructive wrap-anywhere">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Blender 5.1 failed to resolve; the remaining clips were skipped.</span>
          </p>
        ) : null}
        {results.length > 0 ? (
          <MotionReportCard title={`${exportedCount} exported, ${failedResults.length} failed`}>
            {failedResults.map((result) => (
              <div key={result.path} className="mt-1 text-destructive wrap-anywhere">
                {nuanmbStem(result.path)}: {result.error}
              </div>
            ))}
          </MotionReportCard>
        ) : null}
      </div>
    </MayaSection>
  );
}
