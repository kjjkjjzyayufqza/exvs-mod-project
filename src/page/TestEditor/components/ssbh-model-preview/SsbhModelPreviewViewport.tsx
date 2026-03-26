import { Button } from "@/components/ui/button";
import { SsbhModelCanvas } from "./SsbhModelCanvas";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import type { SkelDataJson } from "./types";

export function SsbhModelPreviewViewport() {
  const p = useSsbhModelPreview();

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 shrink-0 px-1">
        <Button type="button" size="sm" variant="default" disabled={p.loading} onClick={() => void p.pickFolder()}>
          Open model folder
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={p.loading} onClick={() => void p.pickNumdlb()}>
          Open .numdlb
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={p.loading} onClick={() => void p.tryWorkspaceRoot()}>
          Use workspace root
        </Button>
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
        {p.loading ? <span className="text-muted-foreground">Loading…</span> : null}
        {p.loadError ? <span className="text-destructive max-w-[240px] truncate">{p.loadError}</span> : null}
        {p.drawError ? <span className="text-destructive max-w-[240px] truncate">{p.drawError}</span> : null}
      </div>

      {p.bundle ? (
        <p className="text-[11px] text-muted-foreground truncate shrink-0 px-1" title={p.bundle.modlPath}>
          {p.bundle.modlPath}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 flex flex-col px-1 pb-1">
        <SsbhModelCanvas
          draws={p.draws}
          textureDataUrlByDrawKey={p.textureDataUrlByDrawKey}
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
          fitRequestId={p.fitRequestId}
          skel={p.bundle?.skel ? (p.bundle.skel as SkelDataJson) : null}
          bonePoseEnabled={p.bonePoseEnabled}
          selectedBoneIndex={p.selectedBoneIndex}
          boneTransformMode={p.boneTransformMode}
          bonePoseResetNonce={p.bonePoseResetNonce}
        />
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Left-drag: orbit · Scroll: zoom (does not scroll this page) · Right-drag: pan. Use{" "}
          <span className="font-medium text-foreground">Reset view</span> to fit the model again. Viewport options and
          mesh list are in the right <span className="font-medium text-foreground">Info</span> panel on the{" "}
          <span className="font-medium text-foreground">3D View</span> tab.
        </p>
      </div>
    </div>
  );
}
