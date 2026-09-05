import { useCallback, useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { FileOutput, FolderSearch, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import {
  exportCompleteMotionFbx,
  getBlender51PathOverride,
  setBlender51PathOverride,
  type CompleteMotionFbxExportReport,
} from "../motionFbxExportService";
import { MayaSection } from "../MayaInspectorSection";
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
  const [blenderPath, setBlenderPath] = useState("");
  const canExport =
    Boolean(selectedNuanmbPath && skeletonPath && numdlbPath) && !busy && !disabled;

  useEffect(() => {
    setBlenderPath(getBlender51PathOverride() ?? "");
  }, []);

  const persistBlenderPath = useCallback((value: string) => {
    setBlenderPath(value);
    setBlender51PathOverride(value.trim() || null);
  }, []);

  const pickBlenderPath = useCallback(async () => {
    const picked = await open({
      title: t("fbxExport.chooseBlender"),
      multiple: false,
      filters: [{ name: "Blender", extensions: ["exe"] }],
      defaultPath: blenderPath || getDialogDefaultPath(DialogLastPathKey.ssbhBlender51Exe, undefined),
    });
    if (typeof picked !== "string" || !picked.trim()) return;
    persistBlenderPath(picked.trim());
    rememberDialogSelection(DialogLastPathKey.ssbhBlender51Exe, picked, "file");
  }, [blenderPath, persistBlenderPath, t]);

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
      const override = blenderPath.trim() || getBlender51PathOverride();
      const nextReport = await exportCompleteMotionFbx({
        nuanmbPath: selectedNuanmbPath,
        nusktbPath: skeletonPath,
        numdlbPath,
        outputFbxPath: outputFbxPath.trim(),
        blenderPath: override,
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
  }, [blenderPath, numdlbPath, selectedNuanmbPath, skeletonPath, t, workspaceRoot]);

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
        <details className="group">
          <summary className="cursor-pointer list-none rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <span className="select-none">{t("fbxExport.blenderPath")}</span>
          </summary>
          <div className="mt-1 flex gap-1">
            <Input
              className="h-7 text-[10px]"
              value={blenderPath}
              placeholder={t("fbxExport.autoDetect")}
              onChange={(event) => persistBlenderPath(event.target.value)}
              disabled={busy || disabled}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-[10px]"
              disabled={busy || disabled}
              onClick={() => void pickBlenderPath()}
            >
              <FolderSearch className="h-3.5 w-3.5" />
            </Button>
          </div>
        </details>
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
