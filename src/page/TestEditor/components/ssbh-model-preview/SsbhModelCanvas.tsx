import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Grid,
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  Stats,
  useTexture,
} from "@react-three/drei";
import { Perf } from "r3f-perf";
import {
  Suspense,
  memo,
  useLayoutEffect,
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type RefObject,
} from "react";
import type {
  MotionBoneLocal,
  MotionCameraSample,
  MotionClip,
  MotionLightingSample,
  MotionVisibilityRow,
} from "./motionPreviewTypes";
import { filterDrawsForMotionSkinning, resolveDrawVisibility } from "./motionVisibility";
import { advanceMotionFrame } from "./motionPlaybackMath";
import {
  Bone,
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  EquirectangularReflectionMapping,
  Group,
  LineBasicMaterial,
  Matrix4,
  MirroredRepeatWrapping,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  Quaternion,
  RepeatWrapping,
  Skeleton,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from "three";
import type { BufferGeometry, Texture } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { animeExvsOnBeforeCompile, createAnimeExvsUniforms } from "./animeExvsMeshStandard";
import { AnimePreviewPostFx } from "./AnimePreviewPostFx";
import { BonePreviewRig } from "./BonePreviewRig";
import {
  applyLocalPoseToObjects,
  createGpuSkeletonRuntime,
  updateGpuSkeletonWorld,
  type GpuSkeletonRuntime,
} from "./boneRuntime";
import { SsbhSkinnedMesh } from "./SsbhSkinnedMesh";
import { fitCameraToObject } from "./cameraFit";
import { applyPreviewUvFlip } from "./previewUvFlip";
import {
  createPreviewSelectionUniforms,
  previewSelectionOnBeforeCompile,
} from "./previewSelectionMaterial";
import {
  getSsbhAdaptiveDpr,
  getSsbhAdaptivePerformanceOptions,
  getSsbhPerfMonitorOptions,
  getSsbhCanvasPerformanceProfile,
  isSsbhPreviewDebugEnabled,
  measureDrawComplexity,
  shouldDisableSsbhAnimePostFx,
} from "./ssbhCanvasPerformance";
import type {
  BoneTransformMode,
  MaterialDebugViewMode,
  PreviewInstanceMotionState,
  PreviewModelAttachment,
  PreviewInstanceViewMode,
  PreviewRenderStyle,
} from "./SsbhModelPreviewContext";
import type { DrawMaterialDataUrls, ResolvedMaterialBinding, ResolvedTextureSampling } from "./meshFromSsbh";
import type { BuiltMeshDraw, SkelDataJson, SsbhModelPreviewInstance } from "./types";

function instanceLayoutPosition(_index: number, _count: number): [number, number, number] {
  return [0, 0, 0];
}

/** Finite ground grid plane size in world units (not infinite). */
const GRID_PLANE_WIDTH = 200;
const GRID_PLANE_HEIGHT = 200;
/**
 * drei's Grid shader fades alpha by camera distance (frag uses dist / fadeDistance).
 * Must be large vs orbit distance or the grid vanishes when zooming out.
 */
const GRID_FADE_DISTANCE = 5e6;
const SSBH_PREVIEW_DEBUG = isSsbhPreviewDebugEnabled(
  globalThis as { __SSBH_PREVIEW_DEBUG__?: boolean } | undefined,
  import.meta.env.DEV,
);

function debugLog(message: string, data?: Record<string, unknown>): void {
  if (!SSBH_PREVIEW_DEBUG) {
    return;
  }
  if (data) {
    console.log(`[ssbh-preview] ${message}`, data);
    return;
  }
  console.log(`[ssbh-preview] ${message}`);
}

function useRenderDebug(name: string, tracked: Record<string, unknown>): void {
  const renderCountRef = useRef(0);
  const previousRef = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!SSBH_PREVIEW_DEBUG) {
      return;
    }
    renderCountRef.current += 1;
    const previous = previousRef.current;
    if (!previous) {
      debugLog(`${name} mount`, { render: renderCountRef.current, ...tracked });
      previousRef.current = tracked;
      return;
    }
    const changed: Record<string, { before: unknown; after: unknown }> = {};
    for (const [key, value] of Object.entries(tracked)) {
      if (!Object.is(previous[key], value)) {
        changed[key] = { before: previous[key], after: value };
      }
    }
    if (Object.keys(changed).length > 0) {
      debugLog(`${name} rerender`, {
        render: renderCountRef.current,
        changed,
      });
    }
    previousRef.current = tracked;
  });
}

type SsbhModelCanvasProps = {
  draws: BuiltMeshDraw[];
  drawMaterialDataUrlsByDrawKey: ReadonlyMap<string, DrawMaterialDataUrls>;
  drawMaterialBindingsByDrawKey: ReadonlyMap<string, ResolvedMaterialBinding>;
  materialDebugViewMode: MaterialDebugViewMode;
  textureFlipY: boolean;
  uvFlipU: boolean;
  uvFlipV: boolean;
  visibleKeys: ReadonlySet<string>;
  wireframe: boolean;
  showSkeleton: boolean;
  skeletonGeometry: BufferGeometry | null;
  showGrid: boolean;
  showAxesGizmo: boolean;
  showStats: boolean;
  background: string;
  ambientIntensity: number;
  directionalIntensity: number;
  directionalX: number;
  directionalY: number;
  directionalZ: number;
  normalMapEnabled: boolean;
  /** Increment to request a one-shot camera fit (user Reset view or new model). */
  fitRequestId: number;
  previewInstances: readonly SsbhModelPreviewInstance[];
  activePreviewInstanceId: string | null;
  previewViewMode: PreviewInstanceViewMode;
  hiddenPreviewInstanceIds: ReadonlySet<string>;
  selectedPreviewInstanceIds: ReadonlySet<string>;
  selectedBoneIndex: number | null;
  boneTransformMode: BoneTransformMode;
  bonePoseResetNonce: number;
  /** Stylized pipeline (bloom + warm lights) inspired by external/water-anime-shader. */
  previewRenderStyle: PreviewRenderStyle;
  /** When true, R3F stops the render loop (background kept-alive route). */
  previewSuspended?: boolean;
  onViewportBoneSelect: (index: number) => void;
  onViewportBoneSelectionClear: () => void;
  onBoneTransformHotkey: (mode: BoneTransformMode) => void;
  bonePoseGetterRef: MutableRefObject<(() => Float32Array) | null>;
  bonePoseApplyNonce: number;
  bonePoseToApply: Float32Array | null;
  onBonePoseApplyConsumed: () => void;
  onBonePoseCommit: (beforeTransformSnapshot: Float32Array) => void;
  onUndoBonePose: () => void;
  onRedoBonePose: () => void;
  motionStatesByInstanceId: ReadonlyMap<string, PreviewInstanceMotionState>;
  onMotionFrameSync: (instanceId: string, frame: number) => void;
  onMotionPlaybackStop: (instanceId: string) => void;
  motionControlInstanceId: string | null;
  motionScrubbing: boolean;
  motionScrubFrameRef: MutableRefObject<number | null>;
  motionApplyCamera: boolean;
  motionApplyLighting: boolean;
  motionForceVisibleDuringPlayback: boolean;
  modelAttachments: readonly PreviewModelAttachment[];
};

function MotionCameraController({
  enabled,
  sample,
  controlsRef,
}: {
  enabled: boolean;
  sample: MotionCameraSample | null;
  controlsRef: RefObject<OrbitControlsImpl | null>;
}) {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    const oc = controlsRef.current;
    if (oc) oc.enabled = !enabled;
  }, [enabled, controlsRef]);
  useFrame(() => {
    if (!enabled || !sample || !(camera instanceof PerspectiveCamera)) return;
    camera.position.set(sample.translation[0], sample.translation[1], sample.translation[2]);
    camera.quaternion.set(sample.rotation[0], sample.rotation[1], sample.rotation[2], sample.rotation[3]);
    camera.fov = (sample.fovYRadians * 180) / Math.PI;
    camera.near = sample.nearClip;
    camera.far = sample.farClip;
    camera.updateProjectionMatrix();
  });
  return null;
}

function CameraFit({
  modelRootRef,
  controlsRef,
  fitRequestId,
}: {
  modelRootRef: RefObject<Group | null>;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  fitRequestId: number;
}) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const root = modelRootRef.current;
    const controls = controlsRef.current;
    if (!root || !controls) return;
    fitCameraToObject(root, camera, controls);
    invalidate();
  }, [fitRequestId, camera, modelRootRef, controlsRef, invalidate]);

  return null;
}

function resolveBaseDpr(dprRange: [number, number]): number {
  const deviceDpr =
    typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
  return Math.min(dprRange[1], Math.max(dprRange[0], deviceDpr));
}

function AdaptiveCanvasPerformanceController({
  baseDprRange,
  motionActive,
  perfMonitorOptions,
  previewRenderStyle,
  showStats,
}: {
  baseDprRange: [number, number];
  motionActive: boolean;
  perfMonitorOptions: ReturnType<typeof getSsbhPerfMonitorOptions>;
  previewRenderStyle: PreviewRenderStyle;
  showStats: boolean;
}) {
  const current = useThree((s) => s.performance.current);
  const max = useThree((s) => s.performance.max);
  const regress = useThree((s) => s.performance.regress);
  const invalidate = useThree((s) => s.invalidate);
  const setDpr = useThree((s) => s.setDpr);
  const resolvedBaseDpr = useMemo(() => resolveBaseDpr(baseDprRange), [baseDprRange]);
  const isRegressed = current < max - 1e-3;
  const perfMinimal = perfMonitorOptions.minimal || isRegressed;
  const perfShowGraph = perfMonitorOptions.showGraph && !isRegressed;
  const disableAnimePostFx = shouldDisableSsbhAnimePostFx(previewRenderStyle, current);

  useEffect(() => {
    setDpr(getSsbhAdaptiveDpr(resolvedBaseDpr, current));
  }, [current, resolvedBaseDpr, setDpr]);

  useEffect(() => {
    if (!motionActive) {
      return;
    }
    regress();
    invalidate();
  }, [motionActive, regress, invalidate]);

  return (
    <>
      {showStats ? (
        <Perf
          position={perfMonitorOptions.position}
          minimal={perfMinimal}
          showGraph={perfShowGraph}
        />
      ) : null}
      {showStats && perfMonitorOptions.showLegacyStats ? <Stats /> : null}
      {previewRenderStyle === "anime" && !disableAnimePostFx ? <AnimePreviewPostFx /> : null}
    </>
  );
}

function PreviewUvFlipSync({
  draws,
  uvFlipU,
  uvFlipV,
}: {
  draws: BuiltMeshDraw[];
  uvFlipU: boolean;
  uvFlipV: boolean;
}) {
  useLayoutEffect(() => {
    for (const d of draws) {
      applyPreviewUvFlip(d.geometry, uvFlipU, uvFlipV);
    }
  }, [draws, uvFlipU, uvFlipV]);
  return null;
}

type DrawMeshProps = {
  draw: BuiltMeshDraw;
  visible: boolean;
  wireframe: boolean;
  /** When true, mesh does not participate in raycasting so TransformControls can receive pointer events. */
  ignoreRaycast: boolean;
  skeleton: Skeleton | null;
  normalMapEnabled?: boolean;
  selected: boolean;
};

const noopMeshRaycast: Mesh["raycast"] = () => {};
const _interpQa = new Quaternion();
const _interpQb = new Quaternion();
const _cameraQFrom = new Quaternion();
const _cameraQTo = new Quaternion();
const _attachParentM = new Matrix4();
const _attachChildInvM = new Matrix4();
const _attachFinalM = new Matrix4();

function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function applyInterpolatedLocalsToBones(
  bones: readonly Bone[],
  currentLocals: readonly MotionBoneLocal[],
  nextLocals: readonly MotionBoneLocal[],
  factor: number,
): void {
  const count = Math.min(bones.length, currentLocals.length, nextLocals.length);
  for (let i = 0; i < count; i++) {
    const bone = bones[i];
    const a = currentLocals[i];
    const b = nextLocals[i];
    if (!bone || !a || !b) {
      continue;
    }
    bone.position.set(
      lerpNumber(a.translation[0], b.translation[0], factor),
      lerpNumber(a.translation[1], b.translation[1], factor),
      lerpNumber(a.translation[2], b.translation[2], factor),
    );
    bone.quaternion.slerpQuaternions(
      _interpQa.set(a.rotation[0], a.rotation[1], a.rotation[2], a.rotation[3]),
      _interpQb.set(b.rotation[0], b.rotation[1], b.rotation[2], b.rotation[3]),
      factor,
    );
    bone.scale.set(
      lerpNumber(a.scale[0], b.scale[0], factor),
      lerpNumber(a.scale[1], b.scale[1], factor),
      lerpNumber(a.scale[2], b.scale[2], factor),
    );
    bone.updateMatrix();
  }
}

function DrawMeshContainer({
  draw,
  ignoreRaycast,
  skeleton,
  children,
}: {
  draw: BuiltMeshDraw;
  ignoreRaycast: boolean;
  skeleton: Skeleton | null;
  children: ReactNode;
}) {
  if (skeleton && draw.skin) {
    return (
      <SsbhSkinnedMesh draw={draw} skeleton={skeleton} ignoreRaycast={ignoreRaycast}>
        {children}
      </SsbhSkinnedMesh>
    );
  }
  return (
    <mesh geometry={draw.geometry} raycast={ignoreRaycast ? noopMeshRaycast : undefined}>
      {children}
    </mesh>
  );
}

function DrawMeshUntextured({ draw, visible, wireframe, ignoreRaycast, skeleton, selected }: DrawMeshProps) {
  const selectionUniforms = useMemo(() => createPreviewSelectionUniforms(), [draw.key]);
  const onBeforeCompileSelection = useMemo(
    () => previewSelectionOnBeforeCompile(selectionUniforms),
    [selectionUniforms],
  );
  useFrame((state) => {
    selectionUniforms.uSelectionEnabled.value = selected ? 1 : 0;
    selectionUniforms.uSelectionTime.value = state.clock.elapsedTime;
  });
  if (!visible) return null;
  return (
    <DrawMeshContainer draw={draw} ignoreRaycast={ignoreRaycast} skeleton={skeleton}>
      <meshStandardMaterial
        color={new Color("#b8bec7")}
        roughness={0.88}
        metalness={0.06}
        side={DoubleSide}
        wireframe={wireframe}
        onBeforeCompile={onBeforeCompileSelection}
      />
    </DrawMeshContainer>
  );
}

type PbrSlotKind =
  | "map"
  | "normalMap"
  | "roughnessMap"
  | "metalnessMap"
  | "emissiveMap"
  | "aoMap"
  | "cubeMap";

function toThreeWrapping(mode: ResolvedTextureSampling["wrapS"]) {
  switch (mode) {
    case "Repeat":
      return RepeatWrapping;
    case "MirroredRepeat":
      return MirroredRepeatWrapping;
    case "ClampToBorder":
    case "ClampToEdge":
    default:
      return ClampToEdgeWrapping;
  }
}

function samplingForSlot(
  binding: ResolvedMaterialBinding | null,
  kind: PbrSlotKind,
): ResolvedTextureSampling | null {
  if (!binding || kind === "cubeMap") return null;
  switch (kind) {
    case "map":
      return binding.sampling.map;
    case "normalMap":
      return binding.sampling.normal;
    case "roughnessMap":
      return binding.sampling.roughness;
    case "metalnessMap":
      return binding.sampling.metalness;
    case "emissiveMap":
      return binding.sampling.emissive;
    case "aoMap":
      return binding.sampling.ao;
    default:
      return null;
  }
}

function DrawMeshUnifiedPbr({
  draw,
  slots,
  binding,
  visible,
  wireframe,
  ignoreRaycast,
  textureFlipY,
  normalMapEnabled,
  skeleton,
  materialDebugViewMode,
  previewRenderStyle,
  animeKeyLightDir,
  selected,
}: DrawMeshProps & {
  slots: { kind: PbrSlotKind; url: string }[];
  binding: ResolvedMaterialBinding | null;
  textureFlipY: boolean;
  materialDebugViewMode: MaterialDebugViewMode;
  previewRenderStyle: PreviewRenderStyle;
  animeKeyLightDir: Vector3;
}) {
  const urls = slots.map((s) => s.url);
  const texs = useTexture(urls);
  useLayoutEffect(() => {
    const list = Array.isArray(texs) ? texs : [texs];
    slots.forEach((s, i) => {
      const t = list[i];
      if (!t) return;
      t.colorSpace = s.kind === "map" || s.kind === "emissiveMap" ? SRGBColorSpace : NoColorSpace;
      if (s.kind !== "cubeMap") {
        t.flipY = textureFlipY;
        const sampling = samplingForSlot(binding, s.kind);
        t.wrapS = toThreeWrapping(sampling?.wrapS ?? "ClampToEdge");
        t.wrapT = toThreeWrapping(sampling?.wrapT ?? "ClampToEdge");
        t.center.set(0, 0);
        t.repeat.set(sampling?.uvTransform?.scale_u ?? 1, sampling?.uvTransform?.scale_v ?? 1);
        t.offset.set(sampling?.uvTransform?.translate_u ?? 0, sampling?.uvTransform?.translate_v ?? 0);
        t.rotation = sampling?.uvTransform?.rotation ?? 0;
      }
      if (s.kind === "cubeMap") {
        t.mapping = EquirectangularReflectionMapping;
      }
      t.needsUpdate = true;
    });
  }, [slots, texs, textureFlipY]);
  const list = Array.isArray(texs) ? texs : [texs];
  const byKind: Partial<Record<PbrSlotKind, Texture>> = {};
  slots.forEach((s, i) => {
    byKind[s.kind] = list[i] as Texture;
  });
  const exvsActive = previewRenderStyle === "anime" && materialDebugViewMode === "full";
  const exvsUniforms = useMemo(() => createAnimeExvsUniforms(), [draw.key]);
  const onBeforeCompileExvs = useMemo(() => animeExvsOnBeforeCompile(exvsUniforms), [exvsUniforms]);
  const selectionUniforms = useMemo(() => createPreviewSelectionUniforms(), [draw.key]);
  const onBeforeCompileSelection = useMemo(
    () => previewSelectionOnBeforeCompile(selectionUniforms),
    [selectionUniforms],
  );
  const onBeforeCompileCombined = useMemo(
    () => (shader: { fragmentShader: string; uniforms: Record<string, { value: unknown }> }) => {
      if (exvsActive) {
        onBeforeCompileExvs(shader);
      }
      onBeforeCompileSelection(shader);
    },
    [exvsActive, onBeforeCompileExvs, onBeforeCompileSelection],
  );
  useFrame(() => {
    if (!exvsActive) return;
    exvsUniforms.uAnimeKeyDir.value.copy(animeKeyLightDir);
  });
  useFrame((state) => {
    selectionUniforms.uSelectionEnabled.value = selected ? 1 : 0;
    selectionUniforms.uSelectionTime.value = state.clock.elapsedTime;
  });
  if (!visible) return null;
  const shaderFamily = binding?.shaderFamily ?? "generic";
  const activeNormalMap = normalMapEnabled ? byKind.normalMap : undefined;
  const hasRough = !!byKind.roughnessMap || typeof binding?.uniforms.roughnessScalar === "number";
  const hasMetal = !!byKind.metalnessMap || typeof binding?.uniforms.metalnessScalar === "number";
  const hasEmit = !!byKind.emissiveMap;
  const hasAo = !!byKind.aoMap;
  const hasMap = !!byKind.map;
  const hasCube = !!byKind.cubeMap;
  const roughnessValue =
    typeof binding?.uniforms.roughnessScalar === "number"
      ? binding.uniforms.roughnessScalar
      : hasRough
        ? 1
        : shaderFamily === "vsngCharaSparkle"
          ? 0.45
          : 0.65;
  const metalnessValue =
    typeof binding?.uniforms.metalnessScalar === "number"
      ? binding.uniforms.metalnessScalar
      : hasMetal
        ? 1
        : shaderFamily === "vsngCharaSparkle"
          ? 0.35
          : 0.12;
  const roughnessForStyle =
    exvsActive ? Math.min(1, roughnessValue * 0.84) : roughnessValue;
  const emissiveIntensity = exvsActive
    ? shaderFamily === "vsngCharaSparkle"
      ? 2.15
      : hasEmit
        ? 1.18
        : 0
    : shaderFamily === "vsngCharaSparkle"
      ? 1.8
        : hasEmit
        ? 1
        : 0;
  const transparent = binding?.renderHints.isTransparent ?? hasMap;
  const envIntensity =
    exvsActive
      ? (shaderFamily === "vsngCharaSparkle" ? 1.38 : hasCube ? 1.05 : 0)
      : shaderFamily === "vsngCharaSparkle"
        ? 1.55
        : hasCube
          ? 1.15
          : 0;
  const canUseMetalnessMap = hasCube;
  const effectiveMetalnessMap = canUseMetalnessMap ? byKind.metalnessMap : undefined;
  const effectiveMetalnessValue = canUseMetalnessMap ? metalnessValue : Math.min(metalnessValue, 0.2);
  if (materialDebugViewMode === "baseColor") {
    return (
      <DrawMeshContainer draw={draw} ignoreRaycast={ignoreRaycast} skeleton={skeleton}>
        <meshBasicMaterial map={byKind.map} side={DoubleSide} wireframe={wireframe} />
      </DrawMeshContainer>
    );
  }
  return (
    <DrawMeshContainer draw={draw} ignoreRaycast={ignoreRaycast} skeleton={skeleton}>
      <meshStandardMaterial
        key={exvsActive ? "exvs" : "std"}
        map={byKind.map}
        normalMap={activeNormalMap}
        normalScale={activeNormalMap ? new Vector2(1, 1) : undefined}
        roughnessMap={byKind.roughnessMap}
        metalnessMap={effectiveMetalnessMap}
        emissiveMap={byKind.emissiveMap}
        emissive={hasEmit ? new Color(0xffffff) : new Color(0)}
        emissiveIntensity={emissiveIntensity}
        aoMap={byKind.aoMap}
        aoMapIntensity={hasAo ? 0.35 : 0}
        envMap={byKind.cubeMap}
        envMapIntensity={envIntensity}
        alphaTest={hasMap ? 0.001 : 0}
        transparent={transparent}
        roughness={roughnessForStyle}
        metalness={effectiveMetalnessValue}
        side={DoubleSide}
        wireframe={wireframe}
        onBeforeCompile={onBeforeCompileCombined}
      />
    </DrawMeshContainer>
  );
}

function buildDrawMeshSlots(
  mats: DrawMaterialDataUrls | undefined,
  materialDebugViewMode: MaterialDebugViewMode,
  normalMapEnabled: boolean,
): { kind: PbrSlotKind; url: string }[] {
  const slots: { kind: PbrSlotKind; url: string }[] = [];
  const mode = materialDebugViewMode;
  const mapUrl = mats?.map ?? null;
  if (mapUrl && (mode === "full" || mode === "baseColor")) {
    slots.push({ kind: "map", url: mapUrl });
  }
  if (normalMapEnabled && mats?.normalMap && (mode === "full" || mode === "normals")) {
    slots.push({ kind: "normalMap", url: mats.normalMap });
  }
  if (mats?.roughnessMap && (mode === "full" || mode === "roughnessMetalness")) {
    slots.push({ kind: "roughnessMap", url: mats.roughnessMap });
  }
  if (mats?.metalnessMap && (mode === "full" || mode === "roughnessMetalness")) {
    slots.push({ kind: "metalnessMap", url: mats.metalnessMap });
  }
  if (mats?.emissiveMap && (mode === "full" || mode === "emissive")) {
    slots.push({ kind: "emissiveMap", url: mats.emissiveMap });
  }
  if (mats?.aoMap && (mode === "full" || mode === "roughnessMetalness")) {
    slots.push({ kind: "aoMap", url: mats.aoMap });
  }
  if (mats?.cubeMap && (mode === "full" || mode === "reflection")) {
    slots.push({ kind: "cubeMap", url: mats.cubeMap });
  }
  return slots;
}

const DrawMeshEntry = memo(function DrawMeshEntry({
  draw,
  mats,
  binding,
  visible,
  wireframe,
  ignoreRaycast,
  textureFlipY,
  normalMapEnabled,
  materialDebugViewMode,
  previewRenderStyle,
  animeKeyLightDir,
  skeleton,
  selected,
}: {
  draw: BuiltMeshDraw;
  mats: DrawMaterialDataUrls | undefined;
  binding: ResolvedMaterialBinding | null;
  visible: boolean;
  wireframe: boolean;
  ignoreRaycast: boolean;
  textureFlipY: boolean;
  normalMapEnabled: boolean;
  materialDebugViewMode: MaterialDebugViewMode;
  previewRenderStyle: PreviewRenderStyle;
  animeKeyLightDir: Vector3;
  skeleton: Skeleton | null;
  selected: boolean;
}) {
  const slots = useMemo(
    () => buildDrawMeshSlots(mats, materialDebugViewMode, normalMapEnabled),
    [mats, materialDebugViewMode, normalMapEnabled],
  );

  return (
    <Suspense fallback={null}>
      {slots.length > 0 ? (
        <DrawMeshUnifiedPbr
          draw={draw}
          slots={slots}
          binding={binding}
          visible={visible}
          wireframe={wireframe}
          ignoreRaycast={ignoreRaycast}
          textureFlipY={textureFlipY}
          normalMapEnabled={normalMapEnabled}
          materialDebugViewMode={materialDebugViewMode}
          previewRenderStyle={previewRenderStyle}
          animeKeyLightDir={animeKeyLightDir}
          skeleton={skeleton}
          selected={selected}
        />
      ) : (
        <DrawMeshUntextured
          draw={draw}
          visible={visible}
          wireframe={wireframe}
          ignoreRaycast={ignoreRaycast}
          skeleton={skeleton}
          selected={selected}
        />
      )}
    </Suspense>
  );
}, (prev, next) =>
  prev.draw === next.draw &&
  prev.mats === next.mats &&
  prev.binding === next.binding &&
  prev.visible === next.visible &&
  prev.wireframe === next.wireframe &&
  prev.ignoreRaycast === next.ignoreRaycast &&
  prev.textureFlipY === next.textureFlipY &&
  prev.normalMapEnabled === next.normalMapEnabled &&
  prev.materialDebugViewMode === next.materialDebugViewMode &&
  prev.previewRenderStyle === next.previewRenderStyle &&
  prev.animeKeyLightDir === next.animeKeyLightDir &&
  prev.skeleton === next.skeleton &&
  prev.selected === next.selected,
);

const DrawMeshes = memo(function DrawMeshes({
  draws,
  drawMaterialDataUrlsByDrawKey,
  drawMaterialBindingsByDrawKey,
  materialDebugViewMode,
  textureFlipY,
  normalMapEnabled,
  visibleKeys,
  wireframe,
  ignoreMeshRaycastForBonePicking,
  previewRenderStyle,
  animeKeyLightDir,
  selectedPreviewInstanceIds,
  motionVisibilityRows,
  motionForceVisibleDuringPlayback,
  skeleton,
}: Pick<
  SsbhModelCanvasProps,
  | "draws"
  | "drawMaterialDataUrlsByDrawKey"
  | "drawMaterialBindingsByDrawKey"
  | "materialDebugViewMode"
  | "textureFlipY"
  | "normalMapEnabled"
  | "visibleKeys"
  | "wireframe"
  | "previewRenderStyle"
  | "selectedPreviewInstanceIds"
  | "motionForceVisibleDuringPlayback"
> & {
  ignoreMeshRaycastForBonePicking: boolean;
  animeKeyLightDir: Vector3;
  skeleton: Skeleton | null;
  motionVisibilityRows: MotionVisibilityRow[] | null;
}) {
  const ignoreRaycast = ignoreMeshRaycastForBonePicking;
  useRenderDebug("DrawMeshes", {
    draws: draws.length,
    visibleKeys: visibleKeys.size,
    materialMode: materialDebugViewMode,
    wireframe,
    normalMapEnabled,
    textureFlipY,
    ignoreRaycast,
    hasSkeleton: Boolean(skeleton),
    motionVisibilityRows: motionVisibilityRows?.length ?? 0,
  });
  return (
    <>
      {draws.map((d) => {
        const mats = drawMaterialDataUrlsByDrawKey.get(d.key);
        const binding = drawMaterialBindingsByDrawKey.get(d.key) ?? null;
        const visible = resolveDrawVisibility({
          drawKey: d.key,
          meshObjectName: d.meshObjectName,
          visibleKeys,
          motionVisibilityRows,
          forceVisibleDuringMotion: motionForceVisibleDuringPlayback,
          motionPlaybackActive: Boolean(skeleton),
        });
        const selected =
          d.previewInstanceId !== undefined && d.previewInstanceId !== null
            ? selectedPreviewInstanceIds.has(d.previewInstanceId)
            : false;
        return (
          <DrawMeshEntry
            key={d.key}
            draw={d}
            mats={mats}
            binding={binding}
            visible={visible}
            wireframe={wireframe}
            ignoreRaycast={ignoreRaycast}
            textureFlipY={textureFlipY}
            normalMapEnabled={normalMapEnabled}
            materialDebugViewMode={materialDebugViewMode}
            previewRenderStyle={previewRenderStyle}
            animeKeyLightDir={animeKeyLightDir}
            skeleton={skeleton}
            selected={selected}
          />
        );
      })}
    </>
  );
});

function SkeletonLines({ geometry }: { geometry: BufferGeometry }) {
  const [material] = useState(
    () =>
      new LineBasicMaterial({
        color: "#fbbf24",
        depthTest: true,
        transparent: true,
        opacity: 0.95,
      }),
  );
  useEffect(() => {
    return () => material.dispose();
  }, [material]);

  if (!geometry.attributes.position || geometry.attributes.position.count === 0) return null;

  return (
    <lineSegments geometry={geometry}>
      <primitive attach="material" object={material} />
    </lineSegments>
  );
}

const Scene = memo(function Scene({
  draws,
  drawMaterialDataUrlsByDrawKey,
  drawMaterialBindingsByDrawKey,
  materialDebugViewMode,
  textureFlipY,
  uvFlipU,
  uvFlipV,
  visibleKeys,
  wireframe,
  showSkeleton,
  skeletonGeometry,
  showGrid,
  showAxesGizmo,
  showStats,
  background,
  ambientIntensity,
  directionalIntensity,
  directionalX,
  directionalY,
  directionalZ,
  normalMapEnabled,
  fitRequestId,
  previewInstances,
  activePreviewInstanceId,
  previewViewMode,
  hiddenPreviewInstanceIds,
  selectedPreviewInstanceIds,
  selectedBoneIndex,
  boneTransformMode,
  bonePoseResetNonce,
  previewRenderStyle,
  onViewportBoneSelect,
  bonePoseGetterRef,
  bonePoseApplyNonce,
  bonePoseToApply,
  onBonePoseApplyConsumed,
  onBonePoseCommit,
  motionStatesByInstanceId,
  onMotionFrameSync,
  onMotionPlaybackStop,
  motionControlInstanceId,
  motionScrubbing,
  motionScrubFrameRef,
  motionApplyCamera,
  motionApplyLighting,
  motionForceVisibleDuringPlayback,
  modelAttachments,
}: Omit<
  SsbhModelCanvasProps,
  | "previewSuspended"
  | "onViewportBoneSelectionClear"
  | "onBoneTransformHotkey"
  | "onUndoBonePose"
  | "onRedoBonePose"
>) {
  const modelRootRef = useRef<Group>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const regress = useThree((s) => s.performance.regress);
  const invalidate = useThree((s) => s.invalidate);
  const playbackFrameRef = useRef<Map<string, number>>(new Map());
  const lastSlowFrameLogMsRef = useRef(0);
  const lastAppliedScrubFrameRef = useRef<number | null>(null);
  const activeMotionState =
    (motionControlInstanceId ? motionStatesByInstanceId.get(motionControlInstanceId) : null) ?? null;
  const activeMotionSample = activeMotionState?.sample ?? null;
  const anyMotionPlaying = useMemo(
    () => Array.from(motionStatesByInstanceId.values()).some((s) => s.playing),
    [motionStatesByInstanceId],
  );

  useRenderDebug("Scene", {
    draws: draws.length,
    previewInstances: previewInstances.length,
    activePreviewInstanceId: activePreviewInstanceId ?? "null",
    hiddenPreviewInstances: hiddenPreviewInstanceIds.size,
    selectedPreviewInstances: selectedPreviewInstanceIds.size,
    motionPlaying: anyMotionPlaying,
    motionScrubbing,
    motionFrame: activeMotionState?.frame ?? 0,
    motionClipFrames: activeMotionState?.clip?.frames.length ?? 0,
    motionVisibilityRows: activeMotionSample?.visibility?.length ?? 0,
    selectedBoneIndex: selectedBoneIndex ?? -1,
    previewRenderStyle,
    showGrid,
    showSkeleton,
    showStats,
  });

  useEffect(() => {
    if (!motionControlInstanceId || !activeMotionState) {
      return;
    }
    playbackFrameRef.current.set(motionControlInstanceId, activeMotionState.frame);
  }, [motionControlInstanceId, activeMotionState]);

  const handlePerformanceInteraction = useCallback(() => {
    regress();
    invalidate();
  }, [regress, invalidate]);

  const singleInstance = previewInstances.length <= 1;
  const visibleInstances = useMemo(() => {
    const byVisibility = previewInstances.filter((inst) => !hiddenPreviewInstanceIds.has(inst.id));
    if (previewViewMode === "single") {
      if (byVisibility.length === 0) return [];
      const active =
        (activePreviewInstanceId
          ? byVisibility.find((inst) => inst.id === activePreviewInstanceId)
          : null) ?? byVisibility[0]!;
      return [active];
    }
    return byVisibility;
  }, [previewInstances, hiddenPreviewInstanceIds, previewViewMode, activePreviewInstanceId]);

  const drawsByInstance = useMemo(() => {
    const map = new Map<string, BuiltMeshDraw[]>();
    for (const inst of previewInstances) {
      map.set(inst.id, []);
    }
    for (const d of draws) {
      if (d.previewInstanceId && map.has(d.previewInstanceId)) {
        map.get(d.previewInstanceId)!.push(d);
      } else if (singleInstance && previewInstances[0]) {
        map.get(previewInstances[0]!.id)!.push(d);
      }
    }
    return map;
  }, [draws, previewInstances, singleInstance]);
  const instanceGroupRefs = useRef<Map<string, Group>>(new Map());
  const boneIndexByNameByInstance = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const inst of previewInstances) {
      const skel = inst.bundle.skel ? (inst.bundle.skel as SkelDataJson) : null;
      if (!skel) {
        continue;
      }
      const indexByName = new Map<string, number>();
      for (let i = 0; i < skel.bones.length; i++) {
        indexByName.set(skel.bones[i]!.name, i);
      }
      map.set(inst.id, indexByName);
    }
    return map;
  }, [previewInstances]);

  const gpuRuntimeByInstance = useMemo(() => {
    const map = new Map<string, GpuSkeletonRuntime>();
    for (const inst of previewInstances) {
      const skel = inst.bundle.skel ? (inst.bundle.skel as SkelDataJson) : null;
      if (!skel || skel.bones.length === 0) {
        continue;
      }
      map.set(inst.id, createGpuSkeletonRuntime(skel));
    }
    return map;
  }, [previewInstances]);

  useLayoutEffect(() => {
    for (const inst of previewInstances) {
      const runtime = gpuRuntimeByInstance.get(inst.id);
      if (!runtime) {
        continue;
      }
      const motionState = motionStatesByInstanceId.get(inst.id) ?? null;
      const isScrubTarget = motionScrubbing && motionControlInstanceId === inst.id;
      const isPlaying = Boolean(motionState?.playing && motionState.clip);
      if (isScrubTarget || isPlaying) {
        continue;
      }
      const sampledLocals =
        motionState?.sample && motionState.sample.boneLocals.length === runtime.bones.length
          ? motionState.sample.boneLocals
          : null;
      if (sampledLocals) {
        applyLocalPoseToObjects(runtime.bones, sampledLocals);
      } else {
        applyLocalPoseToObjects(runtime.bones, runtime.restLocals);
      }
      updateGpuSkeletonWorld(runtime);
      runtime.skeleton.update();
    }
  }, [gpuRuntimeByInstance, motionControlInstanceId, motionScrubbing, motionStatesByInstanceId, previewInstances]);

  useFrame((_, delta) => {
    const activeRuntime =
      motionControlInstanceId !== null ? (gpuRuntimeByInstance.get(motionControlInstanceId) ?? null) : null;
    const activeClip = activeMotionState?.clip ?? null;
    const activeLoop = activeMotionState?.loop ?? true;
    if (motionScrubbing && motionControlInstanceId && activeRuntime && activeClip) {
      const scrubFrame = motionScrubFrameRef.current;
      if (scrubFrame === null) {
        return;
      }
      if (lastAppliedScrubFrameRef.current !== null && Math.abs(lastAppliedScrubFrameRef.current - scrubFrame) < 1e-6) {
        return;
      }
      lastAppliedScrubFrameRef.current = scrubFrame;
      const frameCount = activeClip.frames.length;
      if (frameCount <= 0) {
        throw new Error("Motion clip has no sampled frames");
      }
      const maxIndex = frameCount - 1;
      let f = scrubFrame;
      if (activeLoop) {
        f =
          activeClip.finalFrameIndex > 0
            ? ((f % activeClip.finalFrameIndex) + activeClip.finalFrameIndex) % activeClip.finalFrameIndex
            : 0;
      } else if (f < 0) {
        f = 0;
      } else if (f > maxIndex) {
        f = maxIndex;
      }
      const currentIndex = Math.floor(f);
      const nextIndex = activeLoop ? (currentIndex + 1) % frameCount : Math.min(currentIndex + 1, maxIndex);
      const factor = f - currentIndex;
      const currentFrame = activeClip.frames[currentIndex];
      const nextMotionFrame = activeClip.frames[nextIndex];
      if (!currentFrame || !nextMotionFrame) {
        throw new Error("Motion clip frame index out of range during scrub");
      }
      if (factor <= 1e-8 || currentIndex === nextIndex) {
        applyLocalPoseToObjects(activeRuntime.bones, currentFrame.boneLocals);
      } else {
        applyInterpolatedLocalsToBones(
          activeRuntime.bones,
          currentFrame.boneLocals,
          nextMotionFrame.boneLocals,
          factor,
        );
      }
      updateGpuSkeletonWorld(activeRuntime);
      activeRuntime.skeleton.update();
      if (motionApplyCamera && currentFrame.camera && camera instanceof PerspectiveCamera) {
        if (factor <= 1e-8 || currentIndex === nextIndex || !nextMotionFrame.camera) {
          camera.position.set(
            currentFrame.camera.translation[0],
            currentFrame.camera.translation[1],
            currentFrame.camera.translation[2],
          );
          camera.quaternion.set(
            currentFrame.camera.rotation[0],
            currentFrame.camera.rotation[1],
            currentFrame.camera.rotation[2],
            currentFrame.camera.rotation[3],
          );
          camera.fov = (currentFrame.camera.fovYRadians * 180) / Math.PI;
          camera.near = currentFrame.camera.nearClip;
          camera.far = currentFrame.camera.farClip;
        } else {
          const nextCamera = nextMotionFrame.camera;
          camera.position.set(
            lerpNumber(currentFrame.camera.translation[0], nextCamera.translation[0], factor),
            lerpNumber(currentFrame.camera.translation[1], nextCamera.translation[1], factor),
            lerpNumber(currentFrame.camera.translation[2], nextCamera.translation[2], factor),
          );
          camera.quaternion.slerpQuaternions(
            _cameraQFrom.set(
              currentFrame.camera.rotation[0],
              currentFrame.camera.rotation[1],
              currentFrame.camera.rotation[2],
              currentFrame.camera.rotation[3],
            ),
            _cameraQTo.set(
              nextCamera.rotation[0],
              nextCamera.rotation[1],
              nextCamera.rotation[2],
              nextCamera.rotation[3],
            ),
            factor,
          );
          camera.fov = (lerpNumber(currentFrame.camera.fovYRadians, nextCamera.fovYRadians, factor) * 180) / Math.PI;
          camera.near = lerpNumber(currentFrame.camera.nearClip, nextCamera.nearClip, factor);
          camera.far = lerpNumber(currentFrame.camera.farClip, nextCamera.farClip, factor);
        }
        camera.updateProjectionMatrix();
      }
      return;
    }
    if (!anyMotionPlaying) {
      return;
    }
    lastAppliedScrubFrameRef.current = null;
    const frameStart = performance.now();
    let phaseAdvance = 0;
    let phaseSample = 0;
    let phaseBones = 0;
    let phaseCamera = 0;
    let phaseUiSync = 0;
    const sampleStart = performance.now();
    let cameraCurrentFrame: MotionClip["frames"][number] | null = null;
    let cameraNextFrame: MotionClip["frames"][number] | null = null;
    let cameraFactor = 0;
    let cameraHasData = false;
    for (const [instanceId, motionState] of motionStatesByInstanceId.entries()) {
      if (!motionState.playing || !motionState.clip) {
        continue;
      }
      const runtime = gpuRuntimeByInstance.get(instanceId);
      if (!runtime) {
        continue;
      }
      const clip = motionState.clip;
      const current = playbackFrameRef.current.get(instanceId) ?? motionState.frame;
      const advanceStart = performance.now();
      const { nextFrame, shouldStopPlayback } = advanceMotionFrame(
        current,
        delta,
        motionState.speed,
        clip.finalFrameIndex,
        motionState.loop,
      );
      phaseAdvance += performance.now() - advanceStart;
      playbackFrameRef.current.set(instanceId, nextFrame);

      const frameCount = clip.frames.length;
      if (frameCount <= 0) {
        throw new Error("Motion clip has no sampled frames");
      }
      const maxIndex = frameCount - 1;
      let f = nextFrame;
      if (motionState.loop) {
        f =
          clip.finalFrameIndex > 0
            ? ((f % clip.finalFrameIndex) + clip.finalFrameIndex) % clip.finalFrameIndex
            : 0;
      } else if (f < 0) {
        f = 0;
      } else if (f > maxIndex) {
        f = maxIndex;
      }
      const currentIndex = Math.floor(f);
      const nextIndex = motionState.loop ? (currentIndex + 1) % frameCount : Math.min(currentIndex + 1, maxIndex);
      const factor = f - currentIndex;
      const currentFrame = clip.frames[currentIndex];
      const nextMotionFrame = clip.frames[nextIndex];
      if (!currentFrame || !nextMotionFrame) {
        throw new Error("Motion clip frame index out of range during playback");
      }
      const bonesStart = performance.now();
      if (factor <= 1e-8 || currentIndex === nextIndex) {
        applyLocalPoseToObjects(runtime.bones, currentFrame.boneLocals);
      } else {
        applyInterpolatedLocalsToBones(
          runtime.bones,
          currentFrame.boneLocals,
          nextMotionFrame.boneLocals,
          factor,
        );
      }
      updateGpuSkeletonWorld(runtime);
      runtime.skeleton.update();
      phaseBones += performance.now() - bonesStart;

      if (instanceId === motionControlInstanceId) {
        cameraCurrentFrame = currentFrame;
        cameraNextFrame = nextMotionFrame;
        cameraFactor = factor;
        cameraHasData = true;
      }
      if (shouldStopPlayback) {
        onMotionFrameSync(instanceId, nextFrame);
        onMotionPlaybackStop(instanceId);
      }
    }
    phaseSample = performance.now() - sampleStart;
    const cameraStart = performance.now();
    if (
      motionApplyCamera &&
      cameraHasData &&
      cameraCurrentFrame?.camera &&
      camera instanceof PerspectiveCamera
    ) {
      if (cameraFactor <= 1e-8 || !cameraNextFrame?.camera) {
        camera.position.set(
          cameraCurrentFrame.camera.translation[0],
          cameraCurrentFrame.camera.translation[1],
          cameraCurrentFrame.camera.translation[2],
        );
        camera.quaternion.set(
          cameraCurrentFrame.camera.rotation[0],
          cameraCurrentFrame.camera.rotation[1],
          cameraCurrentFrame.camera.rotation[2],
          cameraCurrentFrame.camera.rotation[3],
        );
        camera.fov = (cameraCurrentFrame.camera.fovYRadians * 180) / Math.PI;
        camera.near = cameraCurrentFrame.camera.nearClip;
        camera.far = cameraCurrentFrame.camera.farClip;
      } else {
        const nextCamera = cameraNextFrame.camera;
        camera.position.set(
          lerpNumber(cameraCurrentFrame.camera.translation[0], nextCamera.translation[0], cameraFactor),
          lerpNumber(cameraCurrentFrame.camera.translation[1], nextCamera.translation[1], cameraFactor),
          lerpNumber(cameraCurrentFrame.camera.translation[2], nextCamera.translation[2], cameraFactor),
        );
        camera.quaternion.slerpQuaternions(
          _cameraQFrom.set(
            cameraCurrentFrame.camera.rotation[0],
            cameraCurrentFrame.camera.rotation[1],
            cameraCurrentFrame.camera.rotation[2],
            cameraCurrentFrame.camera.rotation[3],
          ),
          _cameraQTo.set(
            nextCamera.rotation[0],
            nextCamera.rotation[1],
            nextCamera.rotation[2],
            nextCamera.rotation[3],
          ),
          cameraFactor,
        );
        camera.fov =
          (lerpNumber(cameraCurrentFrame.camera.fovYRadians, nextCamera.fovYRadians, cameraFactor) * 180) / Math.PI;
        camera.near = lerpNumber(cameraCurrentFrame.camera.nearClip, nextCamera.nearClip, cameraFactor);
        camera.far = lerpNumber(cameraCurrentFrame.camera.farClip, nextCamera.farClip, cameraFactor);
      }
      camera.updateProjectionMatrix();
    }
    phaseCamera = performance.now() - cameraStart;
    const now = performance.now();
    phaseUiSync = 0;
    const frameTotal = performance.now() - frameStart;
    if (frameTotal > 20 && now - lastSlowFrameLogMsRef.current > 300) {
      lastSlowFrameLogMsRef.current = now;
      debugLog("Scene slow frame", {
        totalMs: Number(frameTotal.toFixed(2)),
        advanceMs: Number(phaseAdvance.toFixed(2)),
        sampleMs: Number(phaseSample.toFixed(2)),
        bonesMs: Number(phaseBones.toFixed(2)),
        cameraMs: Number(phaseCamera.toFixed(2)),
        uiSyncMs: Number(phaseUiSync.toFixed(2)),
        draws: draws.length,
        instances: previewInstances.length,
        activeInstanceId: motionControlInstanceId ?? "none",
      });
    }
  });

  useFrame(() => {
    const attachedChildIds = new Set<string>();
    for (const attachment of modelAttachments) {
      const parentRuntime = gpuRuntimeByInstance.get(attachment.parentInstanceId);
      const childRuntime = gpuRuntimeByInstance.get(attachment.childInstanceId);
      const childGroup = instanceGroupRefs.current.get(attachment.childInstanceId);
      const parentIndexByName = boneIndexByNameByInstance.get(attachment.parentInstanceId);
      const childIndexByName = boneIndexByNameByInstance.get(attachment.childInstanceId);
      if (!parentRuntime || !childRuntime || !childGroup || !parentIndexByName || !childIndexByName) {
        continue;
      }
      const parentBoneIndex = parentIndexByName.get(attachment.parentBoneName);
      const childBoneIndex = childIndexByName.get(attachment.childBoneName);
      if (parentBoneIndex === undefined || childBoneIndex === undefined) {
        continue;
      }
      const parentBone = parentRuntime.bones[parentBoneIndex];
      const childBone = childRuntime.bones[childBoneIndex];
      if (!parentBone || !childBone) {
        continue;
      }
      _attachParentM.copy(parentBone.matrixWorld);
      _attachChildInvM.copy(childBone.matrixWorld).invert();
      _attachFinalM.multiplyMatrices(_attachParentM, _attachChildInvM);
      childGroup.matrixAutoUpdate = false;
      childGroup.matrix.copy(_attachFinalM);
      childGroup.matrix.decompose(childGroup.position, childGroup.quaternion, childGroup.scale);
      childGroup.updateMatrix();
      childGroup.updateMatrixWorld(true);
      attachedChildIds.add(attachment.childInstanceId);
    }

    for (let i = 0; i < visibleInstances.length; i++) {
      const inst = visibleInstances[i];
      const group = instanceGroupRefs.current.get(inst.id);
      if (!group || attachedChildIds.has(inst.id)) {
        continue;
      }
      if (!group.matrixAutoUpdate) {
        group.matrixAutoUpdate = true;
        const pos = instanceLayoutPosition(i, previewInstances.length);
        group.position.set(pos[0], pos[1], pos[2]);
        group.updateMatrix();
        group.updateMatrixWorld(true);
      }
    }
  });

  const animeKeyLightDir = useMemo(() => {
    const v = new Vector3(directionalX, directionalY, directionalZ);
    if (v.lengthSq() < 1e-12) {
      v.set(0.35, 0.85, 0.45);
    } else {
      v.normalize();
    }
    return v;
  }, [directionalX, directionalY, directionalZ]);

  const primaryDirectionalPosition = useMemo(() => {
    if (motionApplyLighting && activeMotionSample?.lighting?.lightChr) {
      const d = activeMotionSample.lighting.lightChr.direction;
      return new Vector3(d[0]!, d[1]!, d[2]!).normalize().multiplyScalar(120);
    }
    return new Vector3(directionalX, directionalY, directionalZ);
  }, [motionApplyLighting, activeMotionSample, directionalX, directionalY, directionalZ]);

  const motionDriving = anyMotionPlaying;

  return (
    <>
      <color attach="background" args={[background]} />
      <ambientLight intensity={ambientIntensity} />
      <hemisphereLight
        args={
          previewRenderStyle === "anime"
            ? ["#b8c8e8", "#101820", 0.32]
            : ["#dbeafe", "#111827", 0.26]
        }
      />
      <directionalLight
        color={previewRenderStyle === "anime" ? "#fff4ea" : "#ffffff"}
        position={[primaryDirectionalPosition.x, primaryDirectionalPosition.y, primaryDirectionalPosition.z]}
        intensity={previewRenderStyle === "anime" ? directionalIntensity * 1.1 : directionalIntensity}
      />
      <directionalLight
        color={previewRenderStyle === "anime" ? "#9eb6d4" : "#ffffff"}
        position={[-directionalX * 0.7, directionalY * 0.45, -directionalZ * 0.7]}
        intensity={
          previewRenderStyle === "anime" ? directionalIntensity * 0.22 : directionalIntensity * 0.28
        }
      />

      <group ref={modelRootRef}>
        {visibleInstances.map((inst, i) => {
          const instDraws = drawsByInstance.get(inst.id) ?? [];
          const pos = instanceLayoutPosition(i, previewInstances.length);
          const isActive =
            activePreviewInstanceId === inst.id ||
            (previewInstances.length === 1 && activePreviewInstanceId === null);
          const isInteractionTarget = isActive;
          const instSkel = inst.bundle.skel ? (inst.bundle.skel as SkelDataJson) : null;
          const instMotionState = motionStatesByInstanceId.get(inst.id) ?? null;
          const instMotionSample = instMotionState?.sample ?? null;
          const instMotionLocals =
            instMotionSample && instSkel?.bones?.length === instMotionSample.boneLocals.length
              ? instMotionSample.boneLocals
              : null;
          const skelHasBones = instSkel !== null && instSkel.bones.length > 0;
          const showStaticSkeleton =
            showSkeleton && !skelHasBones && Boolean(skeletonGeometry) && isInteractionTarget;
          const motionPoseActive = isActive && (Boolean(instMotionState?.playing) || motionScrubbing || Boolean(instMotionLocals?.length));
          const gpuRuntime = gpuRuntimeByInstance.get(inst.id) ?? null;
          const gpuSkinningActive = isActive && motionPoseActive && gpuRuntime !== null;
          const gpuSkeleton = gpuSkinningActive ? gpuRuntime!.skeleton : null;
          const skinningDraws = filterDrawsForMotionSkinning(
            instDraws,
            visibleKeys,
            isActive ? (instMotionSample?.visibility ?? null) : null,
          );
          return (
            <group
              key={inst.id}
              position={pos}
              ref={(el) => {
                if (el) {
                  instanceGroupRefs.current.set(inst.id, el);
                } else {
                  instanceGroupRefs.current.delete(inst.id);
                }
              }}
            >
              <PreviewUvFlipSync draws={instDraws} uvFlipU={uvFlipU} uvFlipV={uvFlipV} />
              {skelHasBones && !gpuSkinningActive ? (
                <BonePreviewRig
                  skel={instSkel!}
                  draws={instDraws}
                  skinningDraws={skinningDraws}
                  isInteractionTarget={isInteractionTarget}
                  selectedBoneIndex={selectedBoneIndex}
                  transformMode={boneTransformMode}
                  poseResetNonce={bonePoseResetNonce}
                  showSkeletonLines={showSkeleton}
                  orbitControlsRef={controlsRef}
                  onSelectBone={onViewportBoneSelect}
                  bonePoseGetterRef={bonePoseGetterRef}
                  bonePoseApplyNonce={bonePoseApplyNonce}
                  bonePoseToApply={bonePoseToApply}
                  onBonePoseApplyConsumed={onBonePoseApplyConsumed}
                  onBonePoseCommit={onBonePoseCommit}
                  motionBoneLocals={
                    isActive && instMotionLocals && instMotionLocals.length === instSkel!.bones.length
                      ? instMotionLocals
                      : null
                  }
                  motionPoseActive={motionPoseActive}
                  gpuSkinningActive={gpuSkinningActive}
                  motionDriving={motionDriving}
                />
              ) : null}
              <DrawMeshes
                draws={instDraws}
                drawMaterialDataUrlsByDrawKey={drawMaterialDataUrlsByDrawKey}
                drawMaterialBindingsByDrawKey={drawMaterialBindingsByDrawKey}
                materialDebugViewMode={materialDebugViewMode}
                textureFlipY={textureFlipY}
                normalMapEnabled={normalMapEnabled}
                visibleKeys={visibleKeys}
                wireframe={wireframe}
                ignoreMeshRaycastForBonePicking={anyMotionPlaying || motionScrubbing || (skelHasBones && isActive)}
                previewRenderStyle={previewRenderStyle}
                animeKeyLightDir={animeKeyLightDir}
                selectedPreviewInstanceIds={selectedPreviewInstanceIds}
                motionVisibilityRows={anyMotionPlaying || motionScrubbing ? null : isActive ? (instMotionSample?.visibility ?? null) : null}
                skeleton={gpuSkeleton}
                motionForceVisibleDuringPlayback={motionForceVisibleDuringPlayback}
              />
              {showStaticSkeleton && skeletonGeometry ? <SkeletonLines geometry={skeletonGeometry} /> : null}
            </group>
          );
        })}
      </group>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        minDistance={0.08}
        maxDistance={5e6}
        enableDamping
        dampingFactor={0.06}
        screenSpacePanning
        zoomSpeed={0.85}
        rotateSpeed={0.65}
        panSpeed={0.65}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI - 0.05}
        onStart={handlePerformanceInteraction}
        onChange={handlePerformanceInteraction}
      />

      <MotionCameraController
        enabled={!anyMotionPlaying && motionApplyCamera && Boolean(activeMotionSample?.camera)}
        sample={activeMotionSample?.camera ?? null}
        controlsRef={controlsRef}
      />

      <CameraFit modelRootRef={modelRootRef} controlsRef={controlsRef} fitRequestId={fitRequestId} />

      {showGrid ? (
        <Grid
          args={[GRID_PLANE_WIDTH, GRID_PLANE_HEIGHT]}
          infiniteGrid={false}
          cellSize={1}
          sectionSize={5}
          fadeDistance={GRID_FADE_DISTANCE}
          fadeStrength={1}
          sectionColor="#4a5568"
          cellColor="#2d3748"
          sectionThickness={1}
          cellThickness={0.6}
        />
      ) : null}
      {showAxesGizmo ? (
        <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
          <GizmoViewport axisColors={["#f87171", "#4ade80", "#60a5fa"]} labelColor="white" />
        </GizmoHelper>
      ) : null}
    </>
  );
});

export const SsbhModelCanvas = memo(function SsbhModelCanvas(props: SsbhModelCanvasProps) {
  const { background, previewSuspended = false, motionScrubbing, ...sceneProps } = props;
  const {
    onViewportBoneSelectionClear,
    onBoneTransformHotkey,
    onUndoBonePose,
    onRedoBonePose,
    ...restSceneProps
  } = sceneProps;
  const { previewInstances, activePreviewInstanceId } = restSceneProps;
  const activeInstance =
    previewInstances.find((i) => i.id === activePreviewInstanceId) ?? previewInstances[0] ?? null;
  const skel = activeInstance?.bundle?.skel ? (activeInstance.bundle.skel as SkelDataJson) : null;
  const skelHasBones = skel !== null && skel.bones.length > 0;
  const selectedBoneIndex = restSceneProps.selectedBoneIndex;
  const anyMotionPlaying = useMemo(
    () => Array.from(restSceneProps.motionStatesByInstanceId.values()).some((s) => s.playing),
    [restSceneProps.motionStatesByInstanceId],
  );
  const drawComplexity = useMemo(
    () => measureDrawComplexity(restSceneProps.draws),
    [restSceneProps.draws],
  );
  const canvasPerformanceProfile = useMemo(
    () =>
      getSsbhCanvasPerformanceProfile({
        drawCount: drawComplexity.drawCount,
        triangleCount: drawComplexity.triangleCount,
        motionPlaying: anyMotionPlaying,
        motionScrubbing,
        previewRenderStyle: restSceneProps.previewRenderStyle,
      }),
    [drawComplexity, anyMotionPlaying, motionScrubbing, restSceneProps.previewRenderStyle],
  );
  const adaptivePerformanceOptions = useMemo(
    () =>
      getSsbhAdaptivePerformanceOptions({
        drawCount: drawComplexity.drawCount,
        triangleCount: drawComplexity.triangleCount,
        motionPlaying: anyMotionPlaying,
        motionScrubbing,
        previewRenderStyle: restSceneProps.previewRenderStyle,
      }),
    [drawComplexity, anyMotionPlaying, motionScrubbing, restSceneProps.previewRenderStyle],
  );
  const perfMonitorOptions = useMemo(
    () =>
      getSsbhPerfMonitorOptions({
        drawCount: drawComplexity.drawCount,
        triangleCount: drawComplexity.triangleCount,
        motionPlaying: anyMotionPlaying,
        motionScrubbing,
        previewRenderStyle: restSceneProps.previewRenderStyle,
      }),
    [drawComplexity, anyMotionPlaying, motionScrubbing, restSceneProps.previewRenderStyle],
  );

  useRenderDebug("SsbhModelCanvas", {
    motionPlaying: anyMotionPlaying,
    motionScrubbing,
    previewSuspended,
    draws: restSceneProps.draws.length,
    previewInstances: restSceneProps.previewInstances.length,
    activePreviewInstanceId: restSceneProps.activePreviewInstanceId ?? "null",
    selectedBoneIndex: selectedBoneIndex ?? -1,
    previewRenderStyle: restSceneProps.previewRenderStyle,
    visibleKeys: restSceneProps.visibleKeys.size,
    triangleCount: drawComplexity.triangleCount,
    dprMax: canvasPerformanceProfile.dpr[1],
    antialias: canvasPerformanceProfile.antialias,
    showGrid: restSceneProps.showGrid,
    showSkeleton: restSceneProps.showSkeleton,
  });

  const handleCanvasKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        const low = e.key.toLowerCase();
        if (low === "z" && !e.shiftKey) {
          if (skelHasBones) {
            e.preventDefault();
            onUndoBonePose();
          }
          return;
        }
        if ((low === "z" && e.shiftKey) || low === "y") {
          if (skelHasBones) {
            e.preventDefault();
            onRedoBonePose();
          }
          return;
        }
      }
      if (e.repeat) return;
      if (!skelHasBones) return;
      if (e.key === "Escape") {
        if (selectedBoneIndex === null) return;
        e.preventDefault();
        onViewportBoneSelectionClear();
        return;
      }
      const lowKey = e.key.toLowerCase();
      if (lowKey === "w") {
        e.preventDefault();
        onBoneTransformHotkey("translate");
        return;
      }
      if (lowKey === "e") {
        e.preventDefault();
        onBoneTransformHotkey("rotate");
        return;
      }
      if (lowKey === "r") {
        e.preventDefault();
        onBoneTransformHotkey("scale");
        return;
      }
      const k = e.key;
      if (k === "1") {
        e.preventDefault();
        onBoneTransformHotkey("translate");
      } else if (k === "2") {
        e.preventDefault();
        onBoneTransformHotkey("rotate");
      } else if (k === "3") {
        e.preventDefault();
        onBoneTransformHotkey("scale");
      }
    },
    [
      skelHasBones,
      selectedBoneIndex,
      onBoneTransformHotkey,
      onViewportBoneSelectionClear,
      onUndoBonePose,
      onRedoBonePose,
    ],
  );

  return (
    <div
      className="relative h-full min-h-[420px] w-full rounded-md border bg-black/40 outline-none overscroll-contain focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      tabIndex={0}
      onWheel={(e) => {
        e.stopPropagation();
      }}
      onPointerDown={(ev) => {
        ev.currentTarget.focus();
      }}
      onKeyDown={handleCanvasKeyDown}
    >
      <Canvas
        className="h-full w-full touch-none"
        frameloop={previewSuspended ? "never" : anyMotionPlaying || motionScrubbing ? "always" : "demand"}
        gl={{
          antialias: canvasPerformanceProfile.antialias,
          alpha: false,
          powerPreference: "high-performance",
        }}
        performance={adaptivePerformanceOptions}
        dpr={canvasPerformanceProfile.dpr}
        camera={{ position: [2.4, 1.6, 2.8], fov: 50, near: 0.02, far: 5e6 }}
        onPointerMissed={() => {
          if (selectedBoneIndex !== null) {
            onViewportBoneSelectionClear();
          }
        }}
      >
        <AdaptiveCanvasPerformanceController
          baseDprRange={canvasPerformanceProfile.dpr}
          motionActive={anyMotionPlaying || motionScrubbing}
          perfMonitorOptions={perfMonitorOptions}
          previewRenderStyle={restSceneProps.previewRenderStyle}
          showStats={restSceneProps.showStats}
        />
        <Scene {...restSceneProps} background={background} motionScrubbing={motionScrubbing} />
      </Canvas>
    </div>
  );
});
