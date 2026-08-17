import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { Box, Pause, PersonStanding, Play, RotateCcw, X } from "lucide-react";
import type { Texture } from "three";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  SsbhModelPreviewProvider,
  useSsbhModelPreview,
} from "@/components/ssbh-model-preview/SsbhModelPreviewContext";
import { SsbhModelPreviewViewport } from "@/components/ssbh-model-preview/SsbhModelPreviewViewport";
import {
  previewInstanceGroupName,
  type PreviewInstanceHostTransform,
} from "@/components/ssbh-model-preview/SsbhModelCanvas";
import {
  patchEffectEfxbnControlConstants,
  type EffectFolderInventory,
  type EfxbnControlLookupEntry,
} from "@/services/effectFolder/effectFolderService";
import { EFFECT_FOLDER_COMMON_PACK_NAME } from "@/services/effectFolder/effectFolderCommonPack";
import { cn } from "@/lib/utils";
import type { EffectListItem } from "./effectFolderEditorUtils";
import {
  buildEffectFolderPreviewPlan,
  type EffectFolderPreviewPlan,
} from "./effectFolderPreviewPlan";
import {
  acceptWrittenPatches,
  createEfxbnDraft,
  efxbnDraftDirtyCount,
  isEfxbnDraftDirty,
  listControlConstantPatches,
  patchColorConstants,
  revertEfxbnDraft,
  sameEfxbnPath,
  type EfxbnDraftSession,
} from "./efxbnDraftSession";
import { EfxbnDiagnosticOverlay } from "./EfxbnDiagnosticOverlay";
import { EfxbnPreviewInspector } from "./EfxbnPreviewInspector";
import {
  getEffectFolderWorkspaceState,
  rememberEffectFolderHostModelPath,
} from "./effectFolderEditorSettings";
import {
  effectPreviewHostModelLabel,
  planEffectPreviewModelLoad,
} from "./effectPreviewHostModel";
import {
  EFXBN_PREVIEW_FRAME_COUNT,
  efxbnChildIndexes,
  findEfxbnParentBlocks,
  resolveEfxbnModelPoolPlan,
  resolveEfxbnPreviewFrameCount,
  type EfxbnModelPoolPlan,
} from "./efxbnSimulation";

type EffectFolder3dPreviewProps = {
  item: EffectListItem;
  inventory: EffectFolderInventory;
  /** True when the entry list is hidden, so the viewport can claim more height as well. */
  previewExpanded?: boolean;
  previewSuspended?: boolean;
  /** Called after a successful on-disk efxbn write so the parent can re-inspect. */
  onEfxbnWritten?: () => void;
};

function allowsAutomaticPreviewMotion(): boolean {
  return typeof window === "undefined" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function EffectFolderPreviewScene({
  plan,
  selectedEffectIndex,
  onInstanceMapChange,
  hostInstanceTransformsRef,
  modelPoolPlan,
  hostModelPath,
  onHostInstanceIdChange,
}: {
  plan: EffectFolderPreviewPlan;
  selectedEffectIndex: number | null;
  onInstanceMapChange: (mapping: ReadonlyMap<number, readonly string[]>) => void;
  hostInstanceTransformsRef: MutableRefObject<ReadonlyMap<string, PreviewInstanceHostTransform>>;
  modelPoolPlan: EfxbnModelPoolPlan | null;
  /** Opaque model the effect is played against; supplies the scene depth soft particles need. */
  hostModelPath: string | null;
  onHostInstanceIdChange: (instanceId: string | null) => void;
}) {
  const {
    loadModelSetAt,
    loadMotionNuanmbPathForInstance,
    requestCameraFit,
    setInstanceModelId,
    setActivePreviewInstanceId,
  } = useSsbhModelPreview();
  const loadedPlanKeyRef = useRef<string | null>(null);
  const instanceIdsByEffectIndexRef = useRef<Map<number, string[]>>(new Map());
  const selectedEffectIndexRef = useRef(selectedEffectIndex);
  selectedEffectIndexRef.current = selectedEffectIndex;
  const modelLoadSlots = useMemo(() => {
    if (plan.kind === "model") {
      return plan.targets.map((target) => ({ target, poolIndex: 0 }));
    }
    return plan.targets.flatMap((target) => {
      const capacity = target.effectIndex === null
        ? 1
        : (modelPoolPlan?.capacityByEffectIndex.get(target.effectIndex) ?? 0);
      return Array.from({ length: capacity }, (_, poolIndex) => ({ target, poolIndex }));
    });
  }, [modelPoolPlan, plan]);

  const loadPlan = useMemo(
    () => planEffectPreviewModelLoad(
      modelLoadSlots.map((slot) => slot.target.modelPath),
      hostModelPath,
    ),
    [hostModelPath, modelLoadSlots],
  );
  // The host is part of the model set, so swapping it has to reload just like a new effect does.
  const loadKey = `${plan.key}|host:${hostModelPath ?? ""}`;

  useEffect(() => {
    if (loadedPlanKeyRef.current === loadKey) return;
    loadedPlanKeyRef.current = loadKey;
    instanceIdsByEffectIndexRef.current = new Map();
    hostInstanceTransformsRef.current = new Map();
    onInstanceMapChange(new Map());
    onHostInstanceIdChange(null);
    let cancelled = false;

    if (loadPlan.paths.length === 0) {
      requestCameraFit();
      return;
    }

    void loadModelSetAt(loadPlan.paths)
      .then((instances) => {
        if (cancelled) return;
        instances.forEach((instance, index) => {
          const slot = modelLoadSlots[index];
          // The host is appended past the last effect slot and is driven by nothing.
          if (!slot) return;
          const { target } = slot;
          if (target.effectIndex !== null) {
            const ids = instanceIdsByEffectIndexRef.current.get(target.effectIndex) ?? [];
            ids.push(instance.id);
            instanceIdsByEffectIndexRef.current.set(target.effectIndex, ids);
          }
          if (slot.poolIndex === 0) setInstanceModelId(instance.id, target.modelHash.hex);
          if (target.animationPath) {
            loadMotionNuanmbPathForInstance(instance.id, target.animationPath);
          }
        });
        // Effect instances start hidden and are revealed per particle; the host must stay out of
        // this map entirely so the canvas leaves its own opaque materials alone.
        hostInstanceTransformsRef.current = new Map(
          instances.flatMap((instance, index) =>
            index === loadPlan.hostPathIndex
              ? []
              : [[
                  instance.id,
                  {
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                    visible: plan.kind === "model",
                  } satisfies PreviewInstanceHostTransform,
                ] as const],
          ),
        );
        onInstanceMapChange(new Map(instanceIdsByEffectIndexRef.current));
        onHostInstanceIdChange(
          loadPlan.hostPathIndex === null
            ? null
            : instances[loadPlan.hostPathIndex]?.id ?? null,
        );
        const selectedInstanceId =
          selectedEffectIndexRef.current === null
            ? null
            : instanceIdsByEffectIndexRef.current.get(selectedEffectIndexRef.current)?.[0];
        if (selectedInstanceId) setActivePreviewInstanceId(selectedInstanceId);
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
    loadKey,
    loadModelSetAt,
    loadMotionNuanmbPathForInstance,
    loadPlan,
    modelLoadSlots,
    plan.kind,
    onHostInstanceIdChange,
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

  return null;
}

export function EffectFolder3dPreview({
  item,
  inventory,
  previewExpanded = false,
  previewSuspended = false,
  onEfxbnWritten,
}: EffectFolder3dPreviewProps) {
  const basePlan = useMemo(() => buildEffectFolderPreviewPlan(item, inventory), [inventory, item]);
  const sourceSummary = item.category === "efxbn" ? item.item.efxbn ?? null : null;
  const [draft, setDraft] = useState<EfxbnDraftSession | null>(null);
  const [writing, setWriting] = useState(false);
  const draftRef = useRef<EfxbnDraftSession | null>(null);
  draftRef.current = draft;

  const efxbnPath = item.category === "efxbn" ? item.item.path : null;
  // Recreate the live draft when the focused file changes. Inventory reloads keep a dirty
  // draft so concurrent edits are not silently discarded.
  useEffect(() => {
    if (!sourceSummary || !efxbnPath) {
      setDraft(null);
      return;
    }
    setDraft((current) => {
      if (!current || !sameEfxbnPath(current.path, efxbnPath)) {
        try {
          return createEfxbnDraft(sourceSummary, efxbnPath);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : String(error));
          return null;
        }
      }
      if (isEfxbnDraftDirty(current)) {
        // Keep the inventory file path as the write target even if the draft was older.
        return sameEfxbnPath(current.path, efxbnPath) ? current : { ...current, path: efxbnPath };
      }
      try {
        return createEfxbnDraft(sourceSummary, efxbnPath);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        return current;
      }
    });
  }, [sourceSummary, efxbnPath]);

  // Structural plan for 3D (stable identity while colour drafts change).
  // Live curve values flow through controlLookupEntriesRef so R3F does not remount.
  const controlLookupEntriesRef = useRef<readonly EfxbnControlLookupEntry[]>(
    basePlan?.kind === "efxbn" ? basePlan.controlLookupEntries : [],
  );
  const draftCommitRafRef = useRef(0);

  // Inspector still needs draft values overlaid for evaluated control rows / colour UI.
  const plan = useMemo(() => {
    if (!basePlan || basePlan.kind !== "efxbn" || !draft) return basePlan;
    return {
      ...basePlan,
      controlLookupEntries: draft.controlLookupEntries,
    };
  }, [basePlan, draft]);

  useEffect(() => {
    if (draft) {
      controlLookupEntriesRef.current = draft.controlLookupEntries;
      return;
    }
    if (basePlan?.kind === "efxbn") {
      controlLookupEntriesRef.current = basePlan.controlLookupEntries;
    }
  }, [basePlan, draft]);

  useEffect(
    () => () => {
      if (draftCommitRafRef.current) {
        cancelAnimationFrame(draftCommitRafRef.current);
        draftCommitRafRef.current = 0;
      }
    },
    [],
  );

  const [effectProgress, setEffectProgress] = useState(0);
  const [effectPlaying, setEffectPlaying] = useState(false);
  const [effectSpeed, setEffectSpeed] = useState(1);
  const [selectedEffectIndex, setSelectedEffectIndex] = useState<number | null>(null);
  const [hiddenEffectIndexes, setHiddenEffectIndexes] = useState<Set<number>>(() => new Set());
  const [instanceIdsByEffectIndex, setInstanceIdsByEffectIndex] = useState<ReadonlyMap<number, readonly string[]>>(
    () => new Map(),
  );
  const hostInstanceTransformsRef = useRef<ReadonlyMap<string, PreviewInstanceHostTransform>>(new Map());
  // Scene context: an opaque model to play the effect against. Without it the scene has no
  // depth for a soft particle to fade against and no scale reference at all.
  const [hostModelPath, setHostModelPath] = useState<string | null>(null);
  const [hostInstanceId, setHostInstanceId] = useState<string | null>(null);
  const sceneDepthTextureRef = useRef<Texture | null>(null);
  // The playback window is the effect's own length, not a fixed 120 frames — see
  // `resolveEfxbnPreviewFrameCount`. Structural, so it never recomputes from colour draft identity.
  const frameCount = useMemo(
    () => (basePlan ? resolveEfxbnPreviewFrameCount(basePlan.effectBlocks) : EFXBN_PREVIEW_FRAME_COUNT),
    [basePlan],
  );
  // Pool capacity is structural too.
  const modelPoolPlan = useMemo(
    () => (basePlan?.kind === "efxbn" ? resolveEfxbnModelPoolPlan(basePlan, frameCount) : null),
    [basePlan, frameCount],
  );

  const handlePatchColor = useCallback(
    (blockIndex: number, color: { r?: number; g?: number; b?: number; a?: number }) => {
      // Freeze authoring while a disk write is in flight so the snapshot stays honest.
      if (writing) return;
      const current = draftRef.current;
      if (!current) return;
      try {
        const next = patchColorConstants(current, blockIndex, color);
        if (next === current) return;
        // 3D sim reads this ref on the next frame — no React re-render required.
        draftRef.current = next;
        controlLookupEntriesRef.current = next.controlLookupEntries;
        // Coalesce React state commits to at most once per animation frame so the
        // colour picker / sliders stay responsive while dirty badges still update.
        if (draftCommitRafRef.current) return;
        draftCommitRafRef.current = requestAnimationFrame(() => {
          draftCommitRafRef.current = 0;
          const pending = draftRef.current;
          if (pending) setDraft(pending);
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [writing],
  );

  const handleRevertDraft = useCallback(() => {
    setDraft((current) => {
      if (!current) return current;
      const next = revertEfxbnDraft(current);
      draftRef.current = next;
      controlLookupEntriesRef.current = next.controlLookupEntries;
      return next;
    });
  }, []);

  const handleWriteDraft = useCallback(async () => {
    if (writing) return;
    const live = draftRef.current;
    if (!live) {
      toast.error("No live EFXBN draft to write");
      return;
    }
    // Prefer the currently focused inventory path — it is the file the UI is showing.
    const writePath = (efxbnPath?.trim() || live.path).trim();
    if (!writePath) {
      toast.error("EFXBN file path is empty; cannot write");
      return;
    }

    let patches;
    try {
      patches = listControlConstantPatches(live);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return;
    }
    if (patches.length === 0) {
      toast.error("No dirty constant lanes to write", {
        description: "Change a colour channel first, then use Save EFXBN in the panel footer.",
      });
      return;
    }

    const dirtyCount = efxbnDraftDirtyCount(live);
    const confirmed = await confirm(
      `Write ${patches.length} control value${patches.length === 1 ? "" : "s"} (${dirtyCount} dirty lane${dirtyCount === 1 ? "" : "s"}) to disk?\n\n${writePath}`,
      {
        title: "Save EFXBN",
        kind: "warning",
        okLabel: "Save",
        cancelLabel: "Cancel",
      },
    );
    if (!confirmed) return;

    setWriting(true);
    try {
      const result = await patchEffectEfxbnControlConstants(writePath, patches);
      // Re-baseline only the written indices so concurrent edits during await stay dirty.
      setDraft((current) => {
        if (
          !current ||
          (!sameEfxbnPath(current.path, writePath) && !sameEfxbnPath(current.path, live.path))
        ) {
          return current;
        }
        const aligned = sameEfxbnPath(current.path, writePath)
          ? current
          : { ...current, path: writePath };
        const next = acceptWrittenPatches(aligned, patches);
        draftRef.current = next;
        controlLookupEntriesRef.current = next.controlLookupEntries;
        return next;
      });
      toast.success(
        `Wrote ${result.patchedCount} control value${result.patchedCount === 1 ? "" : "s"}`,
        { description: result.path || writePath },
      );
      onEfxbnWritten?.();
    } catch (error) {
      toast.error("Failed to write EFXBN", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setWriting(false);
    }
  }, [efxbnPath, onEfxbnWritten, writing]);
  const externalModelEffectCount = useMemo(() => {
    if (plan?.kind !== "efxbn") return 0;
    const localEffectIndexes = new Set(
      plan.targets.flatMap((target) => target.effectIndex === null ? [] : [target.effectIndex]),
    );
    return plan.effectBlocks.filter(
      (effect) => effect.modelHash.signed !== 0 && !localEffectIndexes.has(effect.index),
    ).length;
  }, [plan]);

  useEffect(() => {
    const firstEffectIndex = plan?.effectBlocks[0]?.index ?? null;
    setSelectedEffectIndex(firstEffectIndex);
    setHiddenEffectIndexes(new Set());
    setInstanceIdsByEffectIndex(new Map());
    hostInstanceTransformsRef.current = new Map();
    setEffectProgress(0);
    setEffectPlaying(firstEffectIndex !== null && allowsAutomaticPreviewMotion());
  }, [plan?.key]);

  // Restore the workspace's host model. A stored path that is no longer a .numdlb is reported
  // rather than dropped, so a hand-edited store never silently loses the setting.
  useEffect(() => {
    let cancelled = false;
    void getEffectFolderWorkspaceState(inventory.effectRoot)
      .then((state) => {
        if (cancelled) return;
        const stored = state?.hostModelPath ?? null;
        if (stored && !/\.numdlb$/i.test(stored)) {
          toast.error("Stored host model is not a .numdlb file", { description: stored });
          return;
        }
        setHostModelPath(stored);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast.error("Failed to read the stored host model", {
          description: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [inventory.effectRoot]);

  const handlePickHostModel = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      filters: [{ name: "NUMDLB", extensions: ["numdlb"] }],
    });
    if (typeof selected !== "string") return;
    setHostModelPath(selected);
    try {
      await rememberEffectFolderHostModelPath(inventory.effectRoot, selected);
    } catch (error) {
      toast.error("Failed to remember the host model", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [inventory.effectRoot]);

  const handleClearHostModel = useCallback(async () => {
    setHostModelPath(null);
    try {
      await rememberEffectFolderHostModelPath(inventory.effectRoot, null);
    } catch (error) {
      toast.error("Failed to clear the host model", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [inventory.effectRoot]);

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
      // Solo keeps the block plus its direct neighbours in the block tree.
      if (selectedBlock) {
        for (const childIndex of efxbnChildIndexes(selectedBlock)) keep.add(childIndex);
      }
      for (const parent of findEfxbnParentBlocks(plan?.effectBlocks ?? [], effectIndex)) {
        keep.add(parent.index);
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
  const sharedResourceCount = plan.commonModelCount + plan.commonTextureCount;
  const unresolvedModelList = plan.unresolvedModelHashes
    .slice(0, 3)
    .map((hash) => hash.hex)
    .join(", ");
  const previewCounts = [
    hasDiagnosticBlocks ? `${plan.effectBlocks.length} blocks` : null,
    plan.targets.length > 0 ? `${plan.targets.length} models` : null,
    plan.localTextureCount > 0 ? `${plan.localTextureCount} textures` : null,
    sharedResourceCount > 0 ? `${sharedResourceCount} from ${EFFECT_FOLDER_COMMON_PACK_NAME}` : null,
  ].filter(Boolean).join(" · ");
  const previewDiagnostics = [
    modelPoolPlan?.truncated
      ? `Model pool capped at ${modelPoolPlan.totalCapacity}/${modelPoolPlan.totalRequired} instances across ${modelPoolPlan.limitedEffectCount} effects.`
      : null,
    externalModelEffectCount > 0
      ? `${externalModelEffectCount} block${externalModelEffectCount === 1 ? "" : "s"} bind a model that resolved in neither this pack nor ${EFFECT_FOLDER_COMMON_PACK_NAME}` +
        `${unresolvedModelList ? ` (${unresolvedModelList})` : ""}, so a flat proxy quad is drawn instead of the real mesh.`
      : null,
  ].filter((message): message is string => message !== null);
  return (
    <section className="space-y-2" aria-label={plan.kind === "efxbn" ? "EFXBN 3D preview" : "Model 3D preview"}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="mr-auto text-xs font-medium">Preview</h4>
        {previewCounts ? <span className="text-[10px] tabular-nums text-muted-foreground">{previewCounts}</span> : null}
      </div>
      {previewDiagnostics.length > 0 ? (
        <p className="text-[10px] text-amber-600 dark:text-amber-400" role="status">
          {previewDiagnostics.join(" ")}
        </p>
      ) : null}

      {!hasRenderableScene ? (
        <div className="flex min-h-32 flex-col items-center justify-center rounded-md border border-dashed bg-muted/10 px-4 text-center">
          <Box className="mb-2 h-6 w-6 text-muted-foreground/60" aria-hidden />
          <p className="text-xs text-muted-foreground">No preview data.</p>
        </div>
      ) : (
        <div
          className={cn(
            "min-h-[460px] overflow-hidden rounded-md border bg-muted/5",
            previewExpanded ? "h-[min(80vh,900px)]" : "h-[min(64vh,620px)]",
          )}
        >
          <SsbhModelPreviewProvider
            key={plan.key}
            workspaceRoot={inventory.effectRoot}
            previewSuspended={previewSuspended}
            defaultLightingPreset="softCharacter"
          >
            <EffectFolderPreviewScene
              plan={basePlan ?? plan}
              selectedEffectIndex={selectedEffectIndex}
              onInstanceMapChange={setInstanceIdsByEffectIndex}
              hostInstanceTransformsRef={hostInstanceTransformsRef}
              modelPoolPlan={modelPoolPlan}
              hostModelPath={hostModelPath}
              onHostInstanceIdChange={setHostInstanceId}
            />
            {hasDiagnosticBlocks && basePlan?.kind === "efxbn" ? (
              <ResizablePanelGroup orientation="horizontal" className="min-h-0">
                <ResizablePanel defaultSize={72} minSize={50} className="min-h-0 p-1">
                  <SsbhModelPreviewViewport
                    embedded
                    showTimeline={basePlan.localAnimationCount > 0}
                    viewportControls="unreal"
                    sceneOverlay={
                      <EfxbnDiagnosticOverlay
                        plan={basePlan}
                        controlLookupEntriesRef={controlLookupEntriesRef}
                        progress={effectProgress}
                        frameCount={frameCount}
                        playing={effectPlaying}
                        speed={effectSpeed}
                        selectedEffectIndex={selectedEffectIndex}
                        hiddenEffectIndexes={hiddenEffectIndexes}
                        instanceIdsByEffectIndex={instanceIdsByEffectIndex}
                        modelRequirements={modelPoolPlan?.requirements ?? []}
                        hostInstanceTransformsRef={hostInstanceTransformsRef}
                        onSelectEffect={setSelectedEffectIndex}
                        onProgressChange={handleEffectProgressChange}
                      />
                    }
                    sceneOverlayAnimating={effectPlaying}
                    sceneOverlayLabel={`${basePlan.effectBlocks.length - hiddenEffectIndexes.size} visible blocks`}
                    hostHiddenPreviewInstanceIds={hiddenPreviewInstanceIds}
                    hostInstanceTransformsRef={hostInstanceTransformsRef}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={28} minSize={22} className="min-h-0">
                  <EfxbnPreviewInspector
                    plan={plan ?? basePlan}
                    progress={effectProgress}
                    selectedEffectIndex={selectedEffectIndex}
                    hiddenEffectIndexes={hiddenEffectIndexes}
                    onSelectEffect={setSelectedEffectIndex}
                    onSetEffectVisible={handleSetEffectVisible}
                    onShowAll={handleShowAllEffects}
                    onSolo={handleSoloEffect}
                    draft={draft}
                    writing={writing}
                    onPatchColor={draft ? handlePatchColor : undefined}
                    onRevertDraft={draft ? handleRevertDraft : undefined}
                    onWriteDraft={draft ? () => void handleWriteDraft() : undefined}
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
            {Math.round((effectProgress / 100) * frameCount)}f / {frameCount}f
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
