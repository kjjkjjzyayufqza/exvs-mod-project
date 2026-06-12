import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SsbhModelCanvas } from "./SsbhModelCanvas";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import { SsbhModelPreviewLoadingOverlay } from "./SsbhModelPreviewLoadingOverlay";
import { SsbhModelPreviewQuickActions } from "./SsbhModelPreviewQuickActions";
import { SsbhModelViewportTimeline } from "./SsbhModelViewportTimeline";
import { Fhm2dMemoryPreviewModal } from "./Fhm2dMemoryPreviewModal";
import { shouldRenderPreviewSkeletonLines } from "./ssbhPreviewSkeletonVisibility";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

export function SsbhModelPreviewViewport() {
  const p = useSsbhModelPreview();
  const motionScrubFrameRef = useRef<number | null>(null);
  const [motionScrubbing, setMotionScrubbing] = useState(false);
  const onViewportBoneSelect = useCallback(
    (index: number) => {
      p.setSelectedBoneIndex(index);
    },
    [p.setSelectedBoneIndex],
  );
  const onViewportBoneSelectionClear = useCallback(() => {
    p.setSelectedBoneIndex(null);
  }, [p.setSelectedBoneIndex]);
  const onMotionScrubStart = useCallback(() => {
    if (!motionScrubbing) {
      setMotionScrubbing(true);
    }
  }, [motionScrubbing]);
  const onMotionScrubPreview = useCallback((frame: number) => {
    motionScrubFrameRef.current = frame;
  }, []);
  const onMotionScrubEnd = useCallback(
    (frame: number) => {
      motionScrubFrameRef.current = null;
      setMotionScrubbing(false);
      p.setMotionFrame(frame);
      p.setMotionPlaying(false);
    },
    [p],
  );
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 shrink-0 px-1">
        <Button type="button" size="sm" variant="default" disabled={p.loading} onClick={() => void p.pickFolder()}>
          Open model folder
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={p.loading} onClick={() => void p.pickNumdlb()}>
          Open .numdlb
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={p.loading}
          onClick={() => void p.pickAddNumdlb()}
          title="Append a .numdlb instance without replacing current models"
        >
          Add .numdlb
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={p.loading}
          onClick={() => p.setMemoryPreviewModalOpen(true)}
          title="Load an .fhm2d package into a pure in-memory workspace and apply selected .numdlb entries to the viewport"
        >
          Memory Preview
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={p.loading}
          onClick={() => void p.pickMotionNuanmbFile()}
        >
          Open .nuanmb
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
            Decoding unique textures {p.textureDecodeProgress.done}/{p.textureDecodeProgress.total}
          </span>
        ) : null}
        {p.loadError ? <span className="text-destructive max-w-[240px] truncate">{p.loadError}</span> : null}
        {p.drawError ? <span className="text-destructive max-w-[240px] truncate">{p.drawError}</span> : null}
      </div>

      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={90} minSize={45}>
          <div className="relative h-full min-h-0 px-1 pb-1">
            <SsbhModelCanvas
              draws={p.draws}
              textureDataMap={p.textureDataMap}
              drawMaterialBindingsByDrawKey={p.drawMaterialBindingsByDrawKey}
              materialDebugViewMode={p.materialDebugViewMode}
              textureFlipY={p.textureFlipY}
              uvFlipU={p.uvFlipU}
              uvFlipV={p.uvFlipV}
              visibleKeys={p.visibleKeys}
              wireframe={p.wireframe}
              showSkeleton={shouldRenderPreviewSkeletonLines(p.showSkeleton, p.previewInstances)}
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
              previewInstances={p.previewInstances}
              activePreviewInstanceId={p.activePreviewInstanceId}
              previewViewMode={p.previewViewMode}
              hiddenPreviewInstanceIds={p.hiddenPreviewInstanceIds}
              selectedBoneIndex={p.selectedBoneIndex}
              bonePointSize={p.bonePointSize}
              boneTransformMode={p.boneTransformMode}
              bonePoseResetNonce={p.bonePoseResetNonce}
              previewRenderStyle={p.previewRenderStyle}
              previewSuspended={p.previewSuspended}
              onViewportBoneSelect={onViewportBoneSelect}
              onViewportBoneSelectionClear={onViewportBoneSelectionClear}
              onBoneTransformHotkey={p.setBoneTransformMode}
              bonePoseGetterRef={p.bonePoseGetterRef}
              bonePoseApplyNonce={p.bonePoseApplyNonce}
              bonePoseToApply={p.bonePoseToApply}
              onBonePoseApplyConsumed={p.consumeBonePoseApply}
              onBonePoseCommit={p.commitBonePoseUndo}
              onUndoBonePose={p.undoBonePose}
              onRedoBonePose={p.redoBonePose}
              motionStatesByInstanceId={p.motionStatesByInstanceId}
              onMotionFrameSync={p.setMotionFrameForInstance}
              onMotionPlaybackStop={(instanceId) => p.setMotionPlayingForInstance(instanceId, false)}
              motionControlInstanceId={p.activePreviewInstanceId ?? null}
              motionScrubbing={motionScrubbing}
              motionScrubFrameRef={motionScrubFrameRef}
              motionApplyCamera={p.motionApplyCamera}
              motionApplyLighting={p.motionApplyLighting}
              motionForceVisibleDuringPlayback={p.motionForceVisibleDuringPlayback}
              modelAttachments={p.modelAttachments}
            />
            <SsbhModelPreviewLoadingOverlay readingBundle={p.loading} textureDecode={p.textureDecodeProgress} />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border hover:bg-primary/20 transition-colors" />

        <ResizablePanel defaultSize={10} minSize={6}>
          <div className="h-full min-h-0 overflow-y-auto px-1 pb-1">
            <SsbhModelViewportTimeline
              onScrubStart={onMotionScrubStart}
              onScrubPreview={onMotionScrubPreview}
              onScrubEnd={onMotionScrubEnd}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <Fhm2dMemoryPreviewModal />
    </div>
  );
}
