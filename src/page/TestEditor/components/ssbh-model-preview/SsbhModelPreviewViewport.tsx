import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SsbhModelCanvas } from "./SsbhModelCanvas";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import { SsbhModelPreviewLoadingOverlay } from "./SsbhModelPreviewLoadingOverlay";
import { SsbhModelPreviewQuickActions } from "./SsbhModelPreviewQuickActions";
import type { SkelDataJson } from "./types";

function formatPreviewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function SsbhModelPreviewViewport() {
  const p = useSsbhModelPreview();
  const stats = p.vertexTriangleStats;
  const statsLine =
    p.bundle && p.draws.length > 0
      ? `${formatPreviewCount(stats.verts)} verts · ${formatPreviewCount(stats.tris)} tris · ${p.draws.length} draws`
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 shrink-0 px-1">
        <Button type="button" size="sm" variant="default" disabled={p.loading} onClick={() => void p.pickFolder()}>
          Open model folder
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={p.loading} onClick={() => void p.pickNumdlb()}>
          Open .numdlb
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={p.loading} onClick={() => void p.tryWorkspaceRoot()}>
          Use workspace root
        </Button>
        <SsbhModelPreviewQuickActions />
        <div
          className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1 shrink-0"
          title="After a successful DAE or FBX export to SSBH, load the generated .numdlb in this preview"
        >
          <span className="text-[11px] text-muted-foreground whitespace-nowrap select-none">
            Auto-load after convert
          </span>
          <Switch checked={p.autoLoadAfterConvertToSsbh} onCheckedChange={p.setAutoLoadAfterConvertToSsbh} />
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!p.draws.length}
          onClick={p.requestCameraFit}
          title="Re-center the camera on the model using its bounding box"
        >
          Reset view
        </Button>
        {p.loading ? (
          <span className="text-muted-foreground">Loading model…</span>
        ) : p.textureDecoding && p.textureDecodeProgress ? (
          <span
            className="max-w-[min(100%,280px)] truncate text-muted-foreground tabular-nums"
            title={p.textureDecodeProgress.currentLabel ?? undefined}
          >
            Decoding textures {p.textureDecodeProgress.done}/{p.textureDecodeProgress.total}
          </span>
        ) : null}
        {p.loadError ? <span className="text-destructive max-w-[240px] truncate">{p.loadError}</span> : null}
        {p.drawError ? <span className="text-destructive max-w-[240px] truncate">{p.drawError}</span> : null}
        {statsLine ? (
          <span
            className="text-[10px] text-muted-foreground tabular-nums ml-auto w-full sm:w-auto sm:ml-0"
            title="Mesh statistics for the loaded preview"
          >
            {statsLine}
          </span>
        ) : null}
      </div>

      {p.bundle ? (
        <p className="text-[11px] text-muted-foreground truncate shrink-0 px-1" title={p.bundle.modlPath}>
          {p.bundle.modlPath}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 flex flex-col px-1 pb-1">
        <div className="relative min-h-0 flex-1">
          <SsbhModelCanvas
            draws={p.draws}
            drawMaterialDataUrlsByDrawKey={p.drawMaterialDataUrlsByDrawKey}
            drawMaterialBindingsByDrawKey={p.drawMaterialBindingsByDrawKey}
            materialDebugViewMode={p.materialDebugViewMode}
            textureFlipY={p.textureFlipY}
            uvFlipU={p.uvFlipU}
            uvFlipV={p.uvFlipV}
            visibleKeys={p.visibleKeys}
            wireframe={p.wireframe}
            showSkeleton={p.showSkeleton && Boolean(p.bundle?.skel)}
            skeletonGeometry={p.skeletonGeometry}
            showGrid={p.showGrid}
            showAxesGizmo={p.showAxesGizmo}
            showStats={p.showStats}
            background={p.background}
            ambientIntensity={p.ambientIntensity}
            directionalIntensity={p.directionalIntensity}
            directionalX={p.directionalX}
            directionalY={p.directionalY}
            directionalZ={p.directionalZ}
            normalMapEnabled={p.normalMapEnabled}
            fitRequestId={p.fitRequestId}
            skel={p.bundle?.skel ? (p.bundle.skel as SkelDataJson) : null}
            bonePoseEnabled={p.bonePoseEnabled}
            selectedBoneIndex={p.selectedBoneIndex}
            boneTransformMode={p.boneTransformMode}
            bonePoseResetNonce={p.bonePoseResetNonce}
            previewRenderStyle={p.previewRenderStyle}
          />
          <SsbhModelPreviewLoadingOverlay readingBundle={p.loading} textureDecode={p.textureDecodeProgress} />
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Left-drag: orbit · Scroll: zoom (does not scroll this page) · Right-drag: pan.{" "}
          <span className="font-medium text-foreground">Clear scene</span> unloads the model;{" "}
          <span className="font-medium text-foreground">More</span> opens recent files, copy path, folder in file manager,
          and shortcuts
          (focus the quick bar with Tab, then F / R). Full options are in the right{" "}
          <span className="font-medium text-foreground">Info</span> panel on the{" "}
          <span className="font-medium text-foreground">3D View</span> tab.
        </p>
      </div>
    </div>
  );
}
