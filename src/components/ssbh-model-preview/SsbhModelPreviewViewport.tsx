import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  SsbhModelCanvas,
  type PreviewInstanceHostTransform,
  type SsbhModelCanvasExportHandle,
} from "./SsbhModelCanvas";
import { useSsbhModelPreview } from "./SsbhModelPreviewContext";
import { SsbhModelPreviewLoadingOverlay } from "./SsbhModelPreviewLoadingOverlay";
import { SsbhModelPreviewQuickActions } from "./SsbhModelPreviewQuickActions";
import { SsbhModelViewportTimeline } from "./SsbhModelViewportTimeline";
import { Fhm2dMemoryPreviewModal } from "./Fhm2dMemoryPreviewModal";
import { shouldRenderPreviewSkeletonLines } from "./ssbhPreviewSkeletonVisibility";
import { resolveViewportActiveInstancePick } from "./viewportSelectionPolicy";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

export type SsbhModelPreviewViewportHandle = SsbhModelCanvasExportHandle;

export const SsbhModelPreviewViewport = forwardRef<
  SsbhModelPreviewViewportHandle,
  {
    /** Match Scene Editor when "unreal"; legacy Blender orbit when "default". */
    viewportControls?: "default" | "unreal";
    onExportObjectIdsChange?: (ids: string[]) => void;
    /** Hides source-picking actions when the viewport is hosted by another editor. */
    embedded?: boolean;
    /** Keeps the shared motion transport visible when an embedded host has animation. */
    showTimeline?: boolean;
    /** Host-owned R3F content rendered in the same fitted scene as SSBH models. */
    sceneOverlay?: ReactNode;
    sceneOverlayAnimating?: boolean;
    sceneOverlayLabel?: string;
    hostInstanceTransformsRef?: RefObject<ReadonlyMap<string, PreviewInstanceHostTransform>>;
    /** Host-local visibility override that does not mutate the shared preview collection service. */
    hostHiddenPreviewInstanceIds?: ReadonlySet<string>;
  }
>(function SsbhModelPreviewViewport(
  {
    viewportControls = "unreal",
    onExportObjectIdsChange,
    embedded = false,
    showTimeline = true,
    sceneOverlay,
    sceneOverlayAnimating = false,
    sceneOverlayLabel,
    hostInstanceTransformsRef,
    hostHiddenPreviewInstanceIds,
  },
  ref,
) {
  const p = useSsbhModelPreview();
  const { t } = useTranslation("ssbh-root-c");
  const canvasExportHandleRef = useRef<SsbhModelCanvasExportHandle | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      getExportObjectsByInstanceId: () =>
        canvasExportHandleRef.current?.getExportObjectsByInstanceId() ?? new Map(),
    }),
    [],
  );
  useEffect(() => {
    if (!onExportObjectIdsChange) return;
    const frame = window.requestAnimationFrame(() => {
      const ids = Array.from(canvasExportHandleRef.current?.getExportObjectsByInstanceId().keys() ?? []);
      onExportObjectIdsChange(ids);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    onExportObjectIdsChange,
    p.activePreviewInstanceId,
    p.hiddenPreviewInstanceIds,
    p.previewInstances,
    p.previewViewMode,
  ]);
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
  // Scrub end only commits the frame. Playback resume/pause is owned by the
  // timeline so accidental scrub no longer permanently cancels play.
  const onMotionScrubEnd = useCallback(
    (frame: number) => {
      motionScrubFrameRef.current = null;
      setMotionScrubbing(false);
      p.setMotionFrame(frame);
    },
    [p],
  );

  // Empty 3D-view clicks must not clear the active model. Motion timeline / Target
  // model bind to activePreviewInstanceId — clearing it drops the whole transport UI.
  // 3D picks never enable Inspect yellow outline (motion/preview stay clean).
  const handleViewportSelectInstance = useCallback(
    (id: string | null) => {
      const resolution = resolveViewportActiveInstancePick(
        id ? [id] : [],
        p.activePreviewInstanceId,
      );
      if (resolution.nextActiveId !== p.activePreviewInstanceId) {
        p.setActivePreviewInstanceId(resolution.nextActiveId);
      }
      if (resolution.clearBoneSelection) {
        p.setSelectedBoneIndex(null);
      }
      p.setSelectionOutlineEnabled(false);
    },
    [p],
  );

  const handleViewportSelectInstances = useCallback(
    (ids: string[]) => {
      const resolution = resolveViewportActiveInstancePick(ids, p.activePreviewInstanceId);
      if (resolution.nextActiveId !== p.activePreviewInstanceId) {
        p.setActivePreviewInstanceId(resolution.nextActiveId);
      }
      if (resolution.clearBoneSelection) {
        p.setSelectedBoneIndex(null);
      }
      p.setSelectionOutlineEnabled(false);
    },
    [p],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {embedded ? (
        <div className="flex min-h-8 shrink-0 items-center gap-2 px-1 text-[11px]" aria-live="polite">
          <span className="font-medium">{t("viewport.preview")}</span>
          {p.loading ? (
            <span className="text-muted-foreground">{t("viewport.loadingModel")}</span>
          ) : p.textureDecoding && p.textureDecodeProgress ? (
            <span className="truncate text-muted-foreground tabular-nums">
              {t("viewport.texturesProgress", {
                done: p.textureDecodeProgress.done,
                total: p.textureDecodeProgress.total,
              })}
            </span>
          ) : p.loadError ? (
            <span className="min-w-0 truncate text-destructive" title={p.loadError}>
              {p.loadError}
            </span>
          ) : p.drawError ? (
            <span className="min-w-0 truncate text-destructive" title={p.drawError}>
              {p.drawError}
            </span>
          ) : (
            <span className="text-muted-foreground tabular-nums">
              {p.previewInstances.length > 0
                ? t("viewport.modelCount", { count: p.previewInstances.length })
                : sceneOverlayLabel ?? t("viewport.emptyScene")}
            </span>
          )}
          <div className="min-w-0 flex-1" />
          <Button
            type="button"
            size="sm"
            variant={p.showGrid ? "secondary" : "ghost"}
            className="h-7 px-2 text-[10px]"
            onClick={() => p.setShowGrid(!p.showGrid)}
            aria-pressed={p.showGrid}
            title={t("viewport.toggleGrid")}
          >
            {t("viewport.grid")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={p.wireframe ? "secondary" : "ghost"}
            className="h-7 px-2 text-[10px]"
            onClick={() => p.setWireframe(!p.wireframe)}
            aria-pressed={p.wireframe}
            title={t("viewport.toggleWireframe")}
          >
            {t("viewport.wire")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={p.showAxesGizmo ? "secondary" : "ghost"}
            className="h-7 px-2 text-[10px]"
            onClick={() => p.setShowAxesGizmo(!p.showAxesGizmo)}
            aria-pressed={p.showAxesGizmo}
            title={t("viewport.toggleAxis")}
          >
            {t("viewport.axis")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            disabled={!p.draws.length && !sceneOverlay}
            onClick={p.requestCameraFit}
          >
            {t("viewport.fit")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 shrink-0 px-1">
        <Button type="button" size="sm" variant="default" disabled={p.loading} onClick={() => void p.pickNumdlb()}>
            {t("viewport.openNumdlb")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={p.loading}
          onClick={() => void p.pickAddNumdlb()}
          title={t("viewport.appendNumdlb")}
        >
          {t("viewport.addNumdlb")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={p.loading}
          onClick={() => p.setMemoryPreviewModalOpen(true)}
          title={t("viewport.memoryPreviewHelp")}
        >
          {t("viewport.memoryPreview")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={p.loading || p.previewBusy || !p.activePreviewInstanceId}
          onClick={() => void p.pickMotionNuanmbFile()}
        >
          {t("viewport.openNuanmb")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={p.loading || p.previewBusy || !p.activePreviewInstanceId}
          onClick={() =>
            void p.pickMotionFbxPreview().catch(() => {
              /* toast already shown in context */
            })
          }
          title={t("viewport.previewFbxHelp")}
        >
          {t("viewport.previewFbx")}
        </Button>
        <SsbhModelPreviewQuickActions />
        <div
          className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1 shrink-0"
          title={t("viewport.autoLoadHelp")}
        >
          <span className="text-[11px] text-muted-foreground whitespace-nowrap select-none">
            {t("viewport.autoLoadAfterConvert")}
          </span>
          <Switch checked={p.autoLoadAfterConvertToSsbh} onCheckedChange={p.setAutoLoadAfterConvertToSsbh} />
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!p.draws.length}
          onClick={p.requestCameraFit}
          title={t("viewport.resetViewHelp")}
        >
          {t("viewport.resetView")}
        </Button>
        {p.loading ? (
          <span className="text-muted-foreground">{t("viewport.loadingModel")}</span>
        ) : p.textureDecoding && p.textureDecodeProgress ? (
          <span
            className="max-w-[min(100%,280px)] truncate text-muted-foreground tabular-nums"
            title={p.textureDecodeProgress.currentLabel ?? undefined}
          >
            {t("viewport.decodingTextures", {
              done: p.textureDecodeProgress.done,
              total: p.textureDecodeProgress.total,
            })}
          </span>
        ) : null}
        {p.loadError ? <span className="text-destructive max-w-[240px] truncate">{p.loadError}</span> : null}
        {p.drawError ? <span className="text-destructive max-w-[240px] truncate">{p.drawError}</span> : null}
        </div>
      )}

      <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={showTimeline ? 90 : 100} minSize={45}>
          <div className="relative h-full min-h-0 px-1 pb-1">
            <SsbhModelCanvas
              exportHandleRef={canvasExportHandleRef}
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
              sceneOverlay={sceneOverlay}
              hostInstanceTransformsRef={hostInstanceTransformsRef}
              sceneOverlayAnimating={sceneOverlayAnimating}
              activePreviewInstanceId={p.activePreviewInstanceId}
              previewViewMode={p.previewViewMode}
              selectionOutlineEnabled={p.selectionOutlineEnabled}
              hiddenPreviewInstanceIds={hostHiddenPreviewInstanceIds ?? p.hiddenPreviewInstanceIds}
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
              viewportControls={viewportControls}
              onViewportSelectInstance={handleViewportSelectInstance}
              onViewportSelectInstances={handleViewportSelectInstances}
            />
            <SsbhModelPreviewLoadingOverlay readingBundle={p.loading} textureDecode={p.textureDecodeProgress} />
          </div>
        </ResizablePanel>

        {showTimeline ? (
          <>
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
          </>
        ) : null}
      </ResizablePanelGroup>
      {embedded ? null : <Fhm2dMemoryPreviewModal />}
    </div>
  );
});
