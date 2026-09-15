import { useCallback, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { FileOutput, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import {
  exportCompleteMotionFbx,
  getBlender51PathOverride,
  type CompleteMotionFbxExportReport,
} from "../motionFbxExportService";
import { MayaSection } from "../MayaInspectorSection";
import { BlenderExecutablePathField } from "./BlenderExecutablePathField";
import { MotionReportCard } from "./MotionReportCard";

type MotionFbxExportPanelProps = {
  selectedNuanmbPath: string | null;
  skeletonPath: string | null;
  numdlbPath: string | null;
  workspaceRoot: string | null;
  disabled: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nuanmbStemFbxName(nuanmbPath: string): string {
  const base = nuanmbPath.replace(/[/\\]+$/, "");
  const slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
  const file = slash >= 0 ? base.slice(slash + 1) : base;
  const stem = file.toLowerCase().endsWith(".nuanmb") ? file.slice(0, -".nuanmb".length) : file;
  return `${stem || "motion"}.fbx`;
}

function defaultSavePath(nuanmbPath: string, workspaceRoot: string | null): string | undefined {
  const fileName = nuanmbStemFbxName(nuanmbPath);
  const fromDialog = getDialogDefaultPath(DialogLastPathKey.ssbhMotionFbxExport, workspaceRoot);
  if (fromDialog) {
    const sep = fromDialog.includes("\\") ? "\\" : "/";
    const dir = fromDialog.replace(/[/\\]+$/, "");
    // If last path was a file, parent may already be stored by remember; join name when looks like dir
    if (dir.toLowerCase().endsWith(".fbx")) {
      const parentSlash = Math.max(dir.lastIndexOf("/"), dir.lastIndexOf("\\"));
      const parent = parentSlash >= 0 ? dir.slice(0, parentSlash) : dir;
      return `${parent}${sep}${fileName}`;
    }
    return `${dir}${sep}${fileName}`;
  }
  if (workspaceRoot) {
    const sep = workspaceRoot.includes("\\") ? "\\" : "/";
    return `${workspaceRoot.replace(/[/\\]+$/, "")}${sep}${fileName}`;
  }
  return fileName;
}

export function MotionFbxExportPanel({
  selectedNuanmbPath,
  skeletonPath,
  numdlbPath,
  workspaceRoot,
  disabled,
}: MotionFbxExportPanelProps) {
  const { t } = useTranslation("ssbh-motion");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CompleteMotionFbxExportReport | null>(null);
  const canExport =
    Boolean(selectedNuanmbPath && skeletonPath && numdlbPath) && !busy && !disabled;

  const exportMotionFbx = useCallback(async () => {
    if (!selectedNuanmbPath || !skeletonPath || !numdlbPath) return;

    const outputFbxPath = await save({
      title: t("fbxExport.saveFbx"),
      filters: [{ name: "FBX", extensions: ["fbx"] }],
      defaultPath: defaultSavePath(selectedNuanmbPath, workspaceRoot),
    });
    if (typeof outputFbxPath !== "string" || !outputFbxPath.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const nextReport = await exportCompleteMotionFbx({
        nuanmbPath: selectedNuanmbPath,
        nusktbPath: skeletonPath,
        numdlbPath,
        outputFbxPath: outputFbxPath.trim(),
        blenderPath: getBlender51PathOverride(),
        actionName: null,
      });
      rememberDialogSelection(DialogLastPathKey.ssbhMotionFbxExport, outputFbxPath, "file");
      setReport(nextReport);
      toast.success(t("fbxExport.exported"), {
        description: t("fbxExport.summary", {
          frames: nextReport.frameCount,
          seconds: nextReport.durationSeconds.toFixed(3),
        }),
      });
    } catch (caughtError) {
      const message = errorMessage(caughtError);
      setError(message);
      toast.error(t("fbxExport.failed"), { description: message });
    } finally {
      setBusy(false);
    }
  }, [numdlbPath, selectedNuanmbPath, skeletonPath, t, workspaceRoot]);

  return (
    <MayaSection title={t("fbxExport.title")} icon={<FileOutput className="h-3.5 w-3.5 opacity-80" />} defaultOpen>
      <div className="flex flex-col gap-2 text-[10px]">
        <p className="text-muted-foreground">
          {t("fbxExport.hint")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 text-[10px]"
            disabled={!canExport}
            onClick={() => void exportMotionFbx()}
          >
            {busy ? (
              <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileOutput className="mr-1 h-3.5 w-3.5" />
            )}
            {t("fbxExport.exportComplete")}
          </Button>
        </div>
        <BlenderExecutablePathField disabled={busy || disabled} />
        {!numdlbPath || !skeletonPath ? (
          <p className="text-destructive">{t("fbxExport.needsFiles")}</p>
        ) : null}
        {numdlbPath && skeletonPath && !selectedNuanmbPath ? (
          <p className="text-muted-foreground">{t("fbxExport.selectNuanmb")}</p>
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
              t("fbxExport.summary", {
                frames: report.frameCount,
                seconds: report.durationSeconds.toFixed(3),
              }),
              report.outputPath,
              t("fbxExport.blenderRow", { path: report.blenderPath }),
            ]}
            warnings={report.warnings}
          />
        ) : null}
      </div>
    </MayaSection>
  );
}
