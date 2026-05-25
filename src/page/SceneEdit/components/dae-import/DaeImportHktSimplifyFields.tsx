import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { HktSimplifyConfig } from "./daeImportTypes";
import {
  DaeImportBoolField,
  DaeImportFieldRow,
  DaeImportSection,
  DaeImportStatusAlert,
} from "./daeImportUi";
import {
  buildImportConfigForHktPreview,
  formatTriangleCount,
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
}: DaeImportHktSimplifyFieldsProps) {
  const [preview, setPreview] = useState<HktCollisionPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const update = <K extends keyof HktSimplifyConfig>(
    key: K,
    nextValue: HktSimplifyConfig[K],
  ) => {
    onChange({ ...value, [key]: nextValue });
  };

  const ssbhConfig = importConfig.ssbhConfig;
  const previewConfigKey = useMemo(
    () => serializeHktPreviewConfigKey(importConfig, value),
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
      value.enabled,
      value.planarityAngleDeg,
      value.minTriangleArea,
      value.weldEpsilon,
    ],
  );

  const previewConfig = useMemo(
    () =>
      buildImportConfigForHktPreview({
        generateHkt: importConfig.generateHkt,
        convertToSsbh: importConfig.convertToSsbh,
        ssbhConfig: importConfig.ssbhConfig,
        hktSimplify: value,
      }),
    [previewConfigKey],
  );

  useEffect(() => {
    if (!importConfig.generateHkt) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    const canPreviewFromSession = Boolean(sessionId && sessionImportId);
    const canPreviewFromFile = Boolean(sourcePath);
    if (!canPreviewFromSession && !canPreviewFromFile) {
      setPreview(null);
      setPreviewError(null);
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
        }
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(err instanceof Error ? err.message : String(err));
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
  ]);

  const reduction = preview
    ? reductionPercent(preview.mergedTriangleCount, preview.simplifiedTriangleCount)
    : null;

  return (
    <DaeImportSection title={compact ? "Simplify" : "Collision Simplification"}>
      <DaeImportStatusAlert tone="info">
        Merges coplanar faces with similar normals (Havok-style planarity threshold) before
        building HKT. Creases and curved regions keep their triangles.
      </DaeImportStatusAlert>

      <DaeImportBoolField
        label="Enable Simplification"
        hint="Disable to export every render triangle as collision"
        checked={value.enabled}
        onCheckedChange={(checked) => update("enabled", checked)}
      />

      <DaeImportFieldRow
        label="Planarity Angle"
        hint="Max angle between normals to merge (degrees)"
      >
        <div className="space-y-1.5">
          <Slider
            min={1}
            max={30}
            step={0.5}
            value={[value.planarityAngleDeg]}
            disabled={!value.enabled}
            onValueChange={(v) => update("planarityAngleDeg", v[0] ?? value.planarityAngleDeg)}
          />
          <Input
            className="h-7 text-[11px]"
            type="number"
            min={1}
            max={45}
            step={0.5}
            disabled={!value.enabled}
            value={value.planarityAngleDeg}
            onChange={(e) =>
              update("planarityAngleDeg", Math.min(45, Math.max(1, Number(e.target.value) || 8)))
            }
          />
        </div>
      </DaeImportFieldRow>

      <DaeImportFieldRow label="Weld Epsilon" hint="Merge vertices closer than this distance">
        <Input
          className="h-8 text-[11px]"
          type="number"
          min={0}
          step={0.00001}
          disabled={!value.enabled}
          value={value.weldEpsilon}
          onChange={(e) => update("weldEpsilon", Math.max(0, Number(e.target.value) || 0))}
        />
      </DaeImportFieldRow>

      <DaeImportFieldRow label="Min Triangle Area" hint="Drop degenerate micro triangles">
        <Input
          className="h-8 text-[11px]"
          type="number"
          min={0}
          step={1e-9}
          disabled={!value.enabled}
          value={value.minTriangleArea}
          onChange={(e) => update("minTriangleArea", Math.max(0, Number(e.target.value) || 0))}
        />
      </DaeImportFieldRow>

      {importConfig.generateHkt && (sourcePath || sessionImportId) ? (
        <div className="space-y-1 px-4 py-2 text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground">Preview</p>
          {previewLoading ? (
            <p>Computing collision stats…</p>
          ) : previewError ? (
            <p className="text-destructive">{previewError}</p>
          ) : preview ? (
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
              {reduction != null && value.enabled ? (
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
