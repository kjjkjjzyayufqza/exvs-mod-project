import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Grid,
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  Stats,
  useTexture,
} from "@react-three/drei";
import { Suspense, useLayoutEffect, useMemo, useState, useEffect, useRef, type RefObject } from "react";
import {
  ClampToEdgeWrapping,
  Color,
  DoubleSide,
  EquirectangularReflectionMapping,
  Group,
  LineBasicMaterial,
  MirroredRepeatWrapping,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from "three";
import type { BufferGeometry, Texture } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { animeExvsOnBeforeCompile, createAnimeExvsUniforms } from "./animeExvsMeshStandard";
import { AnimePreviewPostFx } from "./AnimePreviewPostFx";
import { BonePreviewRig, resetSkinnedMeshesToBindPose } from "./BonePreviewRig";
import { fitCameraToObject } from "./cameraFit";
import { applyPreviewUvFlip } from "./previewUvFlip";
import type { BoneTransformMode, MaterialDebugViewMode, PreviewRenderStyle } from "./SsbhModelPreviewContext";
import type { DrawMaterialDataUrls, ResolvedMaterialBinding, ResolvedTextureSampling } from "./meshFromSsbh";
import type { BuiltMeshDraw, SkelDataJson } from "./types";

/** Finite ground grid plane size in world units (not infinite). */
const GRID_PLANE_WIDTH = 200;
const GRID_PLANE_HEIGHT = 200;
/**
 * drei's Grid shader fades alpha by camera distance (frag uses dist / fadeDistance).
 * Must be large vs orbit distance or the grid vanishes when zooming out.
 */
const GRID_FADE_DISTANCE = 5e6;

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
  skel: SkelDataJson | null;
  bonePoseEnabled: boolean;
  selectedBoneIndex: number | null;
  boneTransformMode: BoneTransformMode;
  bonePoseResetNonce: number;
  /** Stylized pipeline (bloom + warm lights) inspired by external/water-anime-shader. */
  previewRenderStyle: PreviewRenderStyle;
  /** When true, R3F stops the render loop (background kept-alive route). */
  previewSuspended?: boolean;
};

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

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const root = modelRootRef.current;
    const controls = controlsRef.current;
    if (!root || !controls) return;
    fitCameraToObject(root, camera, controls);
  }, [fitRequestId, camera, modelRootRef, controlsRef]);

  return null;
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
  normalMapEnabled?: boolean;
};

const noopMeshRaycast: Mesh["raycast"] = () => {};

function DrawMeshUntextured({ draw, visible, wireframe, ignoreRaycast }: DrawMeshProps) {
  if (!visible) return null;
  return (
    <mesh geometry={draw.geometry} raycast={ignoreRaycast ? noopMeshRaycast : undefined}>
      <meshStandardMaterial
        color={new Color("#b8bec7")}
        roughness={0.88}
        metalness={0.06}
        side={DoubleSide}
        wireframe={wireframe}
      />
    </mesh>
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
  materialDebugViewMode,
  previewRenderStyle,
  animeKeyLightDir,
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
  useFrame(() => {
    if (!exvsActive) return;
    exvsUniforms.uAnimeKeyDir.value.copy(animeKeyLightDir);
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
    exvsActive ? Math.min(1, roughnessValue * 0.72) : roughnessValue;
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
      ? (shaderFamily === "vsngCharaSparkle" ? 1.65 : hasCube ? 1.25 : 0)
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
      <mesh geometry={draw.geometry} raycast={ignoreRaycast ? noopMeshRaycast : undefined}>
        <meshBasicMaterial map={byKind.map} side={DoubleSide} wireframe={wireframe} />
      </mesh>
    );
  }
  return (
    <mesh geometry={draw.geometry} raycast={ignoreRaycast ? noopMeshRaycast : undefined}>
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
        onBeforeCompile={exvsActive ? onBeforeCompileExvs : undefined}
      />
    </mesh>
  );
}

function DrawMeshes({
  draws,
  drawMaterialDataUrlsByDrawKey,
  drawMaterialBindingsByDrawKey,
  materialDebugViewMode,
  textureFlipY,
  normalMapEnabled,
  visibleKeys,
  wireframe,
  bonePoseEnabled,
  previewRenderStyle,
  animeKeyLightDir,
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
  | "bonePoseEnabled"
  | "previewRenderStyle"
> & {
  animeKeyLightDir: Vector3;
}) {
  const ignoreRaycast = bonePoseEnabled;
  return (
    <>
      {draws.map((d) => {
        const mats = drawMaterialDataUrlsByDrawKey.get(d.key);
        const binding = drawMaterialBindingsByDrawKey.get(d.key) ?? null;
        const mapUrl = mats?.map ?? null;
        const slots: { kind: PbrSlotKind; url: string }[] = [];
        const mode = materialDebugViewMode;
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
        return (
          <Suspense key={d.key} fallback={null}>
            {slots.length > 0 ? (
              <DrawMeshUnifiedPbr
                draw={d}
                slots={slots}
                binding={binding}
                visible={visibleKeys.has(d.key)}
                wireframe={wireframe}
                ignoreRaycast={ignoreRaycast}
                textureFlipY={textureFlipY}
                normalMapEnabled={normalMapEnabled}
                materialDebugViewMode={materialDebugViewMode}
                previewRenderStyle={previewRenderStyle}
                animeKeyLightDir={animeKeyLightDir}
              />
            ) : (
              <DrawMeshUntextured
                draw={d}
                visible={visibleKeys.has(d.key)}
                wireframe={wireframe}
                ignoreRaycast={ignoreRaycast}
              />
            )}
          </Suspense>
        );
      })}
    </>
  );
}

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

function Scene({
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
  skel,
  bonePoseEnabled,
  selectedBoneIndex,
  boneTransformMode,
  bonePoseResetNonce,
  previewRenderStyle,
}: Omit<SsbhModelCanvasProps, "previewSuspended">) {
  const modelRootRef = useRef<Group>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const prevBonePose = useRef(bonePoseEnabled);

  useEffect(() => {
    if (prevBonePose.current && !bonePoseEnabled) {
      resetSkinnedMeshesToBindPose(draws);
    }
    prevBonePose.current = bonePoseEnabled;
  }, [bonePoseEnabled, draws]);

  const showStaticSkeleton = showSkeleton && !bonePoseEnabled && Boolean(skeletonGeometry);
  const showRig = bonePoseEnabled && skel !== null && skel.bones.length > 0;

  const animeKeyLightDir = useMemo(() => {
    const v = new Vector3(directionalX, directionalY, directionalZ);
    if (v.lengthSq() < 1e-12) {
      v.set(0.35, 0.85, 0.45);
    } else {
      v.normalize();
    }
    return v;
  }, [directionalX, directionalY, directionalZ]);

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
        position={[directionalX, directionalY, directionalZ]}
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
        <PreviewUvFlipSync draws={draws} uvFlipU={uvFlipU} uvFlipV={uvFlipV} />
        {showRig ? (
          <BonePreviewRig
            skel={skel!}
            draws={draws}
            selectedBoneIndex={selectedBoneIndex}
            transformMode={boneTransformMode}
            poseResetNonce={bonePoseResetNonce}
            showSkeletonLines={showSkeleton}
            orbitControlsRef={controlsRef}
          />
        ) : null}
        <DrawMeshes
          draws={draws}
          drawMaterialDataUrlsByDrawKey={drawMaterialDataUrlsByDrawKey}
          drawMaterialBindingsByDrawKey={drawMaterialBindingsByDrawKey}
          materialDebugViewMode={materialDebugViewMode}
          textureFlipY={textureFlipY}
          normalMapEnabled={normalMapEnabled}
          visibleKeys={visibleKeys}
          wireframe={wireframe}
          bonePoseEnabled={bonePoseEnabled}
          previewRenderStyle={previewRenderStyle}
          animeKeyLightDir={animeKeyLightDir}
        />
        {showStaticSkeleton && skeletonGeometry ? <SkeletonLines geometry={skeletonGeometry} /> : null}
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
      {showStats ? <Stats /> : null}
    </>
  );
}

export function SsbhModelCanvas(props: SsbhModelCanvasProps) {
  const { background, previewSuspended = false, ...sceneProps } = props;

  return (
    <div
      className="relative h-full min-h-[420px] w-full rounded-md border bg-black/40 outline-none overscroll-contain"
      tabIndex={-1}
      onWheel={(e) => {
        e.stopPropagation();
      }}
    >
      <Canvas
        className="h-full w-full touch-none"
        frameloop={previewSuspended ? "never" : "demand"}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        camera={{ position: [2.4, 1.6, 2.8], fov: 50, near: 0.02, far: 5e6 }}
      >
        {sceneProps.previewRenderStyle === "anime" ? <AnimePreviewPostFx /> : null}
        <Scene {...sceneProps} background={background} />
      </Canvas>
    </div>
  );
}
