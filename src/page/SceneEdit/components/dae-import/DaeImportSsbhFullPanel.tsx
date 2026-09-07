import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDaeSsbhSessionStore } from "@/components/ssbh-model-preview/store/daeSsbhSessionStore";
import type { SsbhDaeAnalysisReport } from "@/components/ssbh-model-preview/ssbhDaeIoService";
import { NumdlbMaterialMappingEditor } from "@/components/ssbh-model-preview/components/NumdlbMaterialMappingEditor";
import { NumatbTemplateEditor } from "@/components/ssbh-model-preview/components/NumatbTemplateEditor";
import { MissingTexturePathFillPanel } from "@/components/ssbh-model-preview/components/MissingTexturePathFillPanel";
import {
  buildNumatbClipboardExportPayload,
  copyNumatbProfilesJsonToClipboard,
} from "@/components/ssbh-model-preview/copyNumatbProfilesJson";
import { useStableMissingTextureFillSlots } from "@/components/ssbh-model-preview/hooks/useStableMissingTextureFillSlots";
import type { NumatbTextureReferenceIssue } from "@/components/ssbh-model-preview/hooks/useNumatbTextureReferenceValidation";
import {
  applyTexturePathFillToProfiles,
  collectMissingTexturePathSlotRefsForExportSession,
  collectTexturePathSlotRefsForExportSession,
  missingTexturePathSlotKey,
} from "@/components/ssbh-model-preview/store/numatbTemplateStoreHelpers";
import { detectStaticMeshImportFormat } from "./daeImportDefaults";
import type { DaeAnalysisResult } from "./daeImportTypes";
import { DaeImportPanelSection } from "./daeImportUi";

interface DaeImportSsbhFullPanelProps {
  analysis: DaeAnalysisResult | null;
  sourcePath: string;
  stageRoot: string | null;
  textureReferenceIssues?: NumatbTextureReferenceIssue[];
  textureReferenceValidationError?: string | null;
  textureReferencesValidating?: boolean;
  directToDisk?: boolean;
  batchCount?: number;
  unitModelMode?: boolean;
  replaceNumshbMode?: boolean;
  replaceFullMode?: boolean;
}

export function DaeImportSsbhFullPanel({
  analysis,
  sourcePath,
  stageRoot,
  textureReferenceIssues = [],
  textureReferenceValidationError = null,
  textureReferencesValidating = false,
  directToDisk = false,
  batchCount = 1,
  unitModelMode = false,
  replaceNumshbMode = false,
  replaceFullMode = false,
}: DaeImportSsbhFullPanelProps) {
  const { t } = useTranslation("scene-dae-full");
  const setSourcePath = useDaeSsbhSessionStore((state) => state.setSourcePath);
  const loadAnalysis = useDaeSsbhSessionStore((state) => state.loadAnalysis);
  const loadTemplateLibrary = useDaeSsbhSessionStore((state) => state.loadTemplateLibrary);
  const session = useDaeSsbhSessionStore();

  const loadedAnalysisKeyRef = useRef<string | null>(null);

  useEffect(() => {
    void loadTemplateLibrary();
  }, [loadTemplateLibrary]);

  useEffect(() => {
    if (!unitModelMode && !replaceNumshbMode) return;
    const state = useDaeSsbhSessionStore.getState();
    state.setWriteNumdlb(true);
    state.setWriteNumshb(true);
    state.setWriteNusktb(true);
    state.setWriteNumatb(true);
    state.setWriteMayaProfile(true);
    const fileName = sourcePath.split(/[/\\]/).pop() ?? "";
    if (detectStaticMeshImportFormat(fileName) === "fbx") {
      state.setImportKind("fbx");
      state.setFlipUv(true);
    }
  }, [sourcePath, unitModelMode, replaceNumshbMode]);

  useEffect(() => {
    if (!analysis?.canConvert) {
      loadedAnalysisKeyRef.current = null;
      return;
    }

    const analysisKey = `${sourcePath}\u0000${analysis.geometryNames.join("\u0001")}`;
    if (loadedAnalysisKeyRef.current === analysisKey) {
      return;
    }

    loadedAnalysisKeyRef.current = analysisKey;
    setSourcePath(sourcePath);
    loadAnalysis(analysis as unknown as SsbhDaeAnalysisReport, { resetMaterialProfiles: true });
  }, [analysis, sourcePath, loadAnalysis, setSourcePath]);

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

  const fillTextureResetKey = useMemo(
    () =>
      `${sourcePath}\u0000${analysis?.geometryNames?.join("\u0001") ?? ""}\u0000${session.numatbProfileReplacementRevision}`,
    [sourcePath, analysis, session.numatbProfileReplacementRevision],
  );

  const fillTextureSlots = useStableMissingTextureFillSlots(
    fillTextureResetKey,
    session.mayaFile,
    session.nustFile,
    currentTextureSlots,
    liveMissingTextureSlots,
  );
  const textureReferenceIssueMessages = useMemo(
    () =>
      new Map(
        textureReferenceIssues.map((issue) => [
          missingTexturePathSlotKey(issue.slot),
          issue.message,
        ]),
      ),
    [textureReferenceIssues],
  );

  const handleCopyNumatbProfilesJson = useCallback(async () => {
    await copyNumatbProfilesJsonToClipboard(
      buildNumatbClipboardExportPayload({
        mirrorTexturePathsAcrossProfiles: session.mirrorTexturePathsAcrossProfiles,
        mayaProfile: session.mayaFile,
        nustProfile: session.nustFile,
        numdlbMaterialMappings: session.numdlbEntries,
        exportOptions: {
          writeMayaProfile: session.writeMayaProfile,
          writeNumatb: session.writeNumatb,
        },
      }),
    );
  }, [
    session.mayaFile,
    session.mirrorTexturePathsAcrossProfiles,
    session.nustFile,
    session.numdlbEntries,
    session.writeMayaProfile,
    session.writeNumatb,
  ]);

  if (!analysis || !analysis.canConvert) {
    return (
      <div className="p-4 text-[11px] text-muted-foreground">
        {t("analysis.waiting")}
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <DaeImportPanelSection title={t("output.title")}>
        <p className="text-[11px] text-muted-foreground">
          {replaceNumshbMode
            ? t("output.replaceNumshb")
            : replaceFullMode
            ? t("output.replaceFull")
            : unitModelMode
            ? t("output.unitModel", { stageRoot: stageRoot ? ` (${stageRoot})` : "" })
            : directToDisk
            ? batchCount > 1
              ? t("output.batchDirect", { count: batchCount })
              : t("output.direct")
            : t("output.memory", { stageRoot: stageRoot ? ` (${stageRoot})` : "" })}
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {batchCount > 1 ? (
            <p className="md:col-span-2 text-[11px] text-muted-foreground">
              {t("output.batchFolderName")}
            </p>
          ) : (
            <div className="space-y-1 md:col-span-2">
              <Label className="text-[11px] text-muted-foreground">{t("output.modelFolderName")}</Label>
              <Input
                value={session.outputBaseName}
                onChange={(e) => session.setOutputBaseName(e.target.value)}
                className="h-8 text-[11px]"
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">{t("output.scale")}</Label>
              <Input
                value={session.scaleFactorText}
                onChange={(e) => session.setScaleFactorText(e.target.value)}
                className="h-8 text-[11px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">{t("output.upAxis")}</Label>
              <select
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-[11px]"
                value={session.upAxis}
                onChange={(e) => session.setUpAxis(e.target.value as "y_up" | "z_up" | "none")}
              >
                <option value="y_up">{t("output.yUp")}</option>
                <option value="z_up">{t("output.zUp")}</option>
                <option value="none">{t("output.none")}</option>
              </select>
            </div>
          </div>
          <label className="md:col-span-2 flex cursor-pointer items-start gap-2 rounded-md border border-dashed px-3 py-2 text-[11px]">
            <Checkbox
              checked={session.flipUv}
              onCheckedChange={(checked) => session.setFlipUv(checked === true)}
            />
            <span className="space-y-0.5">
              <span className="block font-medium text-foreground">{t("output.flipUv")}</span>
              <span className="block text-[10px] text-muted-foreground">
                {t("output.flipUvHelp")}
              </span>
            </span>
          </label>
        </div>
      </DaeImportPanelSection>

      <DaeImportPanelSection
        title={t("geometry.title", { selected: session.includeGeometryNames.length, total: analysis.geometryNames.length })}
      >
        <ScrollArea className="max-h-[120px]">
          <div className="space-y-1">
            {analysis.geometryNames.map((name) => (
              <label key={name} className="flex cursor-pointer items-center gap-2 text-[11px]">
                <Checkbox
                  checked={selectedGeometrySet.has(name)}
                  onCheckedChange={(checked) => session.setGeometryEnabled(name, checked === true)}
                />
                <span className="font-mono">{name}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </DaeImportPanelSection>

      <DaeImportPanelSection title={t("files.title")}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-[11px]">
            <Checkbox
              checked={session.writeNumdlb}
              disabled={unitModelMode || replaceNumshbMode}
              onCheckedChange={(c) => session.setWriteNumdlb(c === true)}
            />
            .numdlb
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px]">
            <Checkbox
              checked={session.writeNumshb}
              disabled={unitModelMode || replaceNumshbMode}
              onCheckedChange={(c) => session.setWriteNumshb(c === true)}
            />
            .numshb
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px]">
            <Checkbox
              checked={session.writeNusktb}
              disabled={unitModelMode || replaceNumshbMode}
              onCheckedChange={(c) => session.setWriteNusktb(c === true)}
            />
            .nusktb
            {replaceNumshbMode ? (
              <span className="text-[10px] text-muted-foreground">
                {t("files.nusktbTemp")}
              </span>
            ) : null}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px]">
            <Checkbox
              checked={session.writeNumatb}
              disabled={unitModelMode || replaceNumshbMode}
              onCheckedChange={(c) => session.setWriteNumatb(c === true)}
            />
            <span data-i18n-ignore="">__nust__.numatb</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px]">
            <Checkbox
              checked={session.writeMayaProfile}
              disabled={unitModelMode || replaceNumshbMode}
              onCheckedChange={(c) => session.setWriteMayaProfile(c === true)}
            />
            <span data-i18n-ignore="">__maya__.numatb</span>
          </label>
          {unitModelMode && !replaceNumshbMode ? (
            <label className="flex cursor-pointer items-center gap-2 text-[11px]">
              <Checkbox checked disabled />
              .jnttbl
            </label>
          ) : replaceNumshbMode ? (
            <p className="col-span-2 text-[10px] text-muted-foreground">
              {t("files.replaceNote")}
            </p>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 text-[11px]">
              <Checkbox
                checked={session.writeLog}
                onCheckedChange={(c) => session.setWriteLog(c === true)}
              />
              {t("files.writeLog")}
            </label>
          )}
        </div>
      </DaeImportPanelSection>

      <DaeImportPanelSection title={t("mapping.title")}>
        <NumdlbMaterialMappingEditor
          rows={session.numdlbEntries}
          onChangeMeshObjectName={session.setMeshObjectName}
          onChangeMaterialLabel={session.setMaterialLabel}
          onReplaceAll={session.replaceAllMaterialLabels}
          onRemoveRow={session.removeNumdlbEntry}
          embedTableWithoutInnerScroll
        />
      </DaeImportPanelSection>

      <DaeImportPanelSection
        title={t("profiles.title")}
        headerEnd={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            title={t("profiles.copyTitle")}
            aria-label={t("profiles.copyLabel")}
            onClick={() => void handleCopyNumatbProfilesJson()}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        }
      >
        <NumatbTemplateEditor />
      </DaeImportPanelSection>

      <MissingTexturePathFillPanel
        slots={fillTextureSlots}
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
      {textureReferencesValidating ? (
        <p className="text-[11px] text-muted-foreground">
          {t("validation.checking")}
        </p>
      ) : null}
      {textureReferenceValidationError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-[11px] text-destructive">
            {t("validation.failed", { error: textureReferenceValidationError })}
          </p>
        </div>
      ) : null}
      <MissingTexturePathFillPanel
        slots={textureReferenceIssues.map((issue) => issue.slot)}
        title={t("validation.fixTitle")}
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
  );
}
