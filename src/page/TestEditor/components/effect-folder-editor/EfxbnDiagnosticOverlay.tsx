import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { AdditiveBlending, DoubleSide, NormalBlending, SubtractiveBlending, type Texture } from "three";
import type { PreviewInstanceHostTransform } from "@/components/ssbh-model-preview/SsbhModelCanvas";
import { useSsbhModelPreview } from "@/components/ssbh-model-preview/SsbhModelPreviewContext";
import { applyLocalPoseToObjects, createGpuSkeletonRuntime, updateGpuSkeletonWorld } from "@/components/ssbh-model-preview/boneRuntime";
import { sampleMotionClipFrame } from "@/components/ssbh-model-preview/motionPlaybackMath";
import type { SkelDataJson } from "@/components/ssbh-model-preview/types";
import { evaluateEfxbnUvTransform, type EffectFolderPreviewPlan } from "./effectFolderPreviewPlan";
import { EfxbnParticlePreview, useEfxbnTexture } from "./EfxbnParticlePreview";
import { EfxbnStripPreview } from "./EfxbnStripPreview";
import {
  EFXBN_PREVIEW_FPS,
  EFXBN_PREVIEW_FRAME_COUNT,
  resolveEfxbnModelPoolRequirements,
  simulateEfxbnEmitterPair,
} from "./efxbnSimulation";
import { extractEfxbnMeshEmitterPoints, type EfxbnMeshEmitterPoint } from "./efxbnMeshEmitter";

type EfxbnDiagnosticOverlayProps = {
  plan: EffectFolderPreviewPlan;
  progress: number;
  playing: boolean;
  speed: number;
  selectedEffectIndex: number | null;
  hiddenEffectIndexes: ReadonlySet<number>;
  instanceIdsByEffectIndex: ReadonlyMap<number, readonly string[]>;
  hostInstanceTransformsRef: MutableRefObject<ReadonlyMap<string, PreviewInstanceHostTransform>>;
  onSelectEffect: (effectIndex: number) => void;
  onProgressChange: (progress: number) => void;
};

function EfxbnModelTextureRegistration({
  effectIndex,
  path,
  texturesRef,
}: {
  effectIndex: number;
  path: string;
  texturesRef: MutableRefObject<Map<number, Texture>>;
}) {
  const texture = useEfxbnTexture(path);
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
  progressRef,
  pointsRef,
}: {
  effectIndex: number;
  instanceId: string;
  requestedCount: number;
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
        const frame = (progressRef.current / 100) * EFXBN_PREVIEW_FRAME_COUNT;
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
  progress,
  playing,
  speed,
  selectedEffectIndex,
  hiddenEffectIndexes,
  instanceIdsByEffectIndex,
  hostInstanceTransformsRef,
  onSelectEffect,
  onProgressChange,
}: EfxbnDiagnosticOverlayProps) {
  const progressRef = useRef(progress);
  const lastUiUpdateRef = useRef(0);
  const onProgressChangeRef = useRef(onProgressChange);
  const modelRequirements = useMemo(() => resolveEfxbnModelPoolRequirements(plan), [plan]);
  const modelEffectTexturePaths = useMemo(() => new Map(
    modelRequirements.flatMap((requirement) => {
      const binding = plan.textureBindings.find(
        (candidate) => candidate.effectIndex === requirement.pair.target.index && candidate.file,
      );
      return binding?.file ? [[requirement.pair.target.index, binding.file.path] as const] : [];
    }),
  ), [modelRequirements, plan.textureBindings]);
  const modelEffectTexturesRef = useRef(new Map<number, Texture>());
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

  useFrame((state, delta) => {
    if (playing) {
      const progressPerSecond = (EFXBN_PREVIEW_FPS / EFXBN_PREVIEW_FRAME_COUNT) * 100;
      progressRef.current = (progressRef.current + delta * progressPerSecond * speed) % 100;
      const now = state.clock.elapsedTime;
      if (now - lastUiUpdateRef.current >= 0.1) {
        lastUiUpdateRef.current = now;
        onProgressChangeRef.current(progressRef.current);
      }
    }

    const frame = (progressRef.current / 100) * EFXBN_PREVIEW_FRAME_COUNT;
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
      const textureBinding = plan.textureBindings.find(
        (binding) => binding.effectIndex === target.index && binding.file,
      );
      const effectTexture = modelEffectTexturesRef.current.get(target.index) ?? null;
      const particles = simulateEfxbnEmitterPair(
        requirement.pair,
        plan,
        frame,
        requirement.capacity,
        meshEmitterPointsByEffectIndex,
      );
      const instanceIds = instanceIdsByEffectIndex.get(target.index) ?? [];
      instanceIds.forEach((instanceId, index) => {
        const particle = particles[index];
        const uvTransform = evaluateEfxbnUvTransform(textureBinding?.parameter, particle?.age ?? 0, {
          modelParticle: true,
          particleSeed: particle?.id ?? index,
        });
        transforms.set(instanceId, particle ? {
          position: particle.position,
          rotation: particle.rotationEuler,
          scale: particle.scale,
          color: particle.color,
          effectTexture,
          effectUvScale: uvTransform.scale,
          effectUvOffset: uvTransform.offset,
          motionFrame: particle.age,
          visible: true,
          depthWrite: target.zWriteEnable !== 0,
          depthTest: target.zTestEnable !== 0,
          blending: target.blendState === 2
            ? AdditiveBlending
            : target.blendState === 3
              ? SubtractiveBlending
              : NormalBlending,
        } : {
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          effectTexture,
          effectUvScale: uvTransform.scale,
          effectUvOffset: uvTransform.offset,
          motionFrame: 0,
          visible: false,
        });
      });
    }
    hostInstanceTransformsRef.current = transforms;
  }, -1);

  return (
    <group name="efxbn-preview">
      {Array.from(modelEffectTexturePaths, ([effectIndex, path]) => (
        <EfxbnModelTextureRegistration
          key={`${effectIndex}:${path}`}
          effectIndex={effectIndex}
          path={path}
          texturesRef={modelEffectTexturesRef}
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
            progressRef={progressRef}
            pointsRef={meshEmitterPointsByEffectIndexRef}
          />
        )] : [];
      })}
      <EfxbnParticlePreview
        plan={plan}
        progressRef={progressRef}
        selectedEffectIndex={selectedEffectIndex}
        hiddenEffectIndexes={hiddenEffectIndexes}
        meshEmitterPointsByEffectIndex={meshEmitterPointsByEffectIndex}
        onSelectEffect={onSelectEffect}
      />
      <EfxbnStripPreview
        plan={plan}
        progressRef={progressRef}
        hiddenEffectIndexes={hiddenEffectIndexes}
        meshEmitterPointsByEffectIndex={meshEmitterPointsByEffectIndex}
      />
      {plan.effectBlocks.map((block) =>
        block.effectType !== 9 || hiddenEffectIndexes.has(block.index) ? null : (
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
