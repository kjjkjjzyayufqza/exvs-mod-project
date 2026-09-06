import { useCallback, useMemo, useState } from "react";
import { FileInput, Layers, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FilePathInput } from "@/components/ui/filePathInput";
import { Label } from "@/components/ui/label";
import {
  importMotionFbx,
  inspectMotionFbx,
  type MotionConversionReport,
  type MotionFbxInspectReport,
  type RigBindingPolicyValue,
} from "../motionFbxImportService";
import { MayaSection } from "../MayaInspectorSection";
import { MotionReportCard } from "./MotionReportCard";

/**
 * Dedicated Tauri config keys for this panel only — never reuse preview / motion /
 * selected-clip path keys so FBX and output NUANMB stay independent.
 *
 * - storeKey: last full path shown in each input
 * - defaultPathKey: last directory for the file dialog (under dialogDefaultPath map)
 */
const STORE_KEY_SOURCE_FBX = "motionFbxImport.sourceFbxPath";
const STORE_KEY_OUTPUT_NUANMB = "motionFbxImport.outputNuanmbPath";
const DIALOG_DIR_SOURCE_FBX = "motionFbxImport.sourceFbxDir";
const DIALOG_DIR_OUTPUT_NUANMB = "motionFbxImport.outputNuanmbDir";

type MotionFbxImportPanelProps = {
  skeletonPath: string | null;
  selectedNuanmbPath: string | null;
  workspaceRoot: string | null;
  disabled: boolean;
  onImported: (nuanmbPath: string) => void;
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

function fileBasename(path: string): string {
  const base = path.replace(/[/\\]+$/, "");
  const slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"));
  return slash >= 0 ? base.slice(slash + 1) : base;
}

function ensureNuanmbExtension(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  return /\.nuanmb$/i.test(trimmed) ? trimmed : `${trimmed}.nuanmb`;
}

/** Normalize for path equality (Windows-insensitive). */
function normalizePathKey(path: string): string {
  return path.trim().replace(/\//g, "\\").toLowerCase();
}

function isAbsolutePath(path: string): boolean {
  const t = path.trim();
  return /^[a-zA-Z]:[\\/]/.test(t) || t.startsWith("\\\\") || t.startsWith("/");
}

/**
 * Output must not equal FBX or NUSKTB.
 * Template may equal output (overwrite selected motion after first import).
 */
function findOutputPathConflict(
  outputPath: string,
  inputs: { fbxPath: string; skeletonPath: string | null },
): string | null {
  const out = normalizePathKey(outputPath);
  if (!out) return null;
  if (inputs.fbxPath && out === normalizePathKey(inputs.fbxPath)) {
    return "source FBX";
  }
  if (inputs.skeletonPath && out === normalizePathKey(inputs.skeletonPath)) {
    return "skeleton (NUSKTB)";
  }
  return null;
}

export function MotionFbxImportPanel({
  skeletonPath,
  selectedNuanmbPath,
  workspaceRoot: _workspaceRoot,
  disabled,
  onImported,
}: MotionFbxImportPanelProps) {
  const { t } = useTranslation("ssbh-motion");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MotionConversionReport | null>(null);
  const [fbxPath, setFbxPath] = useState("");
  const [outputNuanmbPath, setOutputNuanmbPath] = useState("");
  const [inspect, setInspect] = useState<MotionFbxInspectReport | null>(null);
  const [stackName, setStackName] = useState<string | null>(null);
  const [preserveGroups, setPreserveGroups] = useState(true);
  const [omitAthHelperBones, setOmitAthHelperBones] = useState(true);
  const [policy, setPolicy] = useState<RigBindingPolicyValue>("exactHierarchy");

  const canImport =
    Boolean(skeletonPath) &&
    Boolean(fbxPath.trim()) &&
    Boolean(outputNuanmbPath.trim()) &&
    !busy &&
    !disabled;

  const needsStackChoice = Boolean(inspect && inspect.stacks.length > 1 && !stackName);

  /** Suggested *file name only* for the save dialog — from output field's own basename, else FBX stem. */
  const outputSaveFileName = useMemo(() => {
    const out = outputNuanmbPath.trim();
    if (out) {
      const base = fileBasename(ensureNuanmbExtension(out));
      if (base) return base;
    }
    if (fbxPath.trim()) return `${fileStem(fbxPath)}.nuanmb`;
    return "imported.nuanmb";
  }, [fbxPath, outputNuanmbPath]);

  const inspectFbx = useCallback(async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) {
      setInspect(null);
      setStackName(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await inspectMotionFbx(trimmed);
      setInspect(next);
      if (next.stacks.length === 1) {
        setStackName(next.stacks[0]?.name ?? null);
      } else {
        setStackName(null);
      }
      // Do not touch outputNuanmbPath — it has its own independent store/name.
    } catch (caughtError) {
      const message = errorMessage(caughtError);
      setInspect(null);
      setStackName(null);
      setError(message);
      toast.error(t("fbxImport.inspectFailed"), { description: message });
    } finally {
      setBusy(false);
    }
  }, [t]);

  const handleFbxPicked = useCallback(
    (value: string | string[]) => {
      const path = (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
      setFbxPath(path);
      void inspectFbx(path);
    },
    [inspectFbx],
  );

  const handleOutputPicked = useCallback((value: string | string[]) => {
    const path = (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
    setOutputNuanmbPath(ensureNuanmbExtension(path));
  }, []);

  const runImport = useCallback(async () => {
    if (!skeletonPath) return;
    const source = fbxPath.trim();
    const destination = ensureNuanmbExtension(outputNuanmbPath);
    if (!source || !destination) return;

    if (!isAbsolutePath(destination)) {
      setError(t("fbxImport.outputAbsolute"));
      toast.error(t("fbxImport.outputRequired"), {
        description: t("fbxImport.outputRequiredHint"),
      });
      return;
    }

    const templatePath = preserveGroups ? selectedNuanmbPath : null;
    const conflict = findOutputPathConflict(destination, {
      fbxPath: source,
      skeletonPath,
    });
    if (conflict) {
      const target =
        conflict === "source FBX" ? t("fbxImport.conflictSourceFbx") : t("fbxImport.conflictSkeleton");
      const message = t("fbxImport.outputSameAs", { target });
      setError(message);
      toast.error(t("fbxImport.invalidOutputPath"), { description: message });
      return;
    }
    // Template == output is allowed (re-import overwrites the selected clip).

    const chosenStack =
      stackName || (inspect?.stacks.length === 1 ? (inspect.stacks[0]?.name ?? "") : "");
    if (inspect && inspect.stacks.length > 1 && !chosenStack) {
      setError(t("fbxImport.chooseStackBeforeImport"));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (!inspect) {
        await inspectFbx(source);
      }
      const nextReport = await importMotionFbx({
        fbxPath: source,
        nusktbPath: skeletonPath,
        outputNuanmbPath: destination,
        templateNuanmbPath: templatePath,
        animationStackName: chosenStack || null,
        rigBindingPolicy: policy,
        omitAthHelperBones,
      });
      setReport(nextReport);
      // Keep output field as the path the user chose / writer returned (own name).
      setOutputNuanmbPath(nextReport.outputPath);
      toast.success(t("fbxImport.imported"), {
        description: t("fbxImport.summary", {
          frames: nextReport.frameCount,
          seconds: nextReport.durationSeconds.toFixed(3),
        }),
      });
      onImported(nextReport.outputPath);
    } catch (caughtError) {
      const message = errorMessage(caughtError);
      setError(message);
      toast.error(t("fbxImport.importFailed"), { description: message });
    } finally {
      setBusy(false);
    }
  }, [
    fbxPath,
    inspect,
    inspectFbx,
    onImported,
    outputNuanmbPath,
    omitAthHelperBones,
    policy,
    preserveGroups,
    selectedNuanmbPath,
    skeletonPath,
    stackName,
    t,
  ]);

  return (
    <MayaSection title={t("fbxImport.title")} icon={<FileInput className="h-3.5 w-3.5 opacity-80" />} defaultOpen>
      <div className="flex flex-col gap-2 text-[10px]">
        <p className="text-muted-foreground">
          {t("fbxImport.hint")}
        </p>

        <div className="space-y-1">
          <Label htmlFor="motion-fbx-import-source" className="text-[10px] text-muted-foreground">
            {t("fbxImport.sourceFbx")}
          </Label>
          <FilePathInput
            id="motion-fbx-import-source"
            className="h-8 cursor-pointer font-mono text-[10px]"
            placeholder={t("fbxImport.chooseFbxPlaceholder")}
            value={fbxPath}
            disabled={busy || disabled}
            storeKey={STORE_KEY_SOURCE_FBX}
            onChange={(e) => {
              const next = e.target.value;
              setFbxPath(next);
              if (next.trim().toLowerCase().endsWith(".fbx")) {
                void inspectFbx(next);
              }
            }}
            onPickedValue={handleFbxPicked}
            picker={{
              kind: "file",
              multiple: false,
              title: t("fbxImport.chooseMotionFbx"),
              filters: [{ name: "FBX", extensions: ["fbx"] }],
              defaultPathKey: DIALOG_DIR_SOURCE_FBX,
              // No defaultPath override — last FBX dir comes only from this field's config.
            }}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="motion-fbx-import-output" className="text-[10px] text-muted-foreground">
            {t("fbxImport.outputNuanmb")}
          </Label>
          <FilePathInput
            id="motion-fbx-import-output"
            className="h-8 cursor-pointer font-mono text-[10px]"
            placeholder={t("fbxImport.chooseOutputPlaceholder")}
            value={outputNuanmbPath}
            disabled={busy || disabled}
            storeKey={STORE_KEY_OUTPUT_NUANMB}
            onChange={(e) => setOutputNuanmbPath(e.target.value)}
            onPickedValue={handleOutputPicked}
            picker={{
              kind: "save",
              title: t("fbxImport.saveImported"),
              filters: [{ name: "NUANMB", extensions: ["nuanmb"] }],
              defaultPathKey: DIALOG_DIR_OUTPUT_NUANMB,
              defaultFileName: outputSaveFileName,
              // No workspaceRoot / selectedNuanmb mixing — only this field's last dir.
            }}
          />
        </div>

        {inspect && inspect.stacks.length > 1 ? (
          <div className="flex flex-col gap-1 rounded-sm border border-border/60 bg-muted/30 px-2 py-1.5">
            <span className="flex items-center gap-1 font-medium">
              <Layers className="h-3.5 w-3.5 opacity-80" />
              {t("fbxImport.chooseStackLabel")}
            </span>
            <div className="flex flex-wrap gap-1">
              {inspect.stacks.map((stack) => (
                <Button
                  key={stack.name}
                  type="button"
                  size="sm"
                  variant={stackName === stack.name ? "default" : "outline"}
                  className="h-6 text-[10px]"
                  disabled={busy}
                  onClick={() => setStackName(stack.name)}
                >
                  {t("fbxImport.stackFrames", { name: stack.name, count: stack.frameCount })}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 text-[10px]"
            disabled={!canImport || needsStackChoice}
            onClick={() => void runImport()}
          >
            {busy ? (
              <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileInput className="mr-1 h-3.5 w-3.5" />
            )}
            {t("fbxImport.importButton")}
          </Button>
        </div>

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
            {t("fbxImport.preserveGroups")}
          </Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Checkbox
            id="motion-fbx-import-omit-ath"
            className="h-3 w-3 [&_svg]:h-2.5 [&_svg]:w-2.5"
            checked={omitAthHelperBones}
            disabled={busy || disabled}
            onCheckedChange={(checked) => setOmitAthHelperBones(checked === true)}
          />
          <Label
            htmlFor="motion-fbx-import-omit-ath"
            className="text-[10px] font-normal text-muted-foreground"
          >
            {t("fbxImport.omitAthHelperBones")}
          </Label>
        </div>
        {!selectedNuanmbPath ? (
          <p className="text-muted-foreground">
            {t("fbxImport.noTemplate")}
          </p>
        ) : (
          <p className="text-muted-foreground wrap-anywhere">
            {t("fbxImport.templateReadonly")}{" "}
            <span className="font-mono" data-i18n-ignore="">
              {selectedNuanmbPath}
            </span>
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{t("fbxImport.boneMatching")}</span>
          <Button
            type="button"
            size="sm"
            variant={policy === "exactHierarchy" ? "secondary" : "ghost"}
            className="h-6 text-[10px]"
            disabled={busy || disabled}
            onClick={() => setPolicy("exactHierarchy")}
          >
            {t("fbxImport.exactHierarchy")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={policy === "nameOnly" ? "secondary" : "ghost"}
            className="h-6 text-[10px]"
            disabled={busy || disabled}
            onClick={() => setPolicy("nameOnly")}
          >
            {t("fbxImport.nameOnly")}
          </Button>
        </div>
        {!skeletonPath ? (
          <p className="text-destructive">{t("fbxImport.needsNusktb")}</p>
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
              t("fbxImport.summary", {
                frames: report.frameCount,
                seconds: report.durationSeconds.toFixed(3),
              }),
              t("fbxImport.matchSummary", {
                matched: report.matchedBones.length,
                ignored: report.ignoredBones.length,
                groups: report.preservedNonTransformGroupCount,
              }),
              report.outputPath,
            ]}
            warnings={report.warnings}
          />
        ) : null}
      </div>
    </MayaSection>
  );
}
