import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, RefreshCw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDaeSsbhSessionStore } from "../store/daeSsbhSessionStore";
import { DialogLastPathKey, getDialogDefaultPath, rememberDialogSelection } from "@/utils/dialogLastPath";
import { useSsbhModelPreview } from "../SsbhModelPreviewContext";
import { ssbhAnalyzeDae, ssbhAnalyzeFbx, ssbhConvertDaeToSsbh, ssbhConvertFbxToSsbh } from "../ssbhDaeIoService";
import { useStableMissingTextureFillSlots } from "../hooks/useStableMissingTextureFillSlots";
import { useNumatbTextureReferenceValidation } from "../hooks/useNumatbTextureReferenceValidation";
import {
  applyTexturePathFillToProfiles,
  collectDeclaredTexturePathSlotRefsForExportSession,
  collectMissingTexturePathSlotRefsForExportSession,
  collectMissingTexturePathsForExportSession,
  collectTexturePathSlotRefsForExportSession,
  missingTexturePathSlotKey,
} from "../store/numatbTemplateStoreHelpers";
import { NumdlbMaterialMappingEditor } from "./NumdlbMaterialMappingEditor";
import { NumatbTemplateEditor } from "./NumatbTemplateEditor";
import { MissingTexturePathFillPanel } from "./MissingTexturePathFillPanel";

export function DaeSsbhSessionLayout() {
  const { t } = useTranslation("ssbh-motion");
  const preview = useSsbhModelPreview();
  const session = useDaeSsbhSessionStore();
  const loadTemplateLibrary = useDaeSsbhSessionStore((state) => state.loadTemplateLibrary);
  const [busy, setBusy] = useState<"analyze" | "convert" | null>(null);

  useEffect(() => {
    void loadTemplateLibrary();
  }, [loadTemplateLibrary]);

  const selectedGeometrySet = useMemo(() => new Set(session.includeGeometryNames), [session.includeGeometryNames]);

  const updateProfileAttribute = useDaeSsbhSessionStore((state) => state.updateProfileAttribute);
  const addProfileAttribute = useDaeSsbhSessionStore((state) => state.addProfileAttribute);

  const currentTextureSlots = useMemo(
    () =>
      collectTexturePathSlotRefsForExportSession(session.mayaFile, session.nustFile, {
        writeNumatb: session.writeNumatb,
        writeMayaProfile: session.writeMayaProfile,
      }),
    [session.mayaFile, session.nustFile, session.writeNumatb, session.writeMayaProfile],
  );

  const liveMissingTextureSlots = useMemo(
    () =>
      collectMissingTexturePathSlotRefsForExportSession(session.mayaFile, session.nustFile, {
        writeNumatb: session.writeNumatb,
        writeMayaProfile: session.writeMayaProfile,
      }),
    [session.mayaFile, session.nustFile, session.writeNumatb, session.writeMayaProfile],
  );
  const declaredTextureSlots = useMemo(
    () =>
      collectDeclaredTexturePathSlotRefsForExportSession(
        session.mayaFile,
        session.nustFile,
        {
          writeNumatb: session.writeNumatb,
          writeMayaProfile: session.writeMayaProfile,
        },
      ),
    [session.mayaFile, session.nustFile, session.writeNumatb, session.writeMayaProfile],
  );
  // Texture references resolve against the package's shared nutexb pool at
  // `<workspaceRoot>/textures/`. The write output dir is now a per-model
  // `models/<name>` folder that has no textures, so validate against the
  // workspace (package) root instead, falling back to the output dir.
  const textureValidationStageRoot = preview.workspaceRoot ?? session.outputDir;
  const textureReferenceValidation = useNumatbTextureReferenceValidation({
    enabled: Boolean(session.sourcePath && textureValidationStageRoot),
    sourcePath: session.sourcePath,
    stageRoot: textureValidationStageRoot,
    slots: declaredTextureSlots,
  });
  const textureReferenceIssueMessages = useMemo(
    () =>
      new Map(
        textureReferenceValidation.issues.map((issue) => [
          missingTexturePathSlotKey(issue.slot),
          issue.message,
        ]),
      ),
    [textureReferenceValidation.issues],
  );

  const fillTextureSlots = useStableMissingTextureFillSlots(
    `${session.sourcePath ?? ""}\u0000${session.numatbProfileReplacementRevision}`,
    session.mayaFile,
    session.nustFile,
    currentTextureSlots,
    liveMissingTextureSlots,
  );

  const missingTexturePaths = useMemo(
    () => collectMissingTexturePathsForExportSession(session.mayaFile, session.nustFile, {
      writeNumatb: session.writeNumatb,
      writeMayaProfile: session.writeMayaProfile,
    }),
    [session.mayaFile, session.nustFile, session.writeNumatb, session.writeMayaProfile, session.numdlbEntries],
  );

  const baseExportReady =
    !!session.sourcePath &&
    !!session.analysis &&
    session.analysis.canConvert &&
    !!session.outputBaseName.trim() &&
    !!session.outputDir?.trim() &&
    session.includeGeometryNames.length > 0 &&
    session.numdlbEntries.every((row) => row.materialLabel.trim()) &&
    (!session.writeNumdlb || (session.writeNumshb && session.writeNusktb));

  const canExport =
    baseExportReady &&
    missingTexturePaths.length === 0 &&
    !textureReferenceValidation.validating &&
    textureReferenceValidation.issues.length === 0 &&
    !textureReferenceValidation.error;

  const reAnalyze = async () => {
    if (!session.sourcePath) return;
    setBusy("analyze");
    try {
      const analysis =
        session.importKind === "dae"
          ? await ssbhAnalyzeDae(session.sourcePath)
          : await ssbhAnalyzeFbx(session.sourcePath);
      session.loadAnalysis(analysis);
      toast.success(t("daeSession.analysisRefreshed"));
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(null);
    }
  };

  const convert = async () => {
    if (!session.sourcePath || !session.outputDir) return;
    try {
      if (missingTexturePaths.length > 0) {
        throw new Error(
          t("daeSession.fillTexturePaths", { paths: missingTexturePaths.join("\n") }),
        );
      }
      if (textureReferenceValidation.validating) {
        throw new Error(t("daeSession.stillValidating"));
      }
      if (textureReferenceValidation.error) {
        throw new Error(
          t("daeSession.textureValidationFailed", { error: textureReferenceValidation.error }),
        );
      }
      if (textureReferenceValidation.issues.length > 0) {
        throw new Error(
          t("daeSession.unresolvedRefs", {
            details: textureReferenceValidation.issues
              .map((issue) => `${issue.slot.profile}: ${issue.slot.materialLabel} -> ${issue.slot.paramId}: ${issue.slot.value}`)
              .join("\n"),
          }),
        );
      }
      setBusy("convert");
      const params = {
        outputDir: session.outputDir,
        baseFilename: session.outputBaseName.trim(),
        scaleFactor: Number(session.scaleFactorText),
        flipUv: session.flipUv,
        upAxis: session.upAxis,
        includeGeometryNames: session.includeGeometryNames,
        writeLog: session.writeLog,
        writeNumdlb: session.writeNumdlb,
        writeNumshb: session.writeNumshb,
        writeNusktb: session.writeNusktb,
        writeNumatb: session.writeNumatb,
        writeMayaProfile: session.writeMayaProfile,
        numdlbEntries: session.numdlbEntries,
        mayaFile: session.writeNumatb ? session.mayaFile : null,
        nustFile: session.writeNumatb ? session.nustFile : null,
      };
      const result =
        session.importKind === "dae"
          ? await ssbhConvertDaeToSsbh({ daePath: session.sourcePath, ...params })
          : await ssbhConvertFbxToSsbh({ fbxPath: session.sourcePath, ...params });
      session.setLastResult(result);
      const nustMatPath = result.files.nustNumatbPath ?? result.files.numatbPath;
      const lines = [
        result.files.numdlbPath ? `numdlb: ${result.files.numdlbPath}` : null,
        result.files.numshbPath ? `numshb: ${result.files.numshbPath}` : null,
        result.files.nusktbPath ? `nusktb: ${result.files.nusktbPath}` : null,
        nustMatPath ? `__nust__.numatb: ${nustMatPath}` : null,
        result.files.mayaNumatbPath ? `__maya__.numatb: ${result.files.mayaNumatbPath}` : null,
      ].filter(Boolean);
      toast.success(t("daeSession.converted"), { description: lines.join("\n") });
      if (result.files.numdlbPath && preview.autoLoadAfterConvertToSsbh) {
        const workspaceRoot = preview.workspaceRoot?.trim() ?? null;
        const hasDiskPackage =
          workspaceRoot &&
          preview.previewInstances.some((inst) => inst.bundle.sourceKind === "disk");
        if (hasDiskPackage) {
          // Reload the open Unit model package so new/changed on-disk models appear
          // without closing the modal or manually refreshing the viewport.
          try {
            await preview.reloadCurrentModel();
          } catch {
            await preview.loadModelAt(workspaceRoot);
          }
        } else if (workspaceRoot) {
          await preview.loadModelAt(workspaceRoot);
        } else {
          await preview.addModelAt(result.files.numdlbPath);
        }
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(null);
    }
  };

  if (!session.analysis) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("daeSession.sourceSummary")}</p>
          <p className="font-mono text-[11px]" data-i18n-ignore="">{session.sourcePath}</p>
          <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
            <span>{t("daeSession.geometries", { count: session.analysis.geometryNames.length })}</span>
            <span>{t("daeSession.bones", { count: session.analysis.boneCount })}</span>
            <span>{t("daeSession.upAxisValue", { axis: session.analysis.upAxis })}</span>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] uppercase tracking-wide" disabled={busy !== null} onClick={() => void reAnalyze()}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${busy === "analyze" ? "animate-spin" : ""}`} />
          {t("daeSession.reanalyze")}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("daeSession.outputNaming")}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label className="text-[11px] text-muted-foreground">{t("daeSession.baseFilename")}</Label>
              <Input value={session.outputBaseName} onChange={(event) => session.setOutputBaseName(event.target.value)} className="h-8 text-[11px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">{t("daeSession.scale")}</Label>
              <Input value={session.scaleFactorText} onChange={(event) => session.setScaleFactorText(event.target.value)} className="h-8 text-[11px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">{t("daeSession.upAxis")}</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11px]"
                value={session.upAxis}
                onChange={(event) => session.setUpAxis(event.target.value as "y_up" | "z_up" | "none")}
              >
                <option value="y_up">{t("daeSession.yUp")}</option>
                <option value="z_up">{t("daeSession.zUp")}</option>
                <option value="none">{t("daeSession.none")}</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] text-muted-foreground">{t("daeSession.outputDirectory")}</Label>
            <div className="flex gap-2">
              <Input value={session.outputDir ?? ""} onChange={(event) => session.setOutputDir(event.target.value)} className="h-8 text-[11px]" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[10px] uppercase tracking-wide"
                onClick={() => {
                  void (async () => {
                    const selected = await open({
                      directory: true,
                      multiple: false,
                      title: t("daeSession.pickOutputDir"),
                      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhDaeConvertOutputFolder, preview.workspaceRoot),
                    });
                    if (typeof selected !== "string" || !selected.trim()) return;
                    rememberDialogSelection(DialogLastPathKey.ssbhDaeConvertOutputFolder, selected.trim(), "directory");
                    session.setOutputDir(selected.trim());
                  })();
                }}
              >
                <FolderOpen className="mr-1 h-3.5 w-3.5" />
                {t("daeSession.browse")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] text-muted-foreground">{t("daeSession.includeGeometries")}</Label>
            <ScrollArea className="h-[180px] rounded-md border">
              <div className="space-y-1 p-3">
                {session.analysis.geometryNames.map((geometryName) => (
                  <label key={geometryName} className="flex items-center gap-2 text-[11px]">
                    <Checkbox
                      checked={selectedGeometrySet.has(geometryName)}
                      onCheckedChange={(checked) => session.setGeometryEnabled(geometryName, checked === true)}
                    />
                    <span className="font-mono" data-i18n-ignore="">{geometryName}</span>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="space-y-3 rounded-md border p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("daeSession.outputFiles")}</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox checked={session.writeNumdlb} onCheckedChange={(checked) => session.setWriteNumdlb(checked === true)} />
              <span>.numdlb</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox checked={session.writeNumshb} onCheckedChange={(checked) => session.setWriteNumshb(checked === true)} />
              <span>.numshb</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox checked={session.writeNusktb} onCheckedChange={(checked) => session.setWriteNusktb(checked === true)} />
              <span>.nusktb</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox checked={session.writeNumatb} onCheckedChange={(checked) => session.setWriteNumatb(checked === true)} />
              <span>{t("daeSession.nustProfile")}</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox checked={session.writeMayaProfile} onCheckedChange={(checked) => session.setWriteMayaProfile(checked === true)} />
              <span>{t("daeSession.mayaProfile")}</span>
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <Checkbox checked={session.writeLog} onCheckedChange={(checked) => session.setWriteLog(checked === true)} />
              <span>{t("daeSession.writeLog")}</span>
            </label>
          </div>

        </div>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("daeSession.numdlbMapping")}</p>
        <NumdlbMaterialMappingEditor
          rows={session.numdlbEntries}
          onChangeMeshObjectName={session.setMeshObjectName}
          onChangeMaterialLabel={session.setMaterialLabel}
          onReplaceAll={session.replaceAllMaterialLabels}
          onRemoveRow={session.removeNumdlbEntry}
        />
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("daeSession.numatbProfiles")}</p>
        <NumatbTemplateEditor />
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("daeSession.confirmExport")}</p>
        <Button type="button" className="h-9 w-full text-[10px] uppercase tracking-wide" disabled={!canExport || busy !== null} onClick={() => void convert()}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {busy === "convert" ? t("daeSession.converting") : t("daeSession.convert")}
        </Button>
        {!baseExportReady ? (
          <p className="text-[11px] text-muted-foreground">
            {t("daeSession.exportRequirements")}
          </p>
        ) : null}
        {fillTextureSlots.length > 0 ? (
          <MissingTexturePathFillPanel
            slots={fillTextureSlots}
            title={t("daeSession.texture1Required")}
            onFillSlot={(slot, basename) => {
              applyTexturePathFillToProfiles(
                updateProfileAttribute,
                addProfileAttribute,
                () => {
                  const state = useDaeSsbhSessionStore.getState();
                  return { mayaFile: state.mayaFile, nustFile: state.nustFile };
                },
                slot,
                basename,
              );
            }}
          />
        ) : null}
        {textureReferenceValidation.validating ? (
          <p className="text-[11px] text-muted-foreground">
            {t("daeSession.checkingTextures")}
          </p>
        ) : null}
        {textureReferenceValidation.error ? (
          <p className="text-[11px] text-destructive">
            {t("daeSession.textureValidationFailed", { error: textureReferenceValidation.error })}
          </p>
        ) : null}
        <MissingTexturePathFillPanel
          slots={textureReferenceValidation.issues.map((issue) => issue.slot)}
          title={t("daeSession.fixTextureRefs")}
          getSlotMessage={(slot) =>
            textureReferenceIssueMessages.get(missingTexturePathSlotKey(slot)) ?? null
          }
          onFillSlot={(slot, basename) => {
            applyTexturePathFillToProfiles(
              updateProfileAttribute,
              addProfileAttribute,
              () => {
                const state = useDaeSsbhSessionStore.getState();
                return { mayaFile: state.mayaFile, nustFile: state.nustFile };
              },
              slot,
              basename,
            );
          }}
        />
      </div>
    </div>
  );
}
