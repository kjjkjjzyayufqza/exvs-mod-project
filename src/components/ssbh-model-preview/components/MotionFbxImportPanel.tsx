import { useCallback, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { FileInput, Layers, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import {
  importMotionFbx,
  inspectMotionFbx,
  type MotionConversionReport,
  type MotionFbxInspectReport,
  type RigBindingPolicyValue,
} from "../motionFbxImportService";
import { MayaSection } from "../MayaInspectorSection";
import { MotionReportCard } from "./MotionReportCard";

type MotionFbxImportPanelProps = {
  skeletonPath: string | null;
  selectedNuanmbPath: string | null;
  workspaceRoot: string | null;
  disabled: boolean;
  onImported: (nuanmbPath: string) => void;
};

type PendingFbx = {
  fbxPath: string;
  inspect: MotionFbxInspectReport;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fileStem(path: string): string {
  const base = path.replace(/[/\\]+$/, "");
  const slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
  const file = slash >= 0 ? base.slice(slash + 1) : base;
  const dot = file.lastIndexOf(".");
  return (dot > 0 ? file.slice(0, dot) : file) || "motion";
}

function reportSummary(report: MotionConversionReport): string {
  return `${report.frameCount} frames, ${report.durationSeconds.toFixed(3)}s @ 60 FPS`;
}

export function MotionFbxImportPanel({
  skeletonPath,
  selectedNuanmbPath,
  workspaceRoot,
  disabled,
  onImported,
}: MotionFbxImportPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MotionConversionReport | null>(null);
  const [pending, setPending] = useState<PendingFbx | null>(null);
  const [stackName, setStackName] = useState<string | null>(null);
  const [preserveGroups, setPreserveGroups] = useState(true);
  const [policy, setPolicy] = useState<RigBindingPolicyValue>("exactHierarchy");

  const canImport = Boolean(skeletonPath) && !busy && !disabled;
  const needsStackChoice = pending !== null && pending.inspect.stacks.length > 1 && !stackName;

  const runImport = useCallback(
    async (fbxPath: string, chosenStack: string) => {
      if (!skeletonPath) return;
      const outputNuanmbPath = await save({
        title: "Save imported NUANMB",
        filters: [{ name: "NUANMB", extensions: ["nuanmb"] }],
        defaultPath: (() => {
          const dir = getDialogDefaultPath(DialogLastPathKey.ssbhMotionFbxImportSave, workspaceRoot);
          const name = `${chosenStack || fileStem(fbxPath)}.nuanmb`;
          if (!dir) return name;
          const sep = dir.includes("\\") ? "\\" : "/";
          return `${dir.replace(/[/\\]+$/, "")}${sep}${name}`;
        })(),
      });
      if (typeof outputNuanmbPath !== "string" || !outputNuanmbPath.trim()) return;

      setBusy(true);
      setError(null);
      try {
        const nextReport = await importMotionFbx({
          fbxPath,
          nusktbPath: skeletonPath,
          outputNuanmbPath: outputNuanmbPath.trim(),
          templateNuanmbPath: preserveGroups ? selectedNuanmbPath : null,
          animationStackName: chosenStack || null,
          rigBindingPolicy: policy,
        });
        rememberDialogSelection(DialogLastPathKey.ssbhMotionFbxImportSave, outputNuanmbPath, "file");
        setReport(nextReport);
        setPending(null);
        setStackName(null);
        toast.success("NUANMB imported", { description: reportSummary(nextReport) });
        onImported(nextReport.outputPath);
      } catch (caughtError) {
        const message = errorMessage(caughtError);
        setError(message);
        toast.error("Motion FBX import failed", { description: message });
      } finally {
        setBusy(false);
      }
    },
    [onImported, policy, preserveGroups, selectedNuanmbPath, skeletonPath, workspaceRoot],
  );

  const importFlow = useCallback(async () => {
    if (!skeletonPath) return;

    // Continue a pending multi-stack pick once a stack has been chosen.
    if (pending && pending.inspect.stacks.length > 1) {
      if (!stackName) return;
      await runImport(pending.fbxPath, stackName);
      return;
    }

    const picked = await open({
      title: "Choose motion FBX",
      multiple: false,
      filters: [{ name: "FBX", extensions: ["fbx"] }],
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhMotionFbxImportOpen, workspaceRoot),
    });
    if (typeof picked !== "string" || !picked.trim()) return;
    rememberDialogSelection(DialogLastPathKey.ssbhMotionFbxImportOpen, picked, "file");

    setBusy(true);
    setError(null);
    try {
      const inspect = await inspectMotionFbx(picked);
      if (inspect.stacks.length > 1) {
        setPending({ fbxPath: picked, inspect });
        setStackName(null);
        setBusy(false);
        return;
      }
      setBusy(false);
      await runImport(picked, inspect.stacks[0]?.name ?? "");
    } catch (caughtError) {
      const message = errorMessage(caughtError);
      setError(message);
      toast.error("Motion FBX import failed", { description: message });
      setBusy(false);
    }
  }, [pending, runImport, skeletonPath, stackName, workspaceRoot]);

  return (
    <MayaSection title="Motion FBX import" icon={<FileInput className="h-3.5 w-3.5 opacity-80" />} defaultOpen>
      <div className="flex flex-col gap-2 text-[10px]">
        <p className="text-muted-foreground">
          Bring a DCC-edited FBX back as a new NUANMB, validated against the active model&apos;s skeleton.
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 text-[10px]"
            disabled={!canImport || needsStackChoice}
            onClick={() => void importFlow()}
          >
            {busy ? (
              <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileInput className="mr-1 h-3.5 w-3.5" />
            )}
            {pending && stackName ? `Import "${stackName}"` : "Import FBX as NUANMB"}
          </Button>
        </div>
        {pending && pending.inspect.stacks.length > 1 ? (
          <div className="flex flex-col gap-1 rounded-sm border border-border/60 bg-muted/30 px-2 py-1.5">
            <span className="flex items-center gap-1 font-medium">
              <Layers className="h-3.5 w-3.5 opacity-80" />
              This FBX has multiple animation stacks. Choose one:
            </span>
            <div className="flex flex-wrap gap-1">
              {pending.inspect.stacks.map((stack) => (
                <Button
                  key={stack.name}
                  type="button"
                  size="sm"
                  variant={stackName === stack.name ? "default" : "outline"}
                  className="h-6 text-[10px]"
                  disabled={busy}
                  onClick={() => setStackName(stack.name)}
                >
                  {stack.name} ({stack.frameCount}f)
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="motion-fbx-import-preserve-groups"
            className="h-3 w-3 [&_svg]:h-2.5 [&_svg]:w-2.5"
            checked={preserveGroups}
            disabled={busy || disabled || !selectedNuanmbPath}
            onCheckedChange={(checked) => setPreserveGroups(checked === true)}
          />
          <Label
            htmlFor="motion-fbx-import-preserve-groups"
            className="text-[10px] font-normal text-muted-foreground"
          >
            Preserve groups from selected NUANMB (visibility/material)
          </Label>
        </div>
        {!selectedNuanmbPath ? (
          <p className="text-muted-foreground">
            No NUANMB selected: the import writes a transform-only clip.
          </p>
        ) : null}
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Bone matching</span>
          <Button
            type="button"
            size="sm"
            variant={policy === "exactHierarchy" ? "secondary" : "ghost"}
            className="h-6 text-[10px]"
            disabled={busy || disabled}
            onClick={() => setPolicy("exactHierarchy")}
          >
            Exact hierarchy
          </Button>
          <Button
            type="button"
            size="sm"
            variant={policy === "nameOnly" ? "secondary" : "ghost"}
            className="h-6 text-[10px]"
            disabled={busy || disabled}
            onClick={() => setPolicy("nameOnly")}
          >
            Name only
          </Button>
        </div>
        {!skeletonPath ? (
          <p className="text-destructive">Active model needs a NUSKTB to import motion.</p>
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
              reportSummary(report),
              `${report.matchedBones.length} bones matched, ${report.ignoredBones.length} ignored, ${report.preservedNonTransformGroupCount} groups preserved`,
              report.outputPath,
            ]}
            warnings={report.warnings}
          />
        ) : null}
      </div>
    </MayaSection>
  );
}
