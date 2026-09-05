import { useCallback, useEffect, useMemo, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  Boxes,
  Download,
  Eye,
  FileUp,
  Layers3,
  Loader2,
  Replace,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { HktSimplifyConfig, SsbhDaeUpAxis } from "../dae-import/daeImportTypes";
import { DaeImportHktSimplifyFields } from "../dae-import/DaeImportHktSimplifyFields";
import {
  buildImportConfigForHktPreview,
  formatTriangleCount,
  HIGH_PRECISION_HKT_SIMPLIFY,
} from "../../utils/hktSimplifyUtils";
import {
  createHktOnlySsbhConfig,
  DEFAULT_HKT_COLLISION_SCALE,
  DEFAULT_HKT_COLLISION_UP_AXIS,
} from "../../utils/hktCollisionTransformUtils";
import { HktCollisionTransformFields } from "./HktCollisionTransformFields";
import {
  sceneApplyReplacementHktBytes,
  sceneExportHktCollisionReviewObjPath,
  sceneGenerateReplacementHktFromDaePath,
  scenePreviewHktCollisionMeshPath,
  type HktCollisionDisplayStage,
  type HktCollisionMeshGeometry,
  type HktCollisionPreviewStage,
  type ImportConfig,
} from "../../utils/sceneSessionService";
import { HktCollisionPreviewCanvas } from "./HktCollisionPreviewCanvas";
import {
  getStoredDialogDefaultPath,
  rememberStoredDialogFilePath,
} from "@/utils/dialogDefaultPathStore";
import { SCENE_GENERATE_HKT_FROM_MODEL_DIALOG_PATH_KEY } from "../../utils/sceneEditorSettings";
import {
  buildHktFromModelConfigKey,
  isCachedHktFromModelValid,
  type CachedHktFromModelGeneration,
} from "./generateHktFromModelCache";
import { resolveHktFromModelPreviewGeometry } from "../../utils/hktPreviewGeometry";

interface GenerateHktFromModelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
  /** Resolved replace target id (already mapped to `folder/map_hit.hkt` for sub-models). */
  targetImportId: string | null;
  targetName: string;
  /** Invoked after a successful generate + replace so the scene can refresh HKT data. */
  onReplaced: (targetImportId: string) => void | Promise<void>;
}

const GENERATE_HKT_FROM_MODEL_MODAL_DIMENSIONS = {
  width: 1040,
  height: 820,
  minWidth: 760,
  minHeight: 560,
};

function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

const PREVIEW_STAGE_OPTIONS: HktCollisionDisplayStage[] = [
  "merged",
  "hktInput",
  "decodedHkt",
];

function defaultReviewObjPath(sourcePath: string): string {
  const lastSlash = Math.max(sourcePath.lastIndexOf("/"), sourcePath.lastIndexOf("\\"));
  const lastDot = sourcePath.lastIndexOf(".");
  if (lastDot > lastSlash) {
    return `${sourcePath.slice(0, lastDot)}_hkt_input_review.obj`;
  }
  return `${sourcePath}_hkt_input_review.obj`;
}

export function GenerateHktFromModelDialog({
  open: isOpen,
  onOpenChange,
  sessionId,
  targetImportId,
  targetName,
  onReplaced,
}: GenerateHktFromModelDialogProps) {
  const { t } = useTranslation("scene-dae-hkt");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [collisionScale, setCollisionScale] = useState(DEFAULT_HKT_COLLISION_SCALE);
  const [collisionUpAxis, setCollisionUpAxis] = useState<SsbhDaeUpAxis>(
    DEFAULT_HKT_COLLISION_UP_AXIS,
  );
  const [simplify, setSimplify] = useState<HktSimplifyConfig>({
    ...HIGH_PRECISION_HKT_SIMPLIFY,
  });
  const [previewStage, setPreviewStage] = useState<HktCollisionDisplayStage>("hktInput");
  const [meshPreview, setMeshPreview] = useState<HktCollisionMeshGeometry | null>(null);
  const [cachedHkt, setCachedHkt] = useState<CachedHktFromModelGeneration | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [hktGenerating, setHktGenerating] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewUsesPreHavokMesh, setPreviewUsesPreHavokMesh] = useState(false);
  const [applying, setApplying] = useState(false);
  const [objExporting, setObjExporting] = useState(false);

  const sourceName = useMemo(() => (sourcePath ? fileNameFromPath(sourcePath) : null), [sourcePath]);

  const importConfig: ImportConfig = useMemo(
    () =>
      buildImportConfigForHktPreview({
        generateHkt: true,
        convertToSsbh: false,
        ssbhConfig: createHktOnlySsbhConfig({
          scaleFactor: collisionScale,
          upAxis: collisionUpAxis,
        }),
        hktSimplify: simplify,
      }),
    [simplify, collisionScale, collisionUpAxis],
  );

  const previewConfigKey = useMemo(
    () => buildHktFromModelConfigKey(importConfig, simplify),
    [importConfig, simplify],
  );

  const hasValidCachedHkt = isCachedHktFromModelValid(cachedHkt, sourcePath, previewConfigKey);

  // Reset preview state when the window opens; restore last model path from config.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    void (async () => {
      const lastSourcePath = await getStoredDialogDefaultPath(
        SCENE_GENERATE_HKT_FROM_MODEL_DIALOG_PATH_KEY,
      );
      if (!cancelled) {
        setSourcePath(lastSourcePath ?? null);
      }
    })();

    setCollisionScale(DEFAULT_HKT_COLLISION_SCALE);
    setCollisionUpAxis(DEFAULT_HKT_COLLISION_UP_AXIS);
    setSimplify({ ...HIGH_PRECISION_HKT_SIMPLIFY });
    setPreviewStage("hktInput");
    setMeshPreview(null);
    setCachedHkt(null);
    setPreviewError(null);
    setPreviewUsesPreHavokMesh(false);
    setPreviewLoading(false);
    setHktGenerating(false);
    setApplying(false);
    setObjExporting(false);

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const invalidatePreviewArtifacts = useCallback(() => {
    setMeshPreview(null);
    setCachedHkt(null);
    setPreviewError(null);
    setPreviewUsesPreHavokMesh(false);
  }, []);

  const handleSimplifyChange = useCallback(
    (next: HktSimplifyConfig) => {
      setSimplify(next);
      invalidatePreviewArtifacts();
    },
    [invalidatePreviewArtifacts],
  );

  const handleCollisionTransformChange = useCallback(
    (scaleFactor: number, upAxis: SsbhDaeUpAxis) => {
      setCollisionScale(scaleFactor);
      setCollisionUpAxis(upAxis);
      invalidatePreviewArtifacts();
    },
    [invalidatePreviewArtifacts],
  );

  const handlePreviewStageChange = useCallback(
    (stage: HktCollisionDisplayStage) => {
      setPreviewStage(stage);
      setMeshPreview(null);
      setPreviewError(null);
      setPreviewUsesPreHavokMesh(false);
    },
    [],
  );

  const runPreview = useCallback(async () => {
    if (!sourcePath || !sourceName) return;
    const configKey = buildHktFromModelConfigKey(importConfig, simplify);
    const needsDecodedHkt = previewStage === "decodedHkt";
    setPreviewLoading(true);
    setHktGenerating(true);
    setPreviewError(null);
    setMeshPreview(null);
    setCachedHkt(null);
    try {
      const meshStage = needsDecodedHkt ? "hktInput" : (previewStage as HktCollisionPreviewStage);
      const [meshStats, hktPayload] = await Promise.all([
        scenePreviewHktCollisionMeshPath(sourcePath, sourceName, importConfig, meshStage),
        sceneGenerateReplacementHktFromDaePath(sourcePath, sourceName, importConfig),
      ]);

      setCachedHkt({
        sourcePath,
        configKey,
        hktBytes: hktPayload.hktBytes,
        hktXml: hktPayload.hktXml,
        triangleCount: hktPayload.triangleCount,
      });

      if (needsDecodedHkt) {
        const { geometry: previewGeometry, usesPreHavokMesh } =
          resolveHktFromModelPreviewGeometry(meshStats, hktPayload);

        setPreviewUsesPreHavokMesh(usesPreHavokMesh);
        setMeshPreview(
          usesPreHavokMesh
            ? { ...previewGeometry, stage: "hktInput" }
            : { ...previewGeometry, stage: "decodedHkt" },
        );
      } else {
        setPreviewUsesPreHavokMesh(false);
        setMeshPreview(meshStats);
      }
    } catch (err) {
      setMeshPreview(null);
      setCachedHkt(null);
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoading(false);
      setHktGenerating(false);
    }
  }, [sourcePath, sourceName, importConfig, simplify, previewStage]);

  const pickFile = async () => {
    try {
      const selected = await open({
        title: t("generateFromModel.selectFile"),
        filters: [{ name: "Model", extensions: ["dae", "fbx"] }],
        multiple: false,
        defaultPath: await getStoredDialogDefaultPath(SCENE_GENERATE_HKT_FROM_MODEL_DIALOG_PATH_KEY),
      });
      const next = typeof selected === "string" ? selected : Array.isArray(selected) ? selected[0] : null;
      if (!next) return;
      await rememberStoredDialogFilePath(SCENE_GENERATE_HKT_FROM_MODEL_DIALOG_PATH_KEY, next);
      setSourcePath(next);
      invalidatePreviewArtifacts();
    } catch (err) {
      toast.error(t("generateFromModel.openPickerFailed"), { description: String(err) });
    }
  };

  const exportHktInputObj = useCallback(async () => {
    if (!sourcePath || !sourceName) return;
    try {
      const outputPath = await save({
        title: t("generateFromModel.exportReviewObj"),
        defaultPath: defaultReviewObjPath(sourcePath),
        filters: [{ name: "Wavefront OBJ", extensions: ["obj"] }],
      });
      if (!outputPath) return;

      setObjExporting(true);
      toast.loading(t("generateFromModel.exportingToast"), { id: "hkt-input-review-obj" });
      const result = await sceneExportHktCollisionReviewObjPath({
        filePath: sourcePath,
        sourceName,
        config: importConfig,
        stage: "hktInput",
        outputPath,
      });
      toast.success(t("generateFromModel.objExported"), {
        id: "hkt-input-review-obj",
        description: t("generateFromModel.objExportedDetail", {
          triangles: formatTriangleCount(result.triangleCount),
          path: result.outputPath,
        }),
      });
    } catch (err) {
      toast.error(t("generateFromModel.exportObjFailed"), {
        id: "hkt-input-review-obj",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setObjExporting(false);
    }
  }, [sourcePath, sourceName, importConfig, t]);

  const canApply =
    Boolean(sessionId && targetImportId && sourcePath && sourceName) &&
    !previewLoading &&
    !hktGenerating &&
    !applying &&
    !objExporting;

  const handleApply = async () => {
    if (!sessionId || !targetImportId || !sourcePath || !sourceName) return;

    setApplying(true);
    try {
      let hktBytes: number[];
      let hktXml: string;
      const usedCachedPreview = isCachedHktFromModelValid(
        cachedHkt,
        sourcePath,
        previewConfigKey,
      );

      if (usedCachedPreview) {
        toast.loading(t("generateFromModel.applyingPreviewed", { name: sourceName }), { id: "hkt-from-model" });
        hktBytes = cachedHkt.hktBytes;
        hktXml = cachedHkt.hktXml;
      } else {
        toast.loading(t("generateFromModel.generatingFrom", { name: sourceName }), { id: "hkt-from-model" });
        setHktGenerating(true);
        const payload = await sceneGenerateReplacementHktFromDaePath(
          sourcePath,
          sourceName,
          importConfig,
        );
        hktBytes = payload.hktBytes;
        hktXml = payload.hktXml;
        setCachedHkt({
          sourcePath,
          configKey: previewConfigKey,
          hktBytes: payload.hktBytes,
          hktXml: payload.hktXml,
          triangleCount: payload.triangleCount,
        });
      }

      await sceneApplyReplacementHktBytes(
        sessionId,
        targetImportId,
        hktBytes,
        sourceName,
        hktXml,
      );
      await onReplaced(targetImportId);
      toast.success(t("generateFromModel.replacedFor", { name: targetName }), {
        id: "hkt-from-model",
        description: usedCachedPreview
          ? t("generateFromModel.appliedPreviewed", { name: sourceName })
          : t("generateFromModel.generatedApplied", { name: sourceName }),
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(t("generateFromModel.generateFailed"), {
        id: "hkt-from-model",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setApplying(false);
      setHktGenerating(false);
    }
  };

  const applyButtonLabel = applying
    ? hktGenerating
      ? t("generateFromModel.generatingHkt")
      : t("generateFromModel.applyingHkt")
    : t("generateFromModel.generateReplace");

  if (!isOpen) return null;

  return (
    <AppRndModalShell
      titleId="generate-hkt-from-model-title"
      title={t("generateFromModel.title")}
      subtitle={t("generateFromModel.subtitle", { name: targetName })}
      headerIcon={<Sparkles className="h-5 w-5 text-emerald-400" />}
      dimensions={GENERATE_HKT_FROM_MODEL_MODAL_DIMENSIONS}
      storageKey="app.rnd-size.generate-hkt-from-model"
      onClose={() => {
        if (!applying && !objExporting) {
          onOpenChange(false);
        }
      }}
      closeDisabled={applying || objExporting}
      footer={
        <div className="flex flex-wrap items-center gap-2 bg-background px-5 py-3 sm:justify-between">
          <p className="flex min-w-0 flex-1 basis-full items-start gap-1.5 text-pretty text-[11px] leading-snug text-muted-foreground break-words sm:basis-auto">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {t("generateFromModel.footerHint")}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
              {t("generateFromModel.cancel")}
            </Button>
            <Button
              onClick={() => void handleApply()}
              disabled={!canApply}
              className={cn("transition-transform active:translate-y-px")}
            >
              {applying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Replace className="mr-2 h-4 w-4" />
              )}
              {applyButtonLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <p className="shrink-0 border-b border-border/60 px-5 py-3 text-xs text-muted-foreground">
          {t("generateFromModel.intro", { name: targetName })}
        </p>
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          {/* Controls */}
          <ScrollArea className="min-h-0 min-w-0 border-b border-border/60 lg:max-h-none lg:border-b-0 lg:border-r">
            <div className="min-w-0 space-y-4 p-4">
              <section className="min-w-0 overflow-hidden rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Replace className="h-3.5 w-3.5" />
                  {t("generateFromModel.replaceTarget")}
                </div>
                <p className="mt-1.5 break-all text-sm font-medium" data-i18n-ignore="">
                  {targetName}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t("generateFromModel.overwriteHint")}
                </p>
              </section>

              <section className="min-w-0 space-y-2 overflow-hidden">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("generateFromModel.sourceModel")}
                </div>
                <Button
                  type="button"
                  variant={sourcePath ? "secondary" : "default"}
                  className="w-full justify-start"
                  onClick={() => void pickFile()}
                  disabled={applying}
                >
                  <FileUp className="mr-2 h-4 w-4" />
                  {sourcePath ? t("generateFromModel.chooseDifferent") : t("generateFromModel.chooseFile")}
                </Button>
                {sourcePath ? (
                  <p className="break-all rounded-md bg-muted/30 px-2 py-1.5 font-mono text-[11px] text-muted-foreground" data-i18n-ignore="">
                    {sourcePath}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {t("generateFromModel.geometryOnly")}
                  </p>
                )}
              </section>

              {sourcePath ? (
                <>
                  <HktCollisionTransformFields
                    compact
                    disabled={applying}
                    value={{ scaleFactor: collisionScale, upAxis: collisionUpAxis }}
                    onChange={({ scaleFactor, upAxis }) =>
                      handleCollisionTransformChange(scaleFactor, upAxis)
                    }
                  />
                  <DaeImportHktSimplifyFields
                    value={simplify}
                    onChange={handleSimplifyChange}
                    importConfig={importConfig}
                    sourcePath={sourcePath}
                    sourceName={sourceName ?? undefined}
                    autoPreview={false}
                    compact
                  />
                  <section className="min-w-0 space-y-2 overflow-hidden">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Layers3 className="h-3.5 w-3.5" />
                      {t("generateFromModel.reviewStage")}
                    </div>
                    <div className="grid min-w-0 grid-cols-3 gap-1 rounded-lg border border-border/60 bg-muted/20 p-1">
                      {PREVIEW_STAGE_OPTIONS.map((stage) => {
                        const active = previewStage === stage;
                        return (
                          <button
                            key={stage}
                            type="button"
                            aria-pressed={active}
                            onClick={() => handlePreviewStageChange(stage)}
                            disabled={previewLoading || hktGenerating || applying || objExporting}
                            className={cn(
                              "flex min-h-[50px] min-w-0 flex-col items-center justify-center rounded-md px-1.5 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/50 disabled:pointer-events-none disabled:opacity-50",
                              active
                                ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                            )}
                          >
                            <span className="whitespace-nowrap text-[11px] font-semibold">
                              {t(`generateFromModel.stages.${stage}.label`)}
                            </span>
                            <span className="text-[9px] leading-tight opacity-80">
                              {t(`generateFromModel.stages.${stage}.hint`)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 w-full justify-start text-[11px]"
                      onClick={() => void exportHktInputObj()}
                      disabled={!sourcePath || !sourceName || previewLoading || hktGenerating || applying || objExporting}
                    >
                      {objExporting ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="mr-2 h-3.5 w-3.5" />
                      )}
                      {objExporting ? t("generateFromModel.exportingObj") : t("generateFromModel.exportHktInputObj")}
                    </Button>
                  </section>
                </>
              ) : null}

              {previewUsesPreHavokMesh && meshPreview ? (
                <p className="text-[11px] text-amber-400/90">
                  {t("generateFromModel.decodeUnavailable")}
                </p>
              ) : null}

              {meshPreview && !previewLoading && !hktGenerating ? (
                <p className="text-[11px] text-emerald-400/90">
                  {t("generateFromModel.readyStats", {
                    stage: t(`generateFromModel.stages.${meshPreview.stage}.mesh`),
                    triangles: formatTriangleCount(meshPreview.triangleCount),
                    keys: formatTriangleCount(meshPreview.triangleCount * 2),
                  })}
                  {hasValidCachedHkt && !previewUsesPreHavokMesh
                    ? t("generateFromModel.cachedHint")
                    : ""}
                </p>
              ) : meshPreview && (previewLoading || hktGenerating || objExporting) ? (
                <p className="text-[11px] text-muted-foreground">{t("generateFromModel.buildingPreview")}</p>
              ) : null}
            </div>
          </ScrollArea>

          {/* Collision preview (manual — click Preview after choosing a model) */}
          <div className="relative min-h-[280px] min-w-0 overflow-hidden bg-[#0b0f14] lg:min-h-0">
            {meshPreview ? (
              <HktCollisionPreviewCanvas geometry={meshPreview} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <Boxes className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {previewError
                    ? t("generateFromModel.previewFailed")
                    : sourcePath
                      ? t("generateFromModel.clickPreview", {
                          stage: t(`generateFromModel.stages.${previewStage}.mesh`),
                        })
                      : t("generateFromModel.selectThenPreview")}
                </p>
                {previewError ? (
                  <p className="max-w-sm break-words text-[11px] text-destructive" data-i18n-ignore="">
                    {previewError}
                  </p>
                ) : null}
                {sourcePath ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void runPreview()}
                    disabled={previewLoading || hktGenerating || applying || objExporting}
                  >
                    {previewLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="mr-2 h-4 w-4" />
                    )}
                    {previewLoading
                      ? t("generateFromModel.generatingHkt")
                      : t("generateFromModel.preview")}
                  </Button>
                ) : null}
              </div>
            )}

            {sourcePath && meshPreview ? (
              <div className="absolute right-3 top-3 flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => void exportHktInputObj()}
                  disabled={previewLoading || hktGenerating || applying || objExporting}
                >
                  {objExporting ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-3 w-3" />
                  )}
                  {objExporting ? t("generateFromModel.exporting") : t("generateFromModel.obj")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => void runPreview()}
                  disabled={previewLoading || hktGenerating || applying || objExporting}
                >
                  {previewLoading ? (
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  ) : (
                    <Eye className="mr-1.5 h-3 w-3" />
                  )}
                  {previewLoading ? t("generateFromModel.updating") : t("generateFromModel.refresh")}
                </Button>
              </div>
            ) : null}

            {previewLoading && !meshPreview ? (
              <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md bg-background/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("generateFromModel.buildingPreviewShort")}
              </div>
            ) : null}

            {meshPreview ? (
              <div className="pointer-events-none absolute left-3 top-3 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-md bg-background/75 px-2.5 py-2 font-mono text-[10px] text-muted-foreground backdrop-blur">
                <span className="text-foreground">{t("preview.stage")}</span>
                <span className="text-right tabular-nums text-emerald-400">
                  {t(`generateFromModel.stages.${meshPreview.stage}.mesh`)}
                </span>
                <span>{t("preview.render")}</span>
                <span className="text-right tabular-nums">{formatTriangleCount(meshPreview.renderTriangleCount)}</span>
                <span>{t("preview.merged")}</span>
                <span className="text-right tabular-nums">{formatTriangleCount(meshPreview.mergedTriangleCount)}</span>
                <span className="text-foreground">{t("preview.triangles")}</span>
                <span className="text-right tabular-nums text-emerald-400">
                  {formatTriangleCount(meshPreview.triangleCount)}
                </span>
                <span>{t("preview.vertices")}</span>
                <span className="text-right tabular-nums">{formatTriangleCount(meshPreview.vertexCount)}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppRndModalShell>
  );
}
