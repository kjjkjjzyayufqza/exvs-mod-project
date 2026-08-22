import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { Box, Pause, PersonStanding, Play, RotateCcw, X } from "lucide-react";
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
  writeEffectEfxbnFile,
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
  acceptEfxbnDocumentWrite,
  canRedoEfxbn,
  canUndoEfxbn,
  createEfxbnDocument,
  isEfxbnDocumentDirty,
  prepareEfxbnDocumentForWrite,
  redoEfxbn,
  revertEfxbnDocument,
  undoEfxbn,
  type EfxbnControlName,
  type EfxbnDocument,
} from "./efxbnDocument";
import { EfxbnDiagnosticOverlay } from "./EfxbnDiagnosticOverlay";
import { EfxbnGraphEditor } from "./EfxbnGraphEditor";
import { EfxbnPreviewInspector } from "./EfxbnPreviewInspector";
import {
  createLatestAnimationFrameScheduler,
  reduceEfxbnTransport,
  type EfxbnTransportAction,
} from "./efxbnProgressScrub";
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

function EfxbnPlaybackTransport({
  progress,
  playing,
  frameCount,
  speed,
  onTogglePlaying,
  onReset,
  onCycleSpeed,
  onScrubStart,
  onScrub,
  onScrubEnd,
}: {
  progress: number;
  playing: boolean;
  frameCount: number;
  speed: number;
  onTogglePlaying: () => void;
  onReset: () => void;
  onCycleSpeed: () => void;
  onScrubStart: () => void;
  onScrub: (progress: number) => void;
  onScrubEnd: (progress: number) => void;
}) {
  const draggingRef = useRef(false);
  const draftRef = useRef(progress);
  const [draft, setDraft] = useState(progress);

  useEffect(() => {
    if (playing) draggingRef.current = false;
    if (draggingRef.current) return;
    draftRef.current = progress;
    setDraft(progress);
  }, [playing, progress]);

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-t bg-muted/15 px-3">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={onTogglePlaying}
        aria-label={playing ? "Pause EFXBN control preview" : "Play EFXBN control preview"}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        onClick={onReset}
        aria-label="Reset EFXBN control progress"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
      <input
        type="range"
        min={0}
        max={100}
        step={0.1}
        value={draft}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          draggingRef.current = true;
          onScrubStart();
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          draggingRef.current = false;
          onScrubEnd(draftRef.current);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
          onScrubEnd(draftRef.current);
        }}
        onChange={(event) => {
          const next = Number(event.target.value);
          draftRef.current = next;
          setDraft(next);
          onScrub(next);
        }}
        className="h-1.5 min-w-32 flex-1 cursor-pointer accent-primary"
        aria-label="EFXBN control progress"
      />
      <span className="w-24 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {Math.round((draft / 100) * frameCount)}f / {frameCount}f
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-12 px-1 font-mono text-[11px]"
        onClick={onCycleSpeed}
        aria-label={`EFXBN preview speed ${speed} times`}
      >
        {speed}x
      </Button>
    </div>
  );
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
  const loadRequestRef = useRef({
    loadModelSetAt,
    loadMotionNuanmbPathForInstance,
    requestCameraFit,
    setInstanceModelId,
    setActivePreviewInstanceId,
    loadPlan,
    modelLoadSlots,
    planKind: plan.kind,
    onInstanceMapChange,
    onHostInstanceIdChange,
  });
  loadRequestRef.current = {
    loadModelSetAt,
    loadMotionNuanmbPathForInstance,
    requestCameraFit,
    setInstanceModelId,
    setActivePreviewInstanceId,
    loadPlan,
    modelLoadSlots,
    planKind: plan.kind,
    onInstanceMapChange,
    onHostInstanceIdChange,
  };

  useEffect(() => {
    const request = loadRequestRef.current;
    instanceIdsByEffectIndexRef.current = new Map();
    hostInstanceTransformsRef.current = new Map();
    request.onInstanceMapChange(new Map());
    request.onHostInstanceIdChange(null);
    let cancelled = false;

    if (request.loadPlan.paths.length === 0) {
      request.requestCameraFit();
      return;
    }

    void request.loadModelSetAt(request.loadPlan.paths)
      .then((instances) => {
        if (cancelled) return;
        instances.forEach((instance, index) => {
          const slot = request.modelLoadSlots[index];
          // The host is appended past the last effect slot and is driven by nothing.
          if (!slot) return;
          const { target } = slot;
          if (target.effectIndex !== null) {
            const ids = instanceIdsByEffectIndexRef.current.get(target.effectIndex) ?? [];
            ids.push(instance.id);
            instanceIdsByEffectIndexRef.current.set(target.effectIndex, ids);
          }
          if (slot.poolIndex === 0) request.setInstanceModelId(instance.id, target.modelHash.hex);
          if (target.animationPath) {
            request.loadMotionNuanmbPathForInstance(instance.id, target.animationPath);
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
                    visible: request.planKind === "model",
                  } satisfies PreviewInstanceHostTransform,
                ] as const],
          ),
        );
        request.onInstanceMapChange(new Map(instanceIdsByEffectIndexRef.current));
        request.onHostInstanceIdChange(
          request.loadPlan.hostPathIndex === null
            ? null
            : instances[request.loadPlan.hostPathIndex]?.id ?? null,
        );
        const selectedInstanceId =
          selectedEffectIndexRef.current === null
            ? null
            : instanceIdsByEffectIndexRef.current.get(selectedEffectIndexRef.current)?.[0];
        if (selectedInstanceId) request.setActivePreviewInstanceId(selectedInstanceId);
        request.requestCameraFit();
      })
      .catch(() => {
        // The shared preview surface owns the actionable load error.
      });

    return () => {
      cancelled = true;
      hostInstanceTransformsRef.current = new Map();
    };
  }, [hostInstanceTransformsRef, loadKey]);

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
  const sourceSummary = item.category === "efxbn" ? item.item.efxbn ?? null : null;
  const efxbnPath = item.category === "efxbn" ? item.item.path : null;
  const [document, setDocument] = useState<EfxbnDocument | null>(null);
  const [writing, setWriting] = useState(false);
  const documentRef = useRef<EfxbnDocument | null>(null);
  documentRef.current = document;
  const previewDocument = useDeferredValue(document);

  // Recreate the document when the focused file changes. An inventory reload keeps a dirty
  // document so concurrent edits are not silently discarded.
  useEffect(() => {
    if (!sourceSummary || !efxbnPath) {
      setDocument(null);
      return;
    }
    setDocument((current) => {
      if (current && current.path === efxbnPath && isEfxbnDocumentDirty(current)) return current;
      try {
        return createEfxbnDocument(sourceSummary, efxbnPath, inventory.effectRoot);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        return null;
      }
    });
  }, [sourceSummary, efxbnPath, inventory.effectRoot]);

  // The preview renders the document, not the last thing read from disk, so an edit is visible
  // immediately. `planKey` is built from the resolved model set, so a scalar or curve edit reuses
  // the same key and the R3F scene is updated rather than remounted; rebinding a model changes
  // the target list, which is exactly when a reload is wanted.
  const basePlan = useMemo(
    () => buildEffectFolderPreviewPlan(item, inventory, previewDocument?.summary ?? null),
    [inventory, item, previewDocument],
  );
  const plan = basePlan;

  // The particle layers read live curve values off this ref every frame, so dragging a value does
  // not have to wait for React to re-render the R3F tree.
  const controlLookupEntriesRef = useRef<readonly EfxbnControlLookupEntry[]>(
    basePlan?.kind === "efxbn" ? basePlan.controlLookupEntries : [],
  );
  useEffect(() => {
    if (basePlan?.kind === "efxbn") controlLookupEntriesRef.current = basePlan.controlLookupEntries;
  }, [basePlan]);

  const [transport, dispatchTransport] = useReducer(reduceEfxbnTransport, {
    progress: 0,
    playing: false,
    scrubbing: false,
  });
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const effectProgressRef = useRef(0);
  const effectPlayingRef = useRef(false);
  const commitTransport = useCallback((action: EfxbnTransportAction) => {
    if (action.type === "togglePlay" && effectPlayingRef.current) {
      const snapped = reduceEfxbnTransport(transportRef.current, {
        type: "setProgress",
        progress: effectProgressRef.current,
      });
      transportRef.current = snapped;
      dispatchTransport({ type: "setProgress", progress: effectProgressRef.current });
    }
    const next = reduceEfxbnTransport(transportRef.current, action);
    transportRef.current = next;
    effectPlayingRef.current = next.playing;
    if (action.type === "scrubTo" || action.type === "scrubEnd" || action.type === "reset" || action.type === "load") {
      effectProgressRef.current = next.progress;
    }
    dispatchTransport(action);
  }, []);
  const uiProgressSchedulerRef = useRef(
    createLatestAnimationFrameScheduler((value: number) => {
      dispatchTransport({ type: "setProgress", progress: value });
    }),
  );
  const [effectSpeed, setEffectSpeed] = useState(1);
  const [selectedEffectIndex, setSelectedEffectIndex] = useState<number | null>(null);
  const [graphControlName, setGraphControlName] = useState<EfxbnControlName>("colorR");
  const [hiddenEffectIndexes, setHiddenEffectIndexes] = useState<Set<number>>(() => new Set());
  const [instanceIdsByEffectIndex, setInstanceIdsByEffectIndex] = useState<ReadonlyMap<number, readonly string[]>>(
    () => new Map(),
  );
  const hostInstanceTransformsRef = useRef<ReadonlyMap<string, PreviewInstanceHostTransform>>(new Map());
  // Scene context: an opaque model to play the effect against. Without it the scene has no
  // depth for a soft particle to fade against and no scale reference at all.
  const [hostModelPath, setHostModelPath] = useState<string | null>(null);
  const [hostInstanceId, setHostInstanceId] = useState<string | null>(null);
  // The playback window is the effect's own length, not a fixed 120 frames — see
  // `resolveEfxbnPreviewFrameCount`.
  const frameCount = useMemo(
    () => (basePlan ? resolveEfxbnPreviewFrameCount(basePlan.effectBlocks) : EFXBN_PREVIEW_FRAME_COUNT),
    [basePlan],
  );
  // Pool capacity is structural too.
  const modelPoolPlan = useMemo(
    () => (basePlan?.kind === "efxbn" ? resolveEfxbnModelPoolPlan(basePlan, frameCount) : null),
    [basePlan, frameCount],
  );

  const handleDocumentChange = useCallback((next: EfxbnDocument) => {
    documentRef.current = next;
    controlLookupEntriesRef.current = next.summary.controlLookupEntries;
    setDocument(next);
  }, []);

  const handleEditorError = useCallback((message: string) => {
    toast.error(message);
  }, []);

  const handleRevertDocument = useCallback(() => {
    const current = documentRef.current;
    if (!current) return;
    handleDocumentChange(revertEfxbnDocument(current));
  }, [handleDocumentChange]);

  const handleUndo = useCallback(() => {
    const current = documentRef.current;
    if (!current || !canUndoEfxbn(current)) return;
    handleDocumentChange(undoEfxbn(current));
  }, [handleDocumentChange]);

  const handleRedo = useCallback(() => {
    const current = documentRef.current;
    if (!current || !canRedoEfxbn(current)) return;
    handleDocumentChange(redoEfxbn(current));
  }, [handleDocumentChange]);

  const handleWriteDocument = useCallback(async () => {
    if (writing) return;
    const live = documentRef.current;
    if (!live) {
      toast.error("No EFXBN document is open");
      return;
    }
    if (!isEfxbnDocumentDirty(live)) {
      toast.error("Nothing to save", {
        description: "Change a field, a curve, a resource binding or the block tree first.",
      });
      return;
    }

    // Recompact the key table and prove the tree, the counts and curve exclusivity BEFORE the
    // confirmation dialog, so a document a command corrupted never reaches the disk and the user
    // is not asked to approve a write that is going to fail.
    let payload;
    try {
      payload = prepareEfxbnDocumentForWrite(live);
    } catch (error) {
      toast.error("EFXBN document failed validation", {
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const changes = live.changeLog.slice(-8);
    const more = live.changeLog.length - changes.length;
    const confirmed = await confirm(
      `Rewrite ${payload.effects.length} block${payload.effects.length === 1 ? "" : "s"} and ` +
        `${payload.controlLookupEntries.length} curve key${payload.controlLookupEntries.length === 1 ? "" : "s"}?\n\n` +
        `${live.path}\n\n` +
        `${changes.map((entry) => `• ${entry}`).join("\n")}` +
        `${more > 0 ? `\n… and ${more} earlier change${more === 1 ? "" : "s"}` : ""}`,
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
      const result = await writeEffectEfxbnFile(live.effectRoot, live.path, payload);
      // Re-baseline from what the backend read back off disk, not from what we believed we wrote.
      setDocument((current) => {
        if (!current || current.path !== live.path) return current;
        const next = acceptEfxbnDocumentWrite(current, result.summary);
        documentRef.current = next;
        return next;
      });
      toast.success(`Wrote ${result.byteLen} bytes`, { description: result.path });
      onEfxbnWritten?.();
    } catch (error) {
      toast.error("Failed to write EFXBN", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setWriting(false);
    }
  }, [onEfxbnWritten, writing]);
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
    commitTransport({
      type: "load",
      autoPlay: firstEffectIndex !== null && allowsAutomaticPreviewMotion(),
    });
  }, [commitTransport, plan?.key]);

  useEffect(() => {
    setGraphControlName("colorR");
  }, [selectedEffectIndex, efxbnPath]);

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
    effectProgressRef.current = progress;
    dispatchTransport({ type: "setProgress", progress });
  }, []);
  const handleManualEffectProgressChange = useCallback((progress: number) => {
    effectProgressRef.current = progress;
    dispatchTransport({ type: "setProgress", progress });
  }, []);
  const handleScrubStart = useCallback(() => {
    commitTransport({ type: "scrubStart" });
  }, [commitTransport]);
  const handleTransportScrub = useCallback((progress: number) => {
    effectProgressRef.current = progress;
    uiProgressSchedulerRef.current.schedule(progress);
  }, []);
  const handleScrubEnd = useCallback((progress: number) => {
    uiProgressSchedulerRef.current.cancel();
    commitTransport({ type: "scrubEnd", progress });
  }, [commitTransport]);
  const handleGraphScrubbingChange = useCallback((active: boolean) => {
    if (active) commitTransport({ type: "scrubStart" });
    else commitTransport({ type: "scrubEnd", progress: effectProgressRef.current });
  }, [commitTransport]);
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
  const isEfxbnWorkspace = hasDiagnosticBlocks && basePlan?.kind === "efxbn";
  const inspectorSharedProps = {
    plan,
    progress: transport.progress,
    selectedEffectIndex,
    hiddenEffectIndexes,
    onSelectEffect: setSelectedEffectIndex,
    onSetEffectVisible: handleSetEffectVisible,
    onShowAll: handleShowAllEffects,
    onSolo: handleSoloEffect,
    document,
    inventory,
    frameCount,
    writing,
    focusedControlName: graphControlName,
    onFocusedControlNameChange: setGraphControlName,
    onDocumentChange: handleDocumentChange,
    onEditorError: handleEditorError,
    onRevert: document ? handleRevertDocument : undefined,
    onUndo: document ? handleUndo : undefined,
    onRedo: document ? handleRedo : undefined,
    onWrite: document ? () => void handleWriteDocument() : undefined,
  };

  return (
    <section
      className={cn("flex min-h-0 flex-col", isEfxbnWorkspace ? "h-full min-h-0 flex-1 gap-0" : "space-y-2")}
      aria-label={plan.kind === "efxbn" ? "EFXBN 3D preview" : "Model 3D preview"}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-muted/15 px-3">
        <PersonStanding className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">Host model</span>
        <span
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground"
          title={hostModelPath ?? undefined}
        >
          {hostModelPath ? effectPreviewHostModelLabel(hostModelPath) : "none - soft particles cannot fade"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 shrink-0 px-2.5 text-[11px]"
          onClick={() => void handlePickHostModel()}
        >
          {hostModelPath ? "Change" : "Choose .numdlb"}
        </Button>
        {hostModelPath ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => void handleClearHostModel()}
            aria-label="Remove the host model from the preview scene"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        {previewCounts ? (
          <span className="hidden shrink-0 text-[11px] tabular-nums text-muted-foreground lg:inline">
            {previewCounts}
          </span>
        ) : null}
      </div>
      {previewDiagnostics.length > 0 ? (
        <p className="shrink-0 border-b px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-400" role="status">
          {previewDiagnostics.join(" ")}
        </p>
      ) : null}

      {!hasRenderableScene ? (
        <div className="flex min-h-32 flex-1 flex-col items-center justify-center rounded-md border border-dashed bg-muted/10 px-4 text-center">
          <Box className="mb-2 h-6 w-6 text-muted-foreground/60" aria-hidden />
          <p className="text-xs text-muted-foreground">No preview data.</p>
        </div>
      ) : (
        <div
          className={cn(
            "min-h-0 overflow-hidden bg-muted/5",
            isEfxbnWorkspace
              ? "h-full min-h-0 flex-1"
              : cn("min-h-[460px] rounded-md border", previewExpanded ? "h-[min(80vh,900px)]" : "h-[min(64vh,620px)]"),
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
            {isEfxbnWorkspace && basePlan?.kind === "efxbn" ? (
              <ResizablePanelGroup orientation="vertical" className="h-full min-h-0">
                <ResizablePanel defaultSize={62} minSize={40} className="min-h-0">
                  <ResizablePanelGroup orientation="horizontal" className="min-h-0">
                    <ResizablePanel defaultSize={22} minSize={16} className="min-h-0 border-r">
                      <EfxbnPreviewInspector pane="outliner" {...inspectorSharedProps} />
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={50} minSize={34} className="min-h-0 px-1 pt-1">
                      <SsbhModelPreviewViewport
                        embedded
                        showTimeline={false}
                        viewportControls="unreal"
                        sceneOverlay={
                          <EfxbnDiagnosticOverlay
                            plan={basePlan}
                            controlLookupEntriesRef={controlLookupEntriesRef}
                            progress={transport.progress}
                            progressRef={effectProgressRef}
                            frameCount={frameCount}
                            playing={transport.playing}
                            playingRef={effectPlayingRef}
                            speed={effectSpeed}
                            selectedEffectIndex={selectedEffectIndex}
                            hiddenEffectIndexes={hiddenEffectIndexes}
                            instanceIdsByEffectIndex={instanceIdsByEffectIndex}
                            modelRequirements={modelPoolPlan?.requirements ?? []}
                            hostInstanceTransformsRef={hostInstanceTransformsRef}
                            hostObjectName={hostInstanceId ? previewInstanceGroupName(hostInstanceId) : null}
                            onSelectEffect={setSelectedEffectIndex}
                            onProgressChange={handleEffectProgressChange}
                          />
                        }
                        sceneOverlayAnimating={true}
                        sceneOverlayLabel={`${basePlan.effectBlocks.length - hiddenEffectIndexes.size} visible blocks`}
                        hostHiddenPreviewInstanceIds={hiddenPreviewInstanceIds}
                        hostInstanceTransformsRef={hostInstanceTransformsRef}
                      />
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={28} minSize={22} className="min-h-0 border-l">
                      <EfxbnPreviewInspector pane="properties" {...inspectorSharedProps} />
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel
                  defaultSize={38}
                  minSize={24}
                  collapsible
                  collapsedSize={8}
                  className="min-h-0 border-t"
                >
                  {document && selectedEffectIndex !== null ? (
                    <EfxbnGraphEditor
                      document={document}
                      blockIndex={selectedEffectIndex}
                      progress={transport.progress}
                      frameCount={frameCount}
                      writing={writing}
                      focusedControlName={graphControlName}
                      onFocusedControlNameChange={setGraphControlName}
                      onProgressChange={handleManualEffectProgressChange}
                      onScrubbingChange={handleGraphScrubbingChange}
                      onDocumentChange={handleDocumentChange}
                      onError={handleEditorError}
                    />
                  ) : (
                    <p className="flex h-full items-center justify-center px-4 text-xs text-muted-foreground">
                      Select a block to edit its curves.
                    </p>
                  )}
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
        <EfxbnPlaybackTransport
          progress={transport.progress}
          playing={transport.playing}
          frameCount={frameCount}
          speed={effectSpeed}
          onTogglePlaying={() => commitTransport({ type: "togglePlay" })}
          onReset={() => {
            uiProgressSchedulerRef.current.cancel();
            commitTransport({ type: "reset" });
          }}
          onCycleSpeed={() => setEffectSpeed((speed) => (speed >= 2 ? 0.5 : speed * 2))}
          onScrubStart={handleScrubStart}
          onScrub={handleTransportScrub}
          onScrubEnd={handleScrubEnd}
        />
      ) : null}
    </section>
  );
}
