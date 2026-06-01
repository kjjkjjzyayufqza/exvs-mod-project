import { useEffect, useMemo, useState } from "react";
import type { HktSimplifyConfig, HktSimplifyPreset } from "./daeImportTypes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DaeImportFieldRow,
  DaeImportSection,
  DaeImportStatusAlert,
  daeImportModalSelectContentClass,
} from "./daeImportUi";
import {
  buildImportConfigForHktPreview,
  detectHktSimplifyPreset,
  formatTriangleCount,
  HKT_SIMPLIFY_PRESET_HINTS,
  HKT_SIMPLIFY_PRESET_LABELS,
  HKT_SIMPLIFY_PRESET_ORDER,
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

interface DaeImportHktSimplifyFieldsProps {
  value: HktSimplifyConfig;
  onChange: (next: HktSimplifyConfig) => void;
  importConfig: ImportConfig;
  sourcePath?: string | null;
  sourceName?: string;
  sessionId?: string | null;
  sessionImportId?: string | null;
  compact?: boolean;
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
  onValidationChange,
}: DaeImportHktSimplifyFieldsProps) {
  const [preview, setPreview] = useState<HktCollisionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const normalizedValue = useMemo(() => normalizeHktSimplifyConfig(value), [value]);
  const activePreset = detectHktSimplifyPreset(normalizedValue);

  const handlePresetChange = (nextPreset: HktSimplifyPreset) => {
    onChange(hktSimplifyConfigFromPreset(nextPreset));
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
    if (!importConfig.generateHkt) {
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

  return (
    <DaeImportSection title={compact ? "Simplify" : "Collision Simplification"}>
      <DaeImportStatusAlert tone="info">
        Merges adjacent similar faces before building HKT. Heavy mode also decimates curved
        surfaces toward a low-poly collision mesh for dense render geometry.
      </DaeImportStatusAlert>

      <DaeImportFieldRow
        label="Simplify Level"
        hint={HKT_SIMPLIFY_PRESET_HINTS[activePreset]}
      >
        <Select value={activePreset} onValueChange={handlePresetChange}>
          <SelectTrigger className="h-8 text-[11px]">
            <SelectValue placeholder="Select level" />
          </SelectTrigger>
          <SelectContent className={daeImportModalSelectContentClass}>
            {HKT_SIMPLIFY_PRESET_ORDER.map((preset) => (
              <SelectItem key={preset} value={preset} className="text-[11px]">
                {HKT_SIMPLIFY_PRESET_LABELS[preset]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DaeImportFieldRow>

      {importConfig.generateHkt && (sourcePath || sessionImportId) ? (
        <div className="space-y-1 px-4 py-2 text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground">Preview</p>
          {previewError ? (
            <p className="text-destructive">{previewError}</p>
          ) : null}
          {previewLoading ? (
            <p>Computing collision stats…</p>
          ) : previewError ? null : preview ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px]">
              <span>Render tris</span>
              <span className="text-right">{formatTriangleCount(preview.renderTriangleCount)}</span>
              <span>Merged tris</span>
              <span className="text-right">{formatTriangleCount(preview.mergedTriangleCount)}</span>
              <span>Collision tris</span>
              <span className="text-right text-green-400">
                {formatTriangleCount(preview.simplifiedTriangleCount)}
              </span>
              <span>Vertices</span>
              <span className="text-right">{formatTriangleCount(preview.vertexCount)}</span>
              {reduction != null && normalizedValue.enabled ? (
                <>
                  <span>Reduction</span>
                  <span className="text-right">{reduction}%</span>
                </>
              ) : null}
            </div>
          ) : (
            <p>Adjust settings to preview triangle counts.</p>
          )}
        </div>
      ) : null}
    </DaeImportSection>
  );
}
