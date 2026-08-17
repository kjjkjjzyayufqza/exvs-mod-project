import { useCallback, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { LoaderCircle, Scissors, Timer, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import {
  transformNuanmbClip,
  type ClipOperationPayload,
  type MotionConversionReport,
} from "../motionFbxImportService";
import { MayaSection } from "../MayaInspectorSection";
import { MotionReportCard } from "./MotionReportCard";

type MotionClipOpsPanelProps = {
  selectedNuanmbPath: string | null;
  skeletonPath: string | null;
  finalFrameIndex: number | null;
  workspaceRoot: string | null;
  disabled: boolean;
  onTransformed: (nuanmbPath: string) => void;
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

export function MotionClipOpsPanel({
  selectedNuanmbPath,
  skeletonPath,
  finalFrameIndex,
  workspaceRoot,
  disabled,
  onTransformed,
}: MotionClipOpsPanelProps) {
  const lastFrame = finalFrameIndex !== null ? Math.max(0, Math.floor(finalFrameIndex)) : 0;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MotionConversionReport | null>(null);
  const [startFrame, setStartFrame] = useState("0");
  const [endFrame, setEndFrame] = useState(String(lastFrame));
  const [speedFactor, setSpeedFactor] = useState("1.0");

  const canRun = Boolean(selectedNuanmbPath && skeletonPath) && !busy && !disabled;

  const runOperation = useCallback(
    async (operation: ClipOperationPayload, suffix: string) => {
      if (!selectedNuanmbPath || !skeletonPath) return;

      const fileName = `${nuanmbStem(selectedNuanmbPath)}${suffix}.nuanmb`;
      const dir = getDialogDefaultPath(DialogLastPathKey.ssbhMotionClipOpsSave, workspaceRoot);
      const sep = dir?.includes("\\") ? "\\" : "/";
      const outputNuanmbPath = await save({
        title: "Save transformed NUANMB",
        filters: [{ name: "NUANMB", extensions: ["nuanmb"] }],
        defaultPath: dir ? `${dir.replace(/[/\\]+$/, "")}${sep}${fileName}` : fileName,
      });
      if (typeof outputNuanmbPath !== "string" || !outputNuanmbPath.trim()) return;

      setBusy(true);
      setError(null);
      try {
        const nextReport = await transformNuanmbClip({
          nuanmbPath: selectedNuanmbPath,
          nusktbPath: skeletonPath,
          outputNuanmbPath: outputNuanmbPath.trim(),
          operation,
        });
        rememberDialogSelection(DialogLastPathKey.ssbhMotionClipOpsSave, outputNuanmbPath, "file");
        setReport(nextReport);
        toast.success("Clip written", {
          description: `${nextReport.frameCount} frames @ 60 FPS`,
        });
        onTransformed(nextReport.outputPath);
      } catch (caughtError) {
        const message = errorMessage(caughtError);
        setError(message);
        toast.error("Clip operation failed", { description: message });
      } finally {
        setBusy(false);
      }
    },
    [onTransformed, selectedNuanmbPath, skeletonPath, workspaceRoot],
  );

  const runTrim = useCallback(() => {
    const start = Number.parseInt(startFrame, 10);
    const end = Number.parseInt(endFrame, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end) {
      setError("Trim needs 0 <= start frame <= end frame.");
      return;
    }
    void runOperation({ kind: "trim", startFrame: start, endFrame: end }, "_trim");
  }, [endFrame, runOperation, startFrame]);

  const runRetime = useCallback(() => {
    const factor = Number.parseFloat(speedFactor);
    if (!Number.isFinite(factor) || factor <= 0) {
      setError("Speed factor must be a positive number.");
      return;
    }
    void runOperation(
      { kind: "retime", speedFactor: factor },
      `_x${String(factor).replace(".", "_")}`,
    );
  }, [runOperation, speedFactor]);

  return (
    <MayaSection title="Clip tools" icon={<Scissors className="h-3.5 w-3.5 opacity-80" />} defaultOpen={false}>
      <div className="flex flex-col gap-2 text-[10px]">
        <p className="text-muted-foreground">
          Write a trimmed or retimed copy of the selected NUANMB (transform-only, 60 FPS).
        </p>
        <div className="flex flex-wrap items-end gap-1.5">
          <div className="flex flex-col gap-1">
            <Label htmlFor="clip-ops-start-frame" className="text-[10px] text-muted-foreground">
              Start frame
            </Label>
            <Input
              id="clip-ops-start-frame"
              type="number"
              min={0}
              className="h-7 w-20 text-[10px]"
              value={startFrame}
              disabled={busy || disabled}
              onChange={(event) => setStartFrame(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="clip-ops-end-frame" className="text-[10px] text-muted-foreground">
              End frame
            </Label>
            <Input
              id="clip-ops-end-frame"
              type="number"
              min={0}
              className="h-7 w-20 text-[10px]"
              value={endFrame}
              disabled={busy || disabled}
              onChange={(event) => setEndFrame(event.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-7 text-[10px]"
            disabled={!canRun}
            onClick={runTrim}
          >
            {busy ? (
              <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Scissors className="mr-1 h-3.5 w-3.5" />
            )}
            Trim
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-1.5">
          <div className="flex flex-col gap-1">
            <Label htmlFor="clip-ops-speed" className="text-[10px] text-muted-foreground">
              Speed x
            </Label>
            <Input
              id="clip-ops-speed"
              type="number"
              min={0.1}
              step={0.1}
              className="h-7 w-20 text-[10px]"
              value={speedFactor}
              disabled={busy || disabled}
              onChange={(event) => setSpeedFactor(event.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-7 text-[10px]"
            disabled={!canRun}
            onClick={runRetime}
          >
            {busy ? (
              <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Timer className="mr-1 h-3.5 w-3.5" />
            )}
            Retime
          </Button>
        </div>
        {!selectedNuanmbPath ? (
          <p className="text-muted-foreground">Select a NUANMB to use clip tools.</p>
        ) : null}
        {error ? (
          <p role="alert" className="flex gap-1.5 text-destructive wrap-anywhere">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
        {report ? (
          <MotionReportCard
            title={report.actionName}
            rows={[
              `${report.frameCount} frames, ${report.durationSeconds.toFixed(3)}s @ 60 FPS`,
              report.outputPath,
            ]}
            warnings={report.warnings}
          />
        ) : null}
      </div>
    </MayaSection>
  );
}
