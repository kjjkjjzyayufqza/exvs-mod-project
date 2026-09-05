import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type {
  HktHullPreset,
  HktSimplifyConfig,
  HktSimplifyPreset,
  HktSimplifyStrategy,
} from "./daeImportTypes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DaeImportBoolField,
  DaeImportFieldRow,
  DaeImportSection,
  DaeImportStatusAlert,
  daeImportModalSelectContentClass,
} from "./daeImportUi";
import {
  buildImportConfigForHktPreview,
  detectHktSimplifyPreset,
  formatTriangleCount,
  HKT_HULL_PRESET_ORDER,
  HKT_SIMPLIFY_PRESET_ORDER,
  hktHullConfigFromPreset,
  hktSimplifyConfigFromPreset,
  normalizeHktSimplifyConfig,
  reductionPercent,
  serializeHktPreviewConfigKey,
} from "../../utils/hktSimplifyUtils";
import {
  scenePreviewHktCollisionPath,
  scenePreviewHktCollisionSession,
  type HktCollisionPreview,
  type ImportConfig,
} from "../../utils/sceneSessionService";

const STRATEGY_OPTIONS: { value: HktSimplifyStrategy; labelKey: string; hintKey: string }[] = [
  { value: "shapePreserving", labelKey: "strategy.shapePreserving", hintKey: "strategy.shapePreservingHint" },
  { value: "convexHull", labelKey: "strategy.convexHull", hintKey: "strategy.convexHullHint" },
];

interface DaeImportHktSimplifyFieldsProps {
  value: HktSimplifyConfig;
  onChange: (next: HktSimplifyConfig) => void;
  importConfig: ImportConfig;
  sourcePath?: string | null;
  sourceName?: string;
  sessionId?: string | null;
  sessionImportId?: string | null;
  compact?: boolean;
  /** When false, collision stats preview only runs if a parent triggers it (no debounced auto-run). */
  autoPreview?: boolean;
  onValidationChange?: (error: string | null) => void;
}

export function DaeImportHktSimplifyFields({
  value,
  onChange,
  importConfig,
  sourcePath,
  sourceName,
  sessionId,
  sessionImportId,
  compact = false,
  autoPreview = true,
  onValidationChange,
}: DaeImportHktSimplifyFieldsProps) {
  const { t } = useTranslation("scene-dae-hkt");
  const [preview, setPreview] = useState<HktCollisionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const normalizedValue = useMemo(() => normalizeHktSimplifyConfig(value), [value]);
  const activePreset = detectHktSimplifyPreset(normalizedValue);
  const activeStrategy = normalizedValue.strategy;
  const activeHullPreset = normalizedValue.hullPreset;

  const handlePresetChange = (nextPreset: HktSimplifyPreset) => {
    onChange(hktSimplifyConfigFromPreset(nextPreset));
  };

  const handleStrategyChange = (next: HktSimplifyStrategy) => {
    if (next === activeStrategy) return;
    onChange(
      next === "convexHull"
        ? hktHullConfigFromPreset(activeHullPreset)
        : hktSimplifyConfigFromPreset("medium"),
    );
  };

  const handleHullPresetChange = (next: HktHullPreset) => {
    onChange(hktHullConfigFromPreset(next));
  };

  const handleQuadMergeChange = (checked: boolean) => {
    onChange({
      ...normalizedValue,
      quadMergeEnabled: checked,
    });
  };

  const ssbhConfig = importConfig.ssbhConfig;
  const previewConfigKey = useMemo(
    () => serializeHktPreviewConfigKey(importConfig, normalizedValue),
    [
      importConfig.generateHkt,
      importConfig.convertToSsbh,
      ssbhConfig?.baseFilename,
      ssbhConfig?.scaleFactor,
      ssbhConfig?.upAxis,
      ssbhConfig?.writeNumdlb,
      ssbhConfig?.writeNumshb,
      ssbhConfig?.writeNusktb,
      ssbhConfig?.writeNumatb,
      ssbhConfig?.writeJnttbl,
      ssbhConfig?.writeMayaProfile,
      ssbhConfig?.materialTemplate,
      normalizedValue.preset,
      normalizedValue.enabled,
      normalizedValue.planarityAngleDeg,
      normalizedValue.minTriangleArea,
      normalizedValue.weldEpsilon,
      normalizedValue.targetTriangleRatio,
      normalizedValue.maxTargetTriangles,
      normalizedValue.strategy,
      normalizedValue.hullPreset,
      normalizedValue.hullTargetFaces,
      normalizedValue.quadMergeEnabled,
    ],
  );

  const previewConfig = useMemo(
    () =>
      buildImportConfigForHktPreview({
        generateHkt: importConfig.generateHkt,
        convertToSsbh: importConfig.convertToSsbh,
        ssbhConfig: importConfig.ssbhConfig,
        hktSimplify: normalizedValue,
      }),
    [previewConfigKey],
  );

  useEffect(() => {
    if (!autoPreview || !importConfig.generateHkt) {
      setPreview(null);
      setPreviewError(null);
      onValidationChange?.(null);
      return;
    }

    const canPreviewFromSession = Boolean(sessionId && sessionImportId);
    const canPreviewFromFile = Boolean(sourcePath);
    if (!canPreviewFromSession && !canPreviewFromFile) {
      setPreview(null);
      setPreviewError(null);
      onValidationChange?.(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        let result: HktCollisionPreview;
        if (canPreviewFromSession && sessionId && sessionImportId) {
          result = await scenePreviewHktCollisionSession(
            sessionId,
            sessionImportId,
            previewConfig,
          );
        } else if (sourcePath) {
          result = await scenePreviewHktCollisionPath(
            sourcePath,
            sourceName ?? sourcePath.split(/[/\\]/).pop() ?? "input.dae",
            previewConfig,
          );
        } else {
          return;
        }
        if (!cancelled) {
          setPreview(result);
          setPreviewError(null);
          onValidationChange?.(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setPreview(null);
          setPreviewError(message);
          onValidationChange?.(message);
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    autoPreview,
    sourcePath,
    sourceName,
    sessionId,
    sessionImportId,
    previewConfigKey,
    importConfig.generateHkt,
    onValidationChange,
  ]);

  const reduction = preview
    ? reductionPercent(preview.mergedTriangleCount, preview.simplifiedTriangleCount)
    : null;

  const compactFieldRowClass = compact
    ? "grid-cols-1 items-start gap-1.5 py-2 [&>div:last-child]:w-full"
    : undefined;

  return (
    <DaeImportSection title={t(compact ? "section.simplify" : "section.collisionSimplification")} compact={compact}>
      {!compact ? (
        <DaeImportStatusAlert tone="info">
          {t("section.simplificationDescription")}
        </DaeImportStatusAlert>
      ) : null}

      <div className={cn("min-w-0 space-y-2", compact ? "px-3" : "px-1")}>
        <div className="text-[11px] font-medium text-foreground">{t("fields.strategy")}</div>
        <div
          className={cn(
            "grid min-w-0 gap-1 rounded-lg border border-border/60 bg-muted/20 p-1",
            compact ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          {STRATEGY_OPTIONS.map((opt) => {
            const active = activeStrategy === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={active}
                onClick={() => handleStrategyChange(opt.value)}
                className={cn(
                  "flex min-w-0 w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/50",
                  active
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <span className="text-[11px] font-semibold">{t(opt.labelKey)}</span>
                <span className="text-pretty text-[10px] leading-snug opacity-80 break-words">
                  {t(opt.hintKey)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeStrategy === "shapePreserving" ? (
        <DaeImportFieldRow
          label={t("fields.simplifyLevel")}
          hint={t(`presets.simplify.${activePreset}.hint`)}
          className={compactFieldRowClass}
        >
          <Select value={activePreset} onValueChange={handlePresetChange}>
            <SelectTrigger className="h-8 text-[11px]" aria-label={t("fields.simplifyLevel")}>
              <SelectValue placeholder={t("placeholders.selectLevel")} />
            </SelectTrigger>
            <SelectContent className={daeImportModalSelectContentClass}>
              {HKT_SIMPLIFY_PRESET_ORDER.map((preset) => (
                <SelectItem key={preset} value={preset} className="text-[11px]">
                  {t(`presets.simplify.${preset}.label`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DaeImportFieldRow>
      ) : (
        <DaeImportFieldRow
          label={t("fields.hullDetail")}
          hint={t(`presets.hull.${activeHullPreset}.hint`)}
          className={compactFieldRowClass}
        >
          <Select
            value={activeHullPreset}
            onValueChange={(v) => handleHullPresetChange(v as HktHullPreset)}
          >
            <SelectTrigger className="h-8 text-[11px]" aria-label={t("fields.hullDetail")}>
              <SelectValue placeholder={t("placeholders.selectDetail")} />
            </SelectTrigger>
            <SelectContent className={daeImportModalSelectContentClass}>
              {HKT_HULL_PRESET_ORDER.map((preset) => (
                <SelectItem key={preset} value={preset} className="text-[11px]">
                  {t(`presets.hull.${preset}.label`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DaeImportFieldRow>
      )}

      {activeStrategy === "shapePreserving" ? (
        <DaeImportBoolField
          label={t("fields.realQuads")}
          hint={t("fields.realQuadsHint")}
          checked={normalizedValue.quadMergeEnabled}
          onCheckedChange={handleQuadMergeChange}
          className={compactFieldRowClass}
        />
      ) : null}

      {importConfig.generateHkt && (sourcePath || sessionImportId) ? (
        <div
          className={cn(
            "min-w-0 space-y-1 py-2 text-[11px] text-muted-foreground",
            compact ? "px-3" : "px-4",
          )}
        >
          <p className="font-medium text-foreground">{t("preview.title")}</p>
          {previewError ? (
            <p className="text-pretty break-words text-destructive">{t("preview.error", { message: previewError })}</p>
          ) : null}
          {previewLoading ? (
            <p>{t("preview.computing")}</p>
          ) : previewError ? null : preview ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
              <span>{t("preview.renderTris")}</span>
              <span className="text-right">{formatTriangleCount(preview.renderTriangleCount)}</span>
              <span>{t("preview.mergedTris")}</span>
              <span className="text-right">{formatTriangleCount(preview.mergedTriangleCount)}</span>
              <span>{t("preview.collisionTris")}</span>
              <span className="text-right text-green-400">
                {formatTriangleCount(preview.simplifiedTriangleCount)}
              </span>
              <span>{t("preview.vertices")}</span>
              <span className="text-right">{formatTriangleCount(preview.vertexCount)}</span>
              {reduction != null && normalizedValue.enabled ? (
                <>
                  <span>{t("preview.reduction")}</span>
                  <span className="text-right">{reduction}%</span>
                </>
              ) : null}
            </div>
          ) : (
            <p>{t("preview.adjustSettings")}</p>
          )}
        </div>
      ) : null}
    </DaeImportSection>
  );
}
