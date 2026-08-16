import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { DoubleSide, type Texture } from "three";
import type { PreviewInstanceHostTransform } from "@/components/ssbh-model-preview/SsbhModelCanvas";
import { useSsbhModelPreview } from "@/components/ssbh-model-preview/SsbhModelPreviewContext";
import { applyLocalPoseToObjects, createGpuSkeletonRuntime, updateGpuSkeletonWorld } from "@/components/ssbh-model-preview/boneRuntime";
import { sampleMotionClipFrame } from "@/components/ssbh-model-preview/motionPlaybackMath";
import type { SkelDataJson } from "@/components/ssbh-model-preview/types";
import {
  evaluateEfxbnUvTransform,
  resolveEfxbnColorMapBinding,
  resolveEfxbnUvOffsetMapBinding,
  type EffectFolderPreviewPlan,
} from "./effectFolderPreviewPlan";
import type { EfxbnControlLookupEntry } from "@/services/effectFolder/effectFolderService";
import {
  EFXBN_BLEND_STATE_ADD_MIX,
  EfxbnParticlePreview,
  threeBlendState,
  threeSideForEfxbnCullingType,
  useEfxbnTexture,
  usesEfxbnBorderAddressing,
} from "./EfxbnParticlePreview";
import { EfxbnStripPreview } from "./EfxbnStripPreview";
import {
  bindEfxbnModelInstanceSlots,
  EFXBN_PREVIEW_FPS,
  isEfxbnEmitterBlock,
  simulateEfxbnEmitterPair,
  type EfxbnModelPoolRequirement,
  efxbnRuntime,
  DRAW_SCHEME_FULL_BRIGHTNESS,
} from "./efxbnSimulation";
import { extractEfxbnMeshEmitterPoints, type EfxbnMeshEmitterPoint } from "./efxbnMeshEmitter";

type EfxbnDiagnosticOverlayProps = {
  plan: EffectFolderPreviewPlan;
  /**
   * Live control-lookup values for the simulation. Updated without React re-renders so
   * colour authoring does not rebuild the R3F tree on every pointer move.
   */
  controlLookupEntriesRef: MutableRefObject<readonly EfxbnControlLookupEntry[]>;
  progress: number;
  /** Playback window in frames, derived from the effect's own length. */
  frameCount: number;
  playing: boolean;
  speed: number;
  selectedEffectIndex: number | null;
  hiddenEffectIndexes: ReadonlySet<number>;
  instanceIdsByEffectIndex: ReadonlyMap<number, readonly string[]>;
  modelRequirements: readonly EfxbnModelPoolRequirement[];
  hostInstanceTransformsRef: MutableRefObject<ReadonlyMap<string, PreviewInstanceHostTransform>>;
  onSelectEffect: (effectIndex: number) => void;
  onProgressChange: (progress: number) => void;
};

const EMPTY_SLOT_MAP: ReadonlyMap<number, number> = new Map();

function livePlanFromRef(
  plan: EffectFolderPreviewPlan,
  controlLookupEntriesRef: MutableRefObject<readonly EfxbnControlLookupEntry[]>,
): EffectFolderPreviewPlan {
  const entries = controlLookupEntriesRef.current;
  if (entries === plan.controlLookupEntries) return plan;
  return { ...plan, controlLookupEntries: entries };
}

function EfxbnModelTextureRegistration({
  effectIndex,
  path,
  addressMode,
  texturesRef,
}: {
  effectIndex: number;
  path: string;
  addressMode: number;
  texturesRef: MutableRefObject<Map<number, Texture>>;
}) {
  const texture = useEfxbnTexture(path, addressMode);
  useEffect(() => {
    if (!texture) return;
    texturesRef.current.set(effectIndex, texture);
    return () => {
      if (texturesRef.current.get(effectIndex) === texture) texturesRef.current.delete(effectIndex);
    };
  }, [effectIndex, texture, texturesRef]);
  return null;
}

function EfxbnMeshEmitterRegistration({
  effectIndex,
  instanceId,
  requestedCount,
  frameCount,
  progressRef,
  pointsRef,
}: {
  effectIndex: number;
  instanceId: string;
  requestedCount: number;
  frameCount: number;
  progressRef: MutableRefObject<number>;
  pointsRef: MutableRefObject<Map<number, readonly EfxbnMeshEmitterPoint[]>>;
}) {
  const { draws, previewInstances, motionStatesByInstanceId } = useSsbhModelPreview();
  const instance = previewInstances.find((candidate) => candidate.id === instanceId);
  const skeleton = instance?.bundle.skel as SkelDataJson | null | undefined;
  const runtime = useMemo(
    () => skeleton?.bones?.length ? createGpuSkeletonRuntime(skeleton) : null,
    [skeleton],
  );
  useEffect(() => () => {
    pointsRef.current.delete(effectIndex);
  }, [effectIndex, pointsRef]);

  useFrame(() => {
    const motionState = motionStatesByInstanceId.get(instanceId);
    let boneMatrices: Float32Array | null = null;
    if (runtime) {
      if (motionState?.poseEnabled && motionState.clip) {
        const frame = (progressRef.current / 100) * frameCount;
        const sample = sampleMotionClipFrame(motionState.clip, frame, motionState.loop);
        if (sample.boneLocals.length === runtime.bones.length) {
          applyLocalPoseToObjects(runtime.bones, sample.boneLocals);
        }
      }
      updateGpuSkeletonWorld(runtime);
      runtime.skeleton.update();
      boneMatrices = runtime.skeleton.boneMatrices;
    }
    pointsRef.current.set(
      effectIndex,
      extractEfxbnMeshEmitterPoints(draws, instanceId, requestedCount, boneMatrices),
    );
  }, -2);
  return null;
}

function EmitterShape({
  block,
  selected,
  onSelect,
}: {
  block: EffectFolderPreviewPlan["effectBlocks"][number];
  selected: boolean;
  onSelect: () => void;
}) {
  const radius = Math.max(0.01, Math.abs(block.spawnFormLength[0]));
  return (
    <mesh
      position={[block.positionOffset[0], block.positionOffset[1], block.positionOffset[2]]}
      rotation={block.spawnFormType === 3 ? [-Math.PI / 2, 0, 0] : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      {block.spawnFormType === 3 ? (
        <ringGeometry args={[Math.max(0.001, radius - 0.008), radius + 0.008, 64]} />
      ) : block.spawnFormType === 4 || block.spawnFormType === 8 ? (
        <boxGeometry
          args={[
            Math.max(0.02, Math.abs(block.spawnFormLength[0])),
            Math.max(0.02, Math.abs(block.spawnFormLength[1])),
            Math.max(0.02, Math.abs(block.spawnFormLength[2])),
          ]}
        />
      ) : (
        <sphereGeometry args={[0.025, 12, 8]} />
      )}
      <meshBasicMaterial
        color={selected ? "#fbbf24" : "#64748b"}
        wireframe={block.spawnFormType === 4 || block.spawnFormType === 8}
        transparent
        opacity={selected ? 0.9 : 0.38}
        side={DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export function EfxbnDiagnosticOverlay({
  plan,
  controlLookupEntriesRef,
  progress,
  frameCount,
  playing,
  speed,
  selectedEffectIndex,
  hiddenEffectIndexes,
  instanceIdsByEffectIndex,
  modelRequirements,
  hostInstanceTransformsRef,
  onSelectEffect,
  onProgressChange,
}: EfxbnDiagnosticOverlayProps) {
  const progressRef = useRef(progress);
  const lastUiUpdateRef = useRef(0);
  const onProgressChangeRef = useRef(onProgressChange);
  const modelEffectTexturePaths = useMemo(() => new Map(
    modelRequirements.flatMap((requirement) => {
      const binding = resolveEfxbnColorMapBinding(plan, requirement.pair.target.index);
      return binding?.file
        ? [[requirement.pair.target.index, {
            path: binding.file.path,
            addressMode: binding.parameter.addressingMode,
          }] as const]
        : [];
    }),
  ), [modelRequirements, plan]);
  const modelEffectOffsetTexturePaths = useMemo(() => new Map(
    modelRequirements.flatMap((requirement) => {
      const binding = resolveEfxbnUvOffsetMapBinding(plan, requirement.pair.target.index);
      return binding?.file
        ? [[requirement.pair.target.index, {
            path: binding.file.path,
            addressMode: binding.parameter.addressingMode,
          }] as const]
        : [];
    }),
  ), [modelRequirements, plan]);
  const modelEffectTexturesRef = useRef(new Map<number, Texture>());
  const modelEffectOffsetTexturesRef = useRef(new Map<number, Texture>());
  // Pool slots survive between frames so an instance stays with its particle; see
  // `bindEfxbnModelInstanceSlots`. Keyed per emitter/target edge rather than per target, because
  // two emitters may spawn the same block and each needs its own stable slot assignment.
  const modelSlotsByPairRef = useRef(new Map<string, ReadonlyMap<number, number>>());
  const meshEmitterPointsByEffectIndexRef = useRef(new Map<number, readonly EfxbnMeshEmitterPoint[]>());
  const meshEmitterPointsByEffectIndex = meshEmitterPointsByEffectIndexRef.current;

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  useEffect(() => {
    onProgressChangeRef.current = onProgressChange;
  }, [onProgressChange]);
  useEffect(() => () => {
    hostInstanceTransformsRef.current = new Map();
  }, [hostInstanceTransformsRef]);
  // Pair keys repeat across files, so a new document must start from an empty free list rather
  // than inherit the previous one's slot assignments.
  useEffect(() => {
    modelSlotsByPairRef.current = new Map();
  }, [plan.key]);

  useFrame((state, delta) => {
    if (playing) {
      const progressPerSecond = (EFXBN_PREVIEW_FPS / frameCount) * 100;
      progressRef.current = (progressRef.current + delta * progressPerSecond * speed) % 100;
      const now = state.clock.elapsedTime;
      if (now - lastUiUpdateRef.current >= 0.1) {
        lastUiUpdateRef.current = now;
        onProgressChangeRef.current(progressRef.current);
      }
    }

    const frame = (progressRef.current / 100) * frameCount;
    const livePlan = livePlanFromRef(plan, controlLookupEntriesRef);
    const transforms = new Map<string, PreviewInstanceHostTransform>();
    for (const instanceIds of instanceIdsByEffectIndex.values()) {
      for (const instanceId of instanceIds) {
        transforms.set(instanceId, {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: false,
        });
      }
    }
    for (const requirement of modelRequirements) {
      const target = requirement.pair.target;
      const textureBinding = resolveEfxbnColorMapBinding(livePlan, target.index);
      const offsetBinding = resolveEfxbnUvOffsetMapBinding(livePlan, target.index);
      const effectTexture = modelEffectTexturesRef.current.get(target.index) ?? null;
      const effectUvOffsetTexture = modelEffectOffsetTexturesRef.current.get(target.index) ?? null;
      const effectDistortion: [number, number] = [
        offsetBinding?.parameter.uvDistortionPowerU ?? 0,
        offsetBinding?.parameter.uvDistortionPowerV ?? 0,
      ];
      const effectFullBrightness =
        (efxbnRuntime(target).drawScheme.flag & DRAW_SCHEME_FULL_BRIGHTNESS) !== 0;
      const effectAddMix = target.blendState === EFXBN_BLEND_STATE_ADD_MIX;
      const effectColorBorder = usesEfxbnBorderAddressing(textureBinding?.parameter.addressingMode);
      const effectOffsetBorder = usesEfxbnBorderAddressing(offsetBinding?.parameter.addressingMode);
      const particles = simulateEfxbnEmitterPair(
        requirement.pair,
        livePlan,
        frame,
        requirement.capacity,
        meshEmitterPointsByEffectIndex,
      );
      const instanceIds = instanceIdsByEffectIndex.get(target.index) ?? [];
      const pairKey = `${requirement.pair.emitter?.index ?? "root"}:${target.index}`;
      const slotBinding = bindEfxbnModelInstanceSlots(
        particles,
        instanceIds.length,
        modelSlotsByPairRef.current.get(pairKey) ?? EMPTY_SLOT_MAP,
      );
      modelSlotsByPairRef.current.set(pairKey, slotBinding.slotByParticleId);
      instanceIds.forEach((instanceId, index) => {
        const particle = slotBinding.slots[index] ?? undefined;
        const uvTransform = evaluateEfxbnUvTransform(textureBinding?.parameter, particle?.age ?? 0, {
          modelParticle: true,
          particleSeed: particle?.id ?? index,
        });
        const offsetUvTransform = evaluateEfxbnUvTransform(
          offsetBinding?.parameter,
          particle?.age ?? 0,
          { modelParticle: true, particleSeed: particle?.id ?? index },
        );
        transforms.set(instanceId, particle ? {
          position: particle.position,
          rotation: particle.rotationEuler,
          scale: particle.scale,
          color: particle.color,
          effectTexture,
          effectMaterialActive: true,
          effectUvScale: uvTransform.scale,
          effectUvOffset: uvTransform.offset,
          effectUvOffsetTexture,
          effectOffsetUvScale: offsetUvTransform.scale,
          effectOffsetUvOffset: offsetUvTransform.offset,
          effectDistortion,
          effectFullBrightness,
          effectAddMix,
          effectColorBorder,
          effectOffsetBorder,
          motionFrame: particle.age,
          visible: true,
          depthWrite: efxbnRuntime(target).zWriteEnable !== 0,
          depthTest: target.zTestEnable !== 0,
          blending: threeBlendState(target.blendState),
          side: threeSideForEfxbnCullingType(target.cullingType),
        } : {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          effectTexture,
          effectMaterialActive: true,
          effectUvScale: uvTransform.scale,
          effectUvOffset: uvTransform.offset,
          effectUvOffsetTexture,
          effectOffsetUvScale: offsetUvTransform.scale,
          effectOffsetUvOffset: offsetUvTransform.offset,
          effectDistortion,
          effectFullBrightness,
          effectAddMix,
          effectColorBorder,
          effectOffsetBorder,
          motionFrame: 0,
          visible: false,
        });
      });
    }
    hostInstanceTransformsRef.current = transforms;
  }, -1);

  return (
    <group name="efxbn-preview">
      {Array.from(modelEffectTexturePaths, ([effectIndex, entry]) => (
        <EfxbnModelTextureRegistration
          key={`color:${effectIndex}:${entry.path}`}
          effectIndex={effectIndex}
          path={entry.path}
          addressMode={entry.addressMode}
          texturesRef={modelEffectTexturesRef}
        />
      ))}
      {Array.from(modelEffectOffsetTexturePaths, ([effectIndex, entry]) => (
        <EfxbnModelTextureRegistration
          key={`offset:${effectIndex}:${entry.path}`}
          effectIndex={effectIndex}
          path={entry.path}
          addressMode={entry.addressMode}
          texturesRef={modelEffectOffsetTexturesRef}
        />
      ))}
      {plan.effectBlocks.flatMap((block) => {
        if (block.spawnFormType !== 9 && block.spawnFormType !== 10) return [];
        const instanceId = instanceIdsByEffectIndex.get(block.index)?.[0];
        return instanceId ? [(
          <EfxbnMeshEmitterRegistration
            key={`mesh-emitter:${block.index}:${instanceId}`}
            effectIndex={block.index}
            instanceId={instanceId}
            requestedCount={block.meshEmitterCount}
            frameCount={frameCount}
            progressRef={progressRef}
            pointsRef={meshEmitterPointsByEffectIndexRef}
          />
        )] : [];
      })}
      <EfxbnParticlePreview
        plan={plan}
        controlLookupEntriesRef={controlLookupEntriesRef}
        progressRef={progressRef}
        frameCount={frameCount}
        selectedEffectIndex={selectedEffectIndex}
        hiddenEffectIndexes={hiddenEffectIndexes}
        meshEmitterPointsByEffectIndex={meshEmitterPointsByEffectIndex}
        onSelectEffect={onSelectEffect}
      />
      <EfxbnStripPreview
        plan={plan}
        controlLookupEntriesRef={controlLookupEntriesRef}
        progressRef={progressRef}
        frameCount={frameCount}
        hiddenEffectIndexes={hiddenEffectIndexes}
        meshEmitterPointsByEffectIndex={meshEmitterPointsByEffectIndex}
      />
      {plan.effectBlocks.map((block) =>
        !isEfxbnEmitterBlock(block) || hiddenEffectIndexes.has(block.index) ? null : (
          <EmitterShape
            key={block.index}
            block={block}
            selected={selectedEffectIndex === block.index}
            onSelect={() => onSelectEffect(block.index)}
          />
        ),
      )}
    </group>
  );
}
