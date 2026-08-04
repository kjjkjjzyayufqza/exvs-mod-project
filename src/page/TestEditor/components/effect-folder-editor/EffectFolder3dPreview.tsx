import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Box, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  SsbhModelPreviewProvider,
  useSsbhModelPreview,
} from "@/components/ssbh-model-preview/SsbhModelPreviewContext";
import { SsbhModelPreviewViewport } from "@/components/ssbh-model-preview/SsbhModelPreviewViewport";
import type { PreviewInstanceHostTransform } from "@/components/ssbh-model-preview/SsbhModelCanvas";
import type { EffectFolderInventory } from "@/services/effectFolder/effectFolderService";
import type { EffectListItem } from "./effectFolderEditorUtils";
import {
  buildEffectFolderPreviewPlan,
  type EffectFolderPreviewPlan,
} from "./effectFolderPreviewPlan";
import { EfxbnDiagnosticOverlay } from "./EfxbnDiagnosticOverlay";
import { EfxbnPreviewInspector } from "./EfxbnPreviewInspector";
import {
  EFXBN_PREVIEW_FRAME_COUNT,
  resolveEfxbnModelPoolRequirements,
} from "./efxbnSimulation";

type EffectFolder3dPreviewProps = {
  item: EffectListItem;
  inventory: EffectFolderInventory;
  previewSuspended?: boolean;
};

function allowsAutomaticPreviewMotion(): boolean {
  return typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function EffectFolderPreviewScene({
  plan,
  selectedEffectIndex,
  onInstanceMapChange,
  hostInstanceTransformsRef,
}: {
  plan: EffectFolderPreviewPlan;
  selectedEffectIndex: number | null;
  onInstanceMapChange: (mapping: ReadonlyMap<number, readonly string[]>) => void;
  hostInstanceTransformsRef: MutableRefObject<ReadonlyMap<string, PreviewInstanceHostTransform>>;
}) {
  const {
    loadModelSetAt,
    loadMotionNuanmbPathForInstance,
    motionStatesByInstanceId,
    requestCameraFit,
    setInstanceModelId,
    setActivePreviewInstanceId,
    setMotionFrameForInstance,
    setMotionPlayingForInstance,
  } = useSsbhModelPreview();
  const loadedPlanKeyRef = useRef<string | null>(null);
  const animatedInstancesRef = useRef<string[]>([]);
  const startedPlanKeyRef = useRef<string | null>(null);
  const instanceIdsByEffectIndexRef = useRef<Map<number, string[]>>(new Map());
  const selectedEffectIndexRef = useRef(selectedEffectIndex);
  selectedEffectIndexRef.current = selectedEffectIndex;
  const modelLoadSlots = useMemo(() => {
    if (plan.kind === "model") {
      return plan.targets.map((target) => ({ target, poolIndex: 0 }));
    }
    const capacityByEffectIndex = new Map(
      resolveEfxbnModelPoolRequirements(plan).map((requirement) => [
        requirement.pair.target.index,
        requirement.capacity,
      ]),
    );
    return plan.targets.flatMap((target) => {
      const block = target.effectIndex === null
        ? null
        : plan.effectBlocks.find((effect) => effect.index === target.effectIndex);
      const capacity = target.effectIndex === null
        ? 1
        : (capacityByEffectIndex.get(target.effectIndex) ??
          (block && (block.spawnFormType === 9 || block.spawnFormType === 10) ? 1 : 0));
      return Array.from({ length: capacity }, (_, poolIndex) => ({ target, poolIndex }));
    });
  }, [plan]);

  useEffect(() => {
    if (loadedPlanKeyRef.current === plan.key) return;
    loadedPlanKeyRef.current = plan.key;
    animatedInstancesRef.current = [];
    instanceIdsByEffectIndexRef.current = new Map();
    hostInstanceTransformsRef.current = new Map();
    onInstanceMapChange(new Map());
    startedPlanKeyRef.current = null;
    let cancelled = false;

    if (modelLoadSlots.length === 0) {
      requestCameraFit();
      return;
    }

    void loadModelSetAt(modelLoadSlots.map((slot) => slot.target.modelPath))
      .then((instances) => {
        if (cancelled) return;
        const animatedIds: string[] = [];
        instances.forEach((instance, index) => {
          const slot = modelLoadSlots[index];
          if (!slot) return;
          const { target } = slot;
          if (target.effectIndex !== null) {
            const ids = instanceIdsByEffectIndexRef.current.get(target.effectIndex) ?? [];
            ids.push(instance.id);
            instanceIdsByEffectIndexRef.current.set(target.effectIndex, ids);
          }
          if (slot.poolIndex === 0) setInstanceModelId(instance.id, target.modelHash.hex);
          if (target.animationPath) {
            animatedIds.push(instance.id);
            loadMotionNuanmbPathForInstance(instance.id, target.animationPath);
          }
        });
        hostInstanceTransformsRef.current = new Map(
          instances.map((instance) => [
            instance.id,
            {
              position: [0, 0, 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
              visible: plan.kind === "model",
            } satisfies PreviewInstanceHostTransform,
          ]),
        );
        onInstanceMapChange(new Map(instanceIdsByEffectIndexRef.current));
        const selectedInstanceId =
          selectedEffectIndexRef.current === null
            ? null
            : instanceIdsByEffectIndexRef.current.get(selectedEffectIndexRef.current)?.[0];
        if (selectedInstanceId) setActivePreviewInstanceId(selectedInstanceId);
        animatedInstancesRef.current = animatedIds;
        requestCameraFit();
      })
      .catch(() => {
        // The shared preview surface owns the actionable load error.
      });

    return () => {
      cancelled = true;
      hostInstanceTransformsRef.current = new Map();
    };
  }, [
    loadModelSetAt,
    loadMotionNuanmbPathForInstance,
    modelLoadSlots,
    plan,
    onInstanceMapChange,
    requestCameraFit,
    setActivePreviewInstanceId,
    setInstanceModelId,
    hostInstanceTransformsRef,
  ]);

  useEffect(() => {
    if (selectedEffectIndex === null) return;
    const instanceId = instanceIdsByEffectIndexRef.current.get(selectedEffectIndex)?.[0];
    if (instanceId) setActivePreviewInstanceId(instanceId);
  }, [selectedEffectIndex, setActivePreviewInstanceId]);

  useEffect(() => {
    const instanceIds = animatedInstancesRef.current;
    if (instanceIds.length === 0 || startedPlanKeyRef.current === plan.key) return;
    const states = instanceIds.map((instanceId) => motionStatesByInstanceId.get(instanceId));
    if (states.some((state) => !state || state.sampling)) return;
    if (states.some((state) => !state?.clip || state.sampleError)) return;

    startedPlanKeyRef.current = plan.key;
    for (const instanceId of instanceIds) {
      setMotionFrameForInstance(instanceId, 0);
      setMotionPlayingForInstance(instanceId, true);
    }
  }, [
    motionStatesByInstanceId,
    plan.key,
    setMotionFrameForInstance,
    setMotionPlayingForInstance,
  ]);

  return null;
}

export function EffectFolder3dPreview({
  item,
  inventory,
  previewSuspended = false,
}: EffectFolder3dPreviewProps) {
  const plan = useMemo(() => buildEffectFolderPreviewPlan(item, inventory), [inventory, item]);
  const [effectProgress, setEffectProgress] = useState(0);
  const [effectPlaying, setEffectPlaying] = useState(false);
  const [effectSpeed, setEffectSpeed] = useState(1);
  const [selectedEffectIndex, setSelectedEffectIndex] = useState<number | null>(null);
  const [hiddenEffectIndexes, setHiddenEffectIndexes] = useState<Set<number>>(() => new Set());
  const [instanceIdsByEffectIndex, setInstanceIdsByEffectIndex] = useState<ReadonlyMap<number, readonly string[]>>(
    () => new Map(),
  );
  const hostInstanceTransformsRef = useRef<ReadonlyMap<string, PreviewInstanceHostTransform>>(new Map());

  useEffect(() => {
    const firstEffectIndex = plan?.effectBlocks[0]?.index ?? null;
    setSelectedEffectIndex(firstEffectIndex);
    setHiddenEffectIndexes(new Set());
    setInstanceIdsByEffectIndex(new Map());
    hostInstanceTransformsRef.current = new Map();
    setEffectProgress(0);
    setEffectPlaying(firstEffectIndex !== null && allowsAutomaticPreviewMotion());
  }, [plan?.key]);

  const handleEffectProgressChange = useCallback((progress: number) => {
    setEffectProgress(progress);
  }, []);
  const handleSetEffectVisible = useCallback((effectIndex: number, visible: boolean) => {
    setHiddenEffectIndexes((current) => {
      const next = new Set(current);
      if (visible) next.delete(effectIndex);
      else next.add(effectIndex);
      return next;
    });
  }, []);
  const handleShowAllEffects = useCallback(() => setHiddenEffectIndexes(new Set()), []);
  const handleSoloEffect = useCallback(
    (effectIndex: number) => {
      setSelectedEffectIndex(effectIndex);
      const selectedBlock = plan?.effectBlocks.find((block) => block.index === effectIndex);
      const keep = new Set([effectIndex]);
      if (selectedBlock?.effectType === 9 && selectedBlock.referencedEffectIndex >= 0) {
        keep.add(selectedBlock.referencedEffectIndex);
      }
      for (const block of plan?.effectBlocks ?? []) {
        if (block.effectType === 9 && block.referencedEffectIndex === effectIndex) keep.add(block.index);
      }
      setHiddenEffectIndexes(
        new Set(plan?.effectBlocks.filter((block) => !keep.has(block.index)).map((block) => block.index) ?? []),
      );
    },
    [plan?.effectBlocks],
  );
  const hiddenPreviewInstanceIds = useMemo(() => {
    const hiddenIds = new Set<string>();
    for (const effectIndex of hiddenEffectIndexes) {
      for (const instanceId of instanceIdsByEffectIndex.get(effectIndex) ?? []) {
        hiddenIds.add(instanceId);
      }
    }
    return hiddenIds;
  }, [hiddenEffectIndexes, instanceIdsByEffectIndex]);
  if (!plan) return null;

  const hasDiagnosticBlocks = plan.effectBlocks.length > 0;
  const hasRenderableScene = plan.targets.length > 0 || hasDiagnosticBlocks;
  const previewCounts = [
    hasDiagnosticBlocks ? `${plan.effectBlocks.length} blocks` : null,
    plan.targets.length > 0 ? `${plan.targets.length} models` : null,
    plan.localTextureCount > 0 ? `${plan.localTextureCount} textures` : null,
  ].filter(Boolean).join(" · ");
  return (
    <section className="space-y-2" aria-label={plan.kind === "efxbn" ? "EFXBN 3D preview" : "Model 3D preview"}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="mr-auto text-xs font-medium">Preview</h4>
        {previewCounts ? <span className="text-[10px] tabular-nums text-muted-foreground">{previewCounts}</span> : null}
      </div>

      {!hasRenderableScene ? (
        <div className="flex min-h-32 flex-col items-center justify-center rounded-md border border-dashed bg-muted/10 px-4 text-center">
          <Box className="mb-2 h-6 w-6 text-muted-foreground/60" aria-hidden />
          <p className="text-xs text-muted-foreground">No preview data.</p>
        </div>
      ) : (
        <div className="h-[min(64vh,620px)] min-h-[460px] overflow-hidden rounded-md border bg-muted/5">
          <SsbhModelPreviewProvider
            key={plan.key}
            workspaceRoot={inventory.effectRoot}
            previewSuspended={previewSuspended}
            defaultLightingPreset="softCharacter"
          >
            <EffectFolderPreviewScene
              plan={plan}
              selectedEffectIndex={selectedEffectIndex}
              onInstanceMapChange={setInstanceIdsByEffectIndex}
              hostInstanceTransformsRef={hostInstanceTransformsRef}
            />
            {hasDiagnosticBlocks ? (
              <ResizablePanelGroup orientation="horizontal" className="min-h-0">
                <ResizablePanel defaultSize={72} minSize={50} className="min-h-0 p-1">
                  <SsbhModelPreviewViewport
                    embedded
                    showTimeline={plan.localAnimationCount > 0}
                    viewportControls="unreal"
                    sceneOverlay={
                      <EfxbnDiagnosticOverlay
                        plan={plan}
                        progress={effectProgress}
                        playing={effectPlaying}
                        speed={effectSpeed}
                        selectedEffectIndex={selectedEffectIndex}
                        hiddenEffectIndexes={hiddenEffectIndexes}
                        instanceIdsByEffectIndex={instanceIdsByEffectIndex}
                        hostInstanceTransformsRef={hostInstanceTransformsRef}
                        onSelectEffect={setSelectedEffectIndex}
                        onProgressChange={handleEffectProgressChange}
                      />
                    }
                    sceneOverlayAnimating={effectPlaying}
                    sceneOverlayLabel={`${plan.effectBlocks.length - hiddenEffectIndexes.size} visible blocks`}
                    hostHiddenPreviewInstanceIds={hiddenPreviewInstanceIds}
                    hostInstanceTransformsRef={hostInstanceTransformsRef}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={28} minSize={22} className="min-h-0">
                  <EfxbnPreviewInspector
                    plan={plan}
                    progress={effectProgress}
                    selectedEffectIndex={selectedEffectIndex}
                    hiddenEffectIndexes={hiddenEffectIndexes}
                    onSelectEffect={setSelectedEffectIndex}
                    onSetEffectVisible={handleSetEffectVisible}
                    onShowAll={handleShowAllEffects}
                    onSolo={handleSoloEffect}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : (
              <div className="h-full min-h-0 p-1">
                <SsbhModelPreviewViewport embedded showTimeline={false} viewportControls="unreal" />
              </div>
            )}
          </SsbhModelPreviewProvider>
        </div>
      )}

      {hasDiagnosticBlocks ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/10 px-2 py-1.5">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setEffectPlaying((playing) => !playing)}
            aria-label={effectPlaying ? "Pause EFXBN control preview" : "Play EFXBN control preview"}
          >
            {effectPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => {
              setEffectPlaying(false);
              setEffectProgress(0);
            }}
            aria-label="Reset EFXBN control progress"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={effectProgress}
            onChange={(event) => {
              setEffectPlaying(false);
              setEffectProgress(Number(event.target.value));
            }}
            className="h-1.5 min-w-32 flex-1 cursor-pointer accent-primary"
            aria-label="EFXBN control progress"
          />
          <span className="w-11 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
            {Math.round((effectProgress / 100) * EFXBN_PREVIEW_FRAME_COUNT)}f
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-12 px-1 font-mono text-[10px]"
            onClick={() => setEffectSpeed((speed) => (speed >= 2 ? 0.5 : speed * 2))}
            aria-label={`EFXBN preview speed ${effectSpeed} times`}
          >
            {effectSpeed}x
          </Button>
        </div>
      ) : null}
    </section>
  );
}
