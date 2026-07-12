import { useCallback, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { FileInput, FileOutput, FolderOutput, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import {
  exportNuanmbToCascadeurBridge,
  importCascadeurBridgeToNuanmb,
  type MotionConversionReport,
} from "../cascadeurBridgeService";
import { MayaSection } from "../MayaInspectorSection";

type CascadeurBridgePanelProps = {
  selectedNuanmbPath: string | null;
  skeletonPath: string | null;
  workspaceRoot: string | null;
  disabled: boolean;
  onImportedNuanmb: (path: string) => void;
};

function reportSummary(report: MotionConversionReport): string {
  return `${report.frameCount} frames, ${report.durationSeconds.toFixed(3)}s`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function CascadeurBridgePanel({
  selectedNuanmbPath,
  skeletonPath,
  workspaceRoot,
  disabled,
  onImportedNuanmb,
}: CascadeurBridgePanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MotionConversionReport | null>(null);
  const canExport = Boolean(selectedNuanmbPath && skeletonPath) && !busy && !disabled;
  const canImport = Boolean(skeletonPath) && !busy && !disabled;

  const exportBridge = useCallback(async () => {
    if (!selectedNuanmbPath || !skeletonPath) return;
    const outputDirectory = await open({
      title: "Choose Cascadeur bridge folder",
      directory: true,
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhCascadeurExportBridge, workspaceRoot),
    });
    if (typeof outputDirectory !== "string" || !outputDirectory.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const nextReport = await exportNuanmbToCascadeurBridge({
        nuanmbPath: selectedNuanmbPath,
        nusktbPath: skeletonPath,
        outputDirectory: outputDirectory.trim(),
        actionName: null,
      });
      rememberDialogSelection(DialogLastPathKey.ssbhCascadeurExportBridge, outputDirectory, "directory");
      setReport(nextReport);
      toast.success("Cascadeur bridge exported", { description: reportSummary(nextReport) });
    } catch (caughtError) {
      const message = errorMessage(caughtError);
      setError(message);
      toast.error("Cascadeur export failed", { description: message });
    } finally {
      setBusy(false);
    }
  }, [selectedNuanmbPath, skeletonPath, workspaceRoot]);

  const importBridge = useCallback(async () => {
    if (!skeletonPath) return;
    const fbxPath = await open({
      title: "Choose Cascadeur animation FBX",
      filters: [{ name: "FBX animation", extensions: ["fbx"] }],
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhCascadeurImportFbx, workspaceRoot),
    });
    if (typeof fbxPath !== "string" || !fbxPath.trim()) return;

    const manifestPath = await open({
      title: "Choose original Cascadeur bridge manifest",
      filters: [{ name: "Cascadeur bridge manifest", extensions: ["json"] }],
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhCascadeurImportManifest, fbxPath),
    });
    if (typeof manifestPath !== "string" || !manifestPath.trim()) return;

    const outputNuanmbPath = await save({
      title: "Save imported NUANMB",
      filters: [{ name: "NUANMB", extensions: ["nuanmb"] }],
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhCascadeurImportNuanmb, workspaceRoot),
    });
    if (typeof outputNuanmbPath !== "string" || !outputNuanmbPath.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const nextReport = await importCascadeurBridgeToNuanmb({
        fbxPath: fbxPath.trim(),
        bridgeManifestPath: manifestPath.trim(),
        nusktbPath: skeletonPath,
        outputNuanmbPath: outputNuanmbPath.trim(),
        animationStackName: null,
        templateNuanmbPath: selectedNuanmbPath,
        rigBindingPolicy: "exactHierarchy",
      });
      rememberDialogSelection(DialogLastPathKey.ssbhCascadeurImportFbx, fbxPath, "file");
      rememberDialogSelection(DialogLastPathKey.ssbhCascadeurImportManifest, manifestPath, "file");
      rememberDialogSelection(DialogLastPathKey.ssbhCascadeurImportNuanmb, outputNuanmbPath, "file");
      setReport(nextReport);
      onImportedNuanmb(nextReport.outputPath);
      toast.success("NUANMB imported from Cascadeur", { description: reportSummary(nextReport) });
    } catch (caughtError) {
      const message = errorMessage(caughtError);
      setError(message);
      toast.error("Cascadeur import failed", { description: message });
    } finally {
      setBusy(false);
    }
  }, [onImportedNuanmb, selectedNuanmbPath, skeletonPath, workspaceRoot]);

  return (
    <MayaSection title="Cascadeur bridge" icon={<FileOutput className="h-3.5 w-3.5 opacity-80" />} defaultOpen={false}>
      <div className="flex flex-col gap-2 text-[10px]">
        <p className="text-muted-foreground">
          Animation-only FBX. Export to Cascadeur, then import edited animation with its original bridge manifest.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 text-[10px]"
            disabled={!canExport}
            onClick={() => void exportBridge()}
          >
            {busy ? <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FolderOutput className="mr-1 h-3.5 w-3.5" />}
            Export bridge
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[10px]"
            disabled={!canImport}
            onClick={() => void importBridge()}
          >
            <FileInput className="mr-1 h-3.5 w-3.5" />
            Import bridge
          </Button>
        </div>
        {!skeletonPath ? (
          <p className="text-destructive">Active model has no NUSKTB. Bridge conversion is unavailable.</p>
        ) : null}
        {skeletonPath && !selectedNuanmbPath ? (
          <p className="text-muted-foreground">Select a NUANMB to export. Import can create transform-only motion.</p>
        ) : null}
        {error ? (
          <p role="alert" className="flex gap-1.5 text-destructive wrap-anywhere">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
        {report ? (
          <div className="rounded-sm border border-border/60 bg-muted/30 px-2 py-1.5">
            <div className="font-medium">{report.actionName}</div>
            <div className="font-mono text-muted-foreground">{reportSummary(report)}</div>
            {report.preservedNonTransformGroupCount > 0 ? (
              <div className="text-muted-foreground">Preserved groups: {report.preservedNonTransformGroupCount}</div>
            ) : null}
            <div className="font-mono text-muted-foreground wrap-anywhere">{report.outputPath}</div>
            {report.warnings.map((warning) => (
              <div key={warning} className="mt-1 text-amber-700 dark:text-amber-400 wrap-anywhere">
                {warning}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </MayaSection>
  );
}
