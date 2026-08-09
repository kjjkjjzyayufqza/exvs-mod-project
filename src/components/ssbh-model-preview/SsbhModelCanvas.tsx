import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Grid,
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  Stats,
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
import {
  resolveMotionInstanceRenderState,
  shouldSyncPlaybackFrame,
  type MotionPlaybackFrameObservation,
} from "./motionInstancePipeline";
import { advanceMotionFrame, normalizeMotionFrame } from "./motionPlaybackMath";
import {
  expandSingleViewWithAttachments,
  shouldShowPreviewSelectionOutline,
} from "./viewportSelectionPolicy";
import {
  Bone,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Skeleton,
  Vector2,
  Vector3,
} from "three";
import type { Blending, BufferGeometry, Material, Object3D, Side, Texture } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { StageOrbitControls } from "@/components/viewport/StageOrbitControls";
import { ViewportMarqueeOverlay } from "@/components/viewport/ViewportMarqueeOverlay";
import { ViewportSelectionController } from "@/components/viewport/ViewportSelectionController";
import {
  runViewportObjectPick,
  type SelectableNodeRegistry,
  type ViewportPickRefs,
} from "@/components/viewport/viewportPick";
import type {
  ScreenRect,
  ViewportMultiSelectHandler,
  ViewportSelectHandler,
} from "@/components/viewport/viewportInteraction";
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
import type { ResolvedMaterialBinding } from "./meshFromSsbh";
import {
  SceneTexturePool,
  buildTexturePoolKey,
  createDataTexture,
  lookupTextureData,
  pathForSlot,
  type NutexbTextureData,
  type PbrSlotKind,
} from "./ssbhTextureUpload";
import type { BuiltMeshDraw, SkelDataJson, SsbhModelPreviewInstance } from "./types";
import { composeGuestAttachRootMatrix } from "./attachmentTemplateService";

/** Local matrix product rootBone → attachBone (stops at non-Bone parent). Feedback-free. */
function boneLocalChainMatrix(attachBone: Bone, out: Matrix4): Matrix4 {
  const chain: Bone[] = [];
  let cur: Object3D | null = attachBone;
  while (cur && (cur as Bone).isBone) {
    chain.push(cur as Bone);
    cur = cur.parent;
  }
  out.identity();
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    out.multiply(chain[i]!.matrix);
  }
  return out;
}

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
/**
 * Blender default theme `space_view3d`: grid_major RGB #545454; grid is #545454 at alpha 0x80.
 * Drei's Grid uses vec3 colors only — cell lines use #464646 to match grid over #383838 background.
 */
const BLENDER_GRID_CELL_COLOR = "#464646";
const BLENDER_GRID_SECTION_COLOR = "#545454";
const SSBH_PREVIEW_DEBUG = isSsbhPreviewDebugEnabled(
  globalThis as { __SSBH_PREVIEW_DEBUG__?: boolean } | undefined,
  import.meta.env.DEV,
);

let textureDataIdentitySeq = 0;
const textureDataIdentities = new WeakMap<object, number>();

function textureDataIdentity(data: NutexbTextureData): number {
  const key = data as object;
  const existing = textureDataIdentities.get(key);
  if (existing !== undefined) return existing;
  textureDataIdentitySeq += 1;
  textureDataIdentities.set(key, textureDataIdentitySeq);
  return textureDataIdentitySeq;
}

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

export type PreviewInstanceHostTransform = {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  scale: readonly [number, number, number];
  color?: readonly [number, number, number, number];
  visible?: boolean;
  depthWrite?: boolean;
  depthTest?: boolean;
  blending?: Blending;
  /** Face culling, from the block's `cullingType` through the engine's D3D11 cull table. */
  side?: Side;
  /** Optional EFX color map rendered with the game's unlit model pixel path. */
  effectTexture?: Texture | null;
  /** Keep the unlit EFX material active when a source-local color map is unavailable. */
  effectMaterialActive?: boolean;
  effectUvScale?: readonly [number, number];
  effectUvOffset?: readonly [number, number];
  /**
   * ColorEx UV-offset (distortion) map and its own animated UV set. When present the unlit EFX
   * material reproduces `efxDrawModelColorExPS` bit `0x80`: the colour UV is displaced by
   * `offset.a * (offset.rg - 0.5) * distortion` and alpha is scaled by `offset.a`.
   */
  effectUvOffsetTexture?: Texture | null;
  effectOffsetUvScale?: readonly [number, number];
  effectOffsetUvOffset?: readonly [number, number];
  effectDistortion?: readonly [number, number];
  /** Draw-scheme bit `0x40000`: skip the `rgb * 0.5` the base model pixel shader applies. */
  effectFullBrightness?: boolean;
  /** Draw-scheme bit `0x40` (`blendState == 4`): the AddMix premultiply-and-drop-alpha path. */
  effectAddMix?: boolean;
  /**
   * `hkImageAddressMode` BORDER on the colour / offset sampler. WebGL2 has no border wrap, so
   * the injected shader zeroes alpha outside the authored UV range instead.
   */
  effectColorBorder?: boolean;
  effectOffsetBorder?: boolean;
  /** Host-owned motion frame, used for per-particle animation phase. */
  motionFrame?: number;
};

/** Uniforms the EFX override material injects into `MeshBasicMaterial`. */
type EfxColorExUniforms = {
  efxUvOffsetMap: { value: Texture | null };
  efxHasUvOffsetMap: { value: number };
  efxDistortion: { value: [number, number] };
  efxOffsetUvScale: { value: [number, number] };
  efxOffsetUvOffset: { value: [number, number] };
  efxColorBorder: { value: number };
  efxOffsetBorder: { value: number };
  efxAddMix: { value: number };
};

/**
 * Injects the ColorEx distortion path into a stock `MeshBasicMaterial` instead of replacing it
 * with a `ShaderMaterial`, so three.js keeps owning skinning, vertex colours and instancing.
 */
function attachEfxColorExUniforms(material: MeshBasicMaterial): EfxColorExUniforms {
  const uniforms: EfxColorExUniforms = {
    efxUvOffsetMap: { value: null },
    efxHasUvOffsetMap: { value: 0 },
    efxDistortion: { value: [0, 0] },
    efxOffsetUvScale: { value: [1, 1] },
    efxOffsetUvOffset: { value: [0, 0] },
    efxColorBorder: { value: 0 },
    efxOffsetBorder: { value: 0 },
    efxAddMix: { value: 0 },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec2 efxOffsetUvScale;
uniform vec2 efxOffsetUvOffset;
varying vec2 vEfxOffsetUv;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
vEfxOffsetUv = uv * efxOffsetUvScale + efxOffsetUvOffset;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D efxUvOffsetMap;
uniform float efxHasUvOffsetMap;
uniform vec2 efxDistortion;
uniform float efxColorBorder;
uniform float efxOffsetBorder;
uniform float efxAddMix;
varying vec2 vEfxOffsetUv;
float efxBorderAlpha( vec2 uvValue, float enabled ) {
  if ( enabled < 0.5 ) return 1.0;
  vec2 inside = step( vec2( 0.0 ), uvValue ) * step( uvValue, vec2( 1.0 ) );
  return inside.x * inside.y;
}`,
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
  vec2 efxColorUv = vMapUv;
  float efxOffsetAlpha = 1.0;
  if ( efxHasUvOffsetMap > 0.5 ) {
    vec4 efxOffsetTexel = texture2D( efxUvOffsetMap, vEfxOffsetUv );
    efxOffsetAlpha = efxOffsetTexel.a * efxBorderAlpha( vEfxOffsetUv, efxOffsetBorder );
    efxColorUv += efxOffsetTexel.a * ( efxOffsetTexel.rg - 0.5 ) * efxDistortion;
  }
  diffuseColor *= texture2D( map, efxColorUv );
  diffuseColor.a *= efxOffsetAlpha * efxBorderAlpha( efxColorUv, efxColorBorder );
  // efxDrawModelAddMixPS: premultiply and drop alpha once the texel is bright.
  if ( efxAddMix > 0.5 ) {
    float efxBright = step( 0.8, max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) ) );
    diffuseColor.rgb *= diffuseColor.a;
    diffuseColor.a = mix( diffuseColor.a, 0.0, efxBright );
  }
#endif`,
      );
  };
  return uniforms;
}

type SsbhModelCanvasProps = {
  draws: BuiltMeshDraw[];
  textureDataMap: ReadonlyMap<string, NutexbTextureData>;
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
  /** Inspect-list-only yellow mesh selection glow. */
  selectionOutlineEnabled?: boolean;
  hiddenPreviewInstanceIds: ReadonlySet<string>;
  selectedBoneIndex: number | null;
  bonePointSize: number;
  boneTransformMode: BoneTransformMode;
  bonePoseResetNonce: number;
  /** Stylized pipeline (bloom + warm lights) inspired by external/water-anime-shader. */
  previewRenderStyle: PreviewRenderStyle;
  /** When true, R3F stops the render loop (background kept-alive route). */
  previewSuspended?: boolean;
  /** Optional host-owned R3F content rendered inside the fitted model root. */
  sceneOverlay?: ReactNode;
  /** Imperative per-frame instance transforms owned by an embedded host. */
  hostInstanceTransformsRef?: RefObject<ReadonlyMap<string, PreviewInstanceHostTransform>>;
  /** Keeps the shared canvas advancing while host-owned scene content is animated. */
  sceneOverlayAnimating?: boolean;
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
  /** default: Blender-style orbit (LMB rotate). unreal: Scene Editor bindings (LMB marquee, RMB orbit). */
  viewportControls?: "default" | "unreal";
  onViewportSelectInstance?: ViewportSelectHandler;
  onViewportSelectInstances?: ViewportMultiSelectHandler;
  /** Optional bridge for unit-model / batch FBX export from preview instance groups. */
  exportHandleRef?: MutableRefObject<SsbhModelCanvasExportHandle | null>;
};

export type SsbhModelCanvasExportHandle = {
  getExportObjectsByInstanceId: () => ReadonlyMap<string, { object: Object3D }>;
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
  const gl = useThree((s) => s.gl);
  const viewportWidth = useThree((s) => s.size.width);
  const viewportHeight = useThree((s) => s.size.height);
  const resolvedBaseDpr = useMemo(() => resolveBaseDpr(baseDprRange), [baseDprRange]);
  const isRegressed = current < max - 1e-3;
  const perfMinimal = perfMonitorOptions.minimal || isRegressed;
  const perfShowGraph = perfMonitorOptions.showGraph && !isRegressed;
  const disableAnimePostFx = shouldDisableSsbhAnimePostFx(previewRenderStyle, current);

  useEffect(() => {
    setDpr(motionActive ? getSsbhAdaptiveDpr(resolvedBaseDpr, current) : resolvedBaseDpr);
  }, [current, motionActive, resolvedBaseDpr, setDpr]);

  // Keep the drawing buffer at full device resolution across viewport resizes.
  // With a `demand` frameloop, a regressed/low DPR (set during interaction or
  // motion) would otherwise persist as a stretched, blurry buffer after the
  // panel or window changes size — nothing repaints until the next interaction.
  // Resizing therefore snaps DPR back to base and forces one fresh frame.
  useEffect(() => {
    const applyNativeSize = () => {
      setDpr(resolvedBaseDpr);
      gl.setPixelRatio(resolvedBaseDpr);
      gl.setSize(viewportWidth, viewportHeight, false);
      invalidate();
    };
    applyNativeSize();
    let raf2 = 0;
    let raf3 = 0;
    const raf1 = requestAnimationFrame(() => {
      applyNativeSize();
      raf2 = requestAnimationFrame(() => {
        applyNativeSize();
        raf3 = requestAnimationFrame(applyNativeSize);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      if (raf3) cancelAnimationFrame(raf3);
    };
  }, [viewportWidth, viewportHeight, resolvedBaseDpr, gl, setDpr, invalidate]);

  useEffect(() => {
    const target = gl.domElement.parentElement;
    if (!target) return;
    let raf = 0;
    const applyObservedSize = () => {
      const width = Math.max(1, Math.round(target.clientWidth));
      const height = Math.max(1, Math.round(target.clientHeight));
      setDpr(resolvedBaseDpr);
      gl.setPixelRatio(resolvedBaseDpr);
      gl.setSize(width, height, false);
      invalidate();
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(applyObservedSize);
    });
    observer.observe(target);
    applyObservedSize();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [gl, resolvedBaseDpr, setDpr, invalidate]);

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

function CanvasContentInvalidator({
  textureDataMap,
  drawMaterialBindingsByDrawKey,
  drawListSignature,
}: {
  textureDataMap: ReadonlyMap<string, NutexbTextureData>;
  drawMaterialBindingsByDrawKey: ReadonlyMap<string, ResolvedMaterialBinding>;
  /** Mesh draw identity; demand frameloop does not repaint when only draws change. */
  drawListSignature: string;
}) {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    invalidate();
    const raf = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(raf);
  }, [textureDataMap, drawMaterialBindingsByDrawKey, drawListSignature, invalidate]);

  return null;
}

/**
 * On a `demand` frameloop, switching back from `previewSuspended` (frameloop="never")
 * does not auto-render. The scene can change while frozen — e.g. a model is (re)loaded
 * behind an open modal — so force a render on resume to flush the latest draws instead
 * of leaving the last (stale) frame on screen.
 */
function FrameLoopResumeInvalidator({ suspended }: { suspended: boolean }) {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (suspended) return;
    invalidate();
    const raf = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(raf);
  }, [suspended, invalidate]);

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
const _attachGuestLocalM = new Matrix4();
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

function DrawMeshUnifiedPbr({
  draw,
  slots,
  binding,
  texturePool,
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
  slots: { kind: PbrSlotKind; path: string; data: NutexbTextureData }[];
  binding: ResolvedMaterialBinding | null;
  texturePool: SceneTexturePool;
  textureFlipY: boolean;
  materialDebugViewMode: MaterialDebugViewMode;
  previewRenderStyle: PreviewRenderStyle;
  animeKeyLightDir: Vector3;
}) {
  // Upload decoded nutexb pixels directly as pooled DataTextures (scene-editor
  // core path), sharing GPU textures across draws/instances by content key.
  const byKind = useMemo<Partial<Record<PbrSlotKind, Texture>>>(() => {
    const result: Partial<Record<PbrSlotKind, Texture>> = {};
    if (!binding) return result;
    for (const s of slots) {
      const poolKey = `${buildTexturePoolKey(s.path, s.kind, binding, s.data.width, s.data.height)}|v${textureDataIdentity(s.data)}`;
      result[s.kind] = texturePool.acquire(poolKey, () =>
        createDataTexture(s.data, s.kind, binding, s.path),
      );
    }
    return result;
  }, [slots, texturePool, binding]);
  useLayoutEffect(() => {
    for (const s of slots) {
      const t = byKind[s.kind];
      if (t && s.kind !== "cubeMap") {
        t.flipY = textureFlipY;
        t.needsUpdate = true;
      }
    }
  }, [byKind, slots, textureFlipY]);
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
  const materialTextureKey = slots
    .map((s) => `${s.kind}:${s.path}:${s.data.width}x${s.data.height}:v${textureDataIdentity(s.data)}`)
    .sort()
    .join("|");
  if (materialDebugViewMode === "baseColor") {
    return (
      <DrawMeshContainer draw={draw} ignoreRaycast={ignoreRaycast} skeleton={skeleton}>
        <meshBasicMaterial
          key={`basic|${materialTextureKey}`}
          map={byKind.map}
          side={DoubleSide}
          wireframe={wireframe}
        />
      </DrawMeshContainer>
    );
  }
  return (
    <DrawMeshContainer draw={draw} ignoreRaycast={ignoreRaycast} skeleton={skeleton}>
      <meshStandardMaterial
        key={`${exvsActive ? "exvs" : "std"}|${materialTextureKey}`}
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
  binding: ResolvedMaterialBinding | null,
  textureDataMap: ReadonlyMap<string, NutexbTextureData>,
  materialDebugViewMode: MaterialDebugViewMode,
  normalMapEnabled: boolean,
): { kind: PbrSlotKind; path: string; data: NutexbTextureData }[] {
  const slots: { kind: PbrSlotKind; path: string; data: NutexbTextureData }[] = [];
  if (!binding) return slots;
  const mode = materialDebugViewMode;
  const add = (kind: PbrSlotKind, allowed: boolean): void => {
    if (!allowed) return;
    const path = pathForSlot(binding, kind);
    if (!path) return;
    const data = lookupTextureData(textureDataMap, path);
    if (!data) return;
    slots.push({ kind, path, data });
  };
  add("map", mode === "full" || mode === "baseColor");
  add("normalMap", normalMapEnabled && (mode === "full" || mode === "normals"));
  add("roughnessMap", mode === "full" || mode === "roughnessMetalness");
  add("metalnessMap", mode === "full" || mode === "roughnessMetalness");
  add("emissiveMap", mode === "full" || mode === "emissive");
  add("aoMap", mode === "full" || mode === "roughnessMetalness");
  add("cubeMap", mode === "full" || mode === "reflection");
  return slots;
}

/**
 * Pool keys referenced by the CURRENT draws — mirrors the key each DrawMeshEntry
 * builds when it `acquire`s its textures. Used to prune textures left over from
 * previously loaded models so the shared pool does not grow unbounded across
 * "open folder" switches.
 */
function collectActivePoolKeys(
  draws: readonly BuiltMeshDraw[],
  drawMaterialBindingsByDrawKey: ReadonlyMap<string, ResolvedMaterialBinding>,
  textureDataMap: ReadonlyMap<string, NutexbTextureData>,
  materialDebugViewMode: MaterialDebugViewMode,
  normalMapEnabled: boolean,
): Set<string> {
  const keys = new Set<string>();
  for (const draw of draws) {
    const binding = drawMaterialBindingsByDrawKey.get(draw.key) ?? null;
    if (!binding) continue;
    const slots = buildDrawMeshSlots(binding, textureDataMap, materialDebugViewMode, normalMapEnabled);
    for (const s of slots) {
      keys.add(
        `${buildTexturePoolKey(s.path, s.kind, binding, s.data.width, s.data.height)}|v${textureDataIdentity(s.data)}`,
      );
    }
  }
  return keys;
}

const DrawMeshEntry = memo(function DrawMeshEntry({
  draw,
  textureDataMap,
  texturePool,
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
  textureDataMap: ReadonlyMap<string, NutexbTextureData>;
  texturePool: SceneTexturePool;
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
    () => buildDrawMeshSlots(binding, textureDataMap, materialDebugViewMode, normalMapEnabled),
    [binding, textureDataMap, materialDebugViewMode, normalMapEnabled],
  );

  return (
    <Suspense fallback={null}>
      {slots.length > 0 ? (
        <DrawMeshUnifiedPbr
          draw={draw}
          slots={slots}
          binding={binding}
          texturePool={texturePool}
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
  prev.textureDataMap === next.textureDataMap &&
  prev.texturePool === next.texturePool &&
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
  textureDataMap,
  texturePool,
  drawMaterialBindingsByDrawKey,
  materialDebugViewMode,
  textureFlipY,
  normalMapEnabled,
  visibleKeys,
  wireframe,
  ignoreMeshRaycastForBonePicking,
  previewRenderStyle,
  animeKeyLightDir,
  selectionOutline,
  motionVisibilityRows,
  motionForceVisibleDuringPlayback,
  skeleton,
}: Pick<
  SsbhModelCanvasProps,
  | "draws"
  | "textureDataMap"
  | "drawMaterialBindingsByDrawKey"
  | "materialDebugViewMode"
  | "textureFlipY"
  | "normalMapEnabled"
  | "visibleKeys"
  | "wireframe"
  | "previewRenderStyle"
  | "motionForceVisibleDuringPlayback"
> & {
  texturePool: SceneTexturePool;
  ignoreMeshRaycastForBonePicking: boolean;
  animeKeyLightDir: Vector3;
  skeleton: Skeleton | null;
  motionVisibilityRows: MotionVisibilityRow[] | null;
  selectionOutline: boolean;
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
        const binding = drawMaterialBindingsByDrawKey.get(d.key) ?? null;
        const visible = resolveDrawVisibility({
          drawKey: d.key,
          meshObjectName: d.meshObjectName,
          visibleKeys,
          motionVisibilityRows,
          forceVisibleDuringMotion: motionForceVisibleDuringPlayback,
          motionPlaybackActive: Boolean(skeleton),
        });
        const selected = selectionOutline;
        return (
          <DrawMeshEntry
            key={d.key}
            draw={d}
            textureDataMap={textureDataMap}
            texturePool={texturePool}
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
  textureDataMap,
  texturePool,
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
  selectionOutlineEnabled = false,
  hiddenPreviewInstanceIds,
  selectedBoneIndex,
  bonePointSize,
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
  sceneOverlay,
  hostInstanceTransformsRef,
  viewportControls = "default",
  onViewportSelectInstance,
  onViewportSelectInstances,
  viewportPickRefs,
  onMarqueeRectChange,
  exportHandleRef,
}: Omit<
  SsbhModelCanvasProps,
  | "previewSuspended"
  | "sceneOverlayAnimating"
  | "onViewportBoneSelectionClear"
  | "onBoneTransformHotkey"
  | "onUndoBonePose"
  | "onRedoBonePose"
  | "viewportControls"
  | "onViewportSelectInstance"
  | "onViewportSelectInstances"
> & {
  texturePool: SceneTexturePool;
  viewportControls?: "default" | "unreal";
  onViewportSelectInstance?: ViewportSelectHandler;
  onViewportSelectInstances?: ViewportMultiSelectHandler;
  viewportPickRefs: ViewportPickRefs & {
    selectableNodesRef: RefObject<SelectableNodeRegistry>;
    orbitActiveRef: RefObject<boolean>;
    rightMouseDownRef: RefObject<boolean>;
    gizmoDraggingRef: RefObject<boolean>;
    clickGestureRef: RefObject<{ x: number; y: number } | null>;
    marqueeActiveRef: RefObject<boolean>;
  };
  onMarqueeRectChange: (rect: ScreenRect | null) => void;
  exportHandleRef?: MutableRefObject<SsbhModelCanvasExportHandle | null>;
}) {
  const modelRootRef = useRef<Group>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const regress = useThree((s) => s.performance.regress);
  const invalidate = useThree((s) => s.invalidate);
  const playbackFrameRef = useRef<Map<string, number>>(new Map());
  const playbackObservationRef = useRef<Map<string, MotionPlaybackFrameObservation>>(new Map());
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
    const instanceIds = new Set(motionStatesByInstanceId.keys());
    for (const [instanceId, state] of motionStatesByInstanceId) {
      const nextObservation: MotionPlaybackFrameObservation = {
        frame: state.frame,
        clip: state.clip,
        poseEnabled: state.poseEnabled,
      };
      const previousObservation = playbackObservationRef.current.get(instanceId) ?? null;
      if (shouldSyncPlaybackFrame(previousObservation, nextObservation)) {
        playbackFrameRef.current.set(instanceId, state.frame);
      }
      playbackObservationRef.current.set(instanceId, nextObservation);
    }
    for (const instanceId of playbackObservationRef.current.keys()) {
      if (!instanceIds.has(instanceId)) {
        playbackObservationRef.current.delete(instanceId);
        playbackFrameRef.current.delete(instanceId);
      }
    }
  }, [motionStatesByInstanceId]);

  const handlePerformanceInteraction = useCallback(() => {
    regress();
    invalidate();
  }, [regress, invalidate]);

  const isUnrealViewport = viewportControls === "unreal";
  const unrealSelectionEnabled =
    isUnrealViewport && Boolean(onViewportSelectInstance && onViewportSelectInstances);

  const handleInstanceViewportClick = useCallback(
    (instanceId: string) => (e: { stopPropagation: () => void; nativeEvent: MouseEvent }) => {
      e.stopPropagation();
      if (!unrealSelectionEnabled || !onViewportSelectInstance) return;
      runViewportObjectPick(e.nativeEvent, instanceId, onViewportSelectInstance, {
        clickPickSelectionEnabled: true,
        refs: viewportPickRefs,
      });
    },
    [unrealSelectionEnabled, onViewportSelectInstance, viewportPickRefs],
  );

  const singleInstance = previewInstances.length <= 1;
  const visibleInstances = useMemo(() => {
    const byVisibility = previewInstances.filter((inst) => !hiddenPreviewInstanceIds.has(inst.id));
    if (previewViewMode === "single") {
      if (byVisibility.length === 0) return [];
      const active =
        (activePreviewInstanceId
          ? byVisibility.find((inst) => inst.id === activePreviewInstanceId)
          : null) ?? byVisibility[0]!;
      // Keep attached weapons/props visible when soloing the motion target.
      const keepIds = expandSingleViewWithAttachments(active.id, modelAttachments);
      const expanded = byVisibility.filter((inst) => keepIds.has(inst.id));
      return expanded.length > 0 ? expanded : [active];
    }
    return byVisibility;
  }, [
    previewInstances,
    hiddenPreviewInstanceIds,
    previewViewMode,
    activePreviewInstanceId,
    modelAttachments,
  ]);

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
  const hostMaterialDefaultsRef = useRef(new WeakMap<Material, {
    color: Color | null;
    opacity: number;
    transparent: boolean;
    depthWrite: boolean;
    depthTest: boolean;
    blending: Blending;
    side: Side;
  }>());
  const hostTintScratchRef = useRef(new Color());
  const hostEffectMaterialOverridesRef = useRef(new Map<Mesh, {
    original: Material | Material[];
    overrides: MeshBasicMaterial[];
  }>());
  const hostEffectTexturesRef = useRef(new Map<string, { source: Texture; texture: Texture }>());
  const efxColorExUniformsRef = useRef(new Map<MeshBasicMaterial, EfxColorExUniforms>());
  /**
   * SkinnedMesh uses bindMode "detached": skinning is pure bone.matrixWorld.
   * Attach offsets must live on a skeleton parent (not the mesh group), or the
   * rifle double-transforms / flies when the host animates.
   */
  const attachAnchorByInstanceIdRef = useRef<Map<string, Group>>(new Map());
  const { scene } = useThree();

  useEffect(() => {
    const anchors = attachAnchorByInstanceIdRef.current;
    return () => {
      for (const anchor of anchors.values()) {
        scene.remove(anchor);
        anchor.clear();
      }
      anchors.clear();
    };
  }, [scene]);

  useEffect(() => () => {
    for (const [mesh, override] of hostEffectMaterialOverridesRef.current) {
      mesh.material = override.original;
      for (const material of override.overrides) material.dispose();
    }
    hostEffectMaterialOverridesRef.current.clear();
    for (const entry of hostEffectTexturesRef.current.values()) entry.texture.dispose();
    hostEffectTexturesRef.current.clear();
  }, []);

  useEffect(() => {
    if (!exportHandleRef) return;
    exportHandleRef.current = {
      getExportObjectsByInstanceId: () => {
        const map = new Map<string, { object: Object3D }>();
        for (const [instanceId, group] of instanceGroupRefs.current.entries()) {
          map.set(instanceId, { object: group });
        }
        return map;
      },
    };
    return () => {
      exportHandleRef.current = null;
    };
  }, [exportHandleRef, previewInstances]);

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
      const isPlaying = Boolean(motionState?.poseEnabled && motionState.playing && motionState.clip);
      if (isScrubTarget || isPlaying) {
        continue;
      }
      const sampledLocals =
        motionState?.poseEnabled &&
        motionState.sample &&
        motionState.sample.boneLocals.length === runtime.bones.length
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
      const f = normalizeMotionFrame(
        scrubFrame,
        activeClip.finalFrameIndex,
        frameCount,
        activeLoop,
      );
      playbackFrameRef.current.set(motionControlInstanceId, f);
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
    const hostMotionFrames = hostInstanceTransformsRef?.current;
    const hasHostMotion = Boolean(
      hostMotionFrames && Array.from(hostMotionFrames.values()).some((transform) => Number.isFinite(transform.motionFrame)),
    );
    if (!anyMotionPlaying && !hasHostMotion) {
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
      const hostMotionFrame = hostMotionFrames?.get(instanceId)?.motionFrame;
      const hostDriven = Number.isFinite(hostMotionFrame);
      if (!motionState.poseEnabled || (!motionState.playing && !hostDriven) || !motionState.clip) {
        continue;
      }
      const runtime = gpuRuntimeByInstance.get(instanceId);
      if (!runtime) {
        continue;
      }
      const clip = motionState.clip;
      const current = playbackFrameRef.current.get(instanceId) ?? motionState.frame;
      const advanceStart = performance.now();
      const { nextFrame, shouldStopPlayback } = hostDriven
        ? { nextFrame: hostMotionFrame as number, shouldStopPlayback: false }
        : advanceMotionFrame(
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
      const f = normalizeMotionFrame(
        nextFrame,
        clip.finalFrameIndex,
        frameCount,
        motionState.loop,
      );
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

      if (instanceId === motionControlInstanceId && !hostDriven) {
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
    const anchors = attachAnchorByInstanceIdRef.current;

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

      // Host: pure skeleton world (bones must not sit under the mesh group —
      // SkinnedMesh bindMode is "detached").
      for (const root of parentRuntime.rootBones) {
        if (root.parent && !(root.parent as Bone).isBone) {
          root.removeFromParent();
        }
      }
      updateGpuSkeletonWorld(parentRuntime);
      _attachParentM.copy(parentBone.matrixWorld);

      // Guest attach bone from LOCAL bone chain only (never includes attach anchor).
      // Temporarily walk while bones may already hang under last frame's anchor.
      boneLocalChainMatrix(childBone, _attachGuestLocalM);

      _attachFinalM.fromArray(
        composeGuestAttachRootMatrix(_attachParentM.toArray(), _attachGuestLocalM.toArray()),
      );

      let anchor = anchors.get(attachment.childInstanceId);
      if (!anchor) {
        anchor = new Group();
        anchor.name = `attach-anchor:${attachment.childInstanceId}`;
        scene.add(anchor);
        anchors.set(attachment.childInstanceId, anchor);
      }
      // Drive skeleton roots via anchor; keep mesh group at identity (no double transform).
      for (const root of childRuntime.rootBones) {
        if (root.parent !== anchor) {
          anchor.add(root);
        }
      }
      anchor.matrixAutoUpdate = false;
      anchor.matrix.copy(_attachFinalM);
      anchor.updateMatrixWorld(true);
      updateGpuSkeletonWorld(childRuntime);
      childRuntime.skeleton.update();

      // Mesh group must stay identity so detached skinning is not multiplied again.
      childGroup.matrixAutoUpdate = false;
      childGroup.matrix.identity();
      childGroup.position.set(0, 0, 0);
      childGroup.quaternion.identity();
      childGroup.scale.set(1, 1, 1);
      childGroup.updateMatrix();
      childGroup.updateMatrixWorld(true);

      attachedChildIds.add(attachment.childInstanceId);
    }

    // Detach anchors for guests that are no longer attached.
    for (const [instanceId, anchor] of anchors.entries()) {
      if (attachedChildIds.has(instanceId)) continue;
      const runtime = gpuRuntimeByInstance.get(instanceId);
      if (runtime) {
        for (const root of runtime.rootBones) {
          if (root.parent === anchor) {
            anchor.remove(root);
          }
        }
        updateGpuSkeletonWorld(runtime);
        runtime.skeleton.update();
      }
      scene.remove(anchor);
      anchors.delete(instanceId);
    }

    const activeEffectMeshes = new Set<Mesh>();
    const activeEffectInstanceIds = new Set<string>();
    for (let i = 0; i < visibleInstances.length; i++) {
      const inst = visibleInstances[i];
      const group = instanceGroupRefs.current.get(inst.id);
      if (!group || attachedChildIds.has(inst.id)) {
        continue;
      }
      const hostTransform = hostInstanceTransformsRef?.current?.get(inst.id);
      const effectMaterialActive =
        hostTransform?.effectMaterialActive ?? Boolean(hostTransform?.effectTexture);
      let effectTexture: Texture | null = null;
      if (hostTransform?.effectTexture) {
        activeEffectInstanceIds.add(inst.id);
        let cached = hostEffectTexturesRef.current.get(inst.id);
        if (!cached || cached.source !== hostTransform.effectTexture) {
          cached?.texture.dispose();
          const texture = hostTransform.effectTexture.clone();
          texture.flipY = false;
          texture.needsUpdate = true;
          cached = { source: hostTransform.effectTexture, texture };
          hostEffectTexturesRef.current.set(inst.id, cached);
        }
        const uvScale = hostTransform.effectUvScale ?? [1, 1];
        const uvOffset = hostTransform.effectUvOffset ?? [0, 0];
        cached.texture.repeat.set(uvScale[0], uvScale[1]);
        cached.texture.offset.set(uvOffset[0], uvOffset[1]);
        cached.texture.updateMatrix();
        effectTexture = cached.texture;
      }
      // The offset map keeps the source texture: its UV set is applied in the injected
      // shader, not through three's per-texture matrix.
      const effectUvOffsetTexture = hostTransform?.effectUvOffsetTexture ?? null;
      const effectDistortion = hostTransform?.effectDistortion ?? [0, 0];
      const effectOffsetUvScale = hostTransform?.effectOffsetUvScale ?? [1, 1];
      const effectOffsetUvOffset = hostTransform?.effectOffsetUvOffset ?? [0, 0];
      const effectBaseLevel = hostTransform?.effectFullBrightness ? 1 : 0.5;
      const effectAddMix = hostTransform?.effectAddMix ? 1 : 0;
      const effectColorBorder = hostTransform?.effectColorBorder ? 1 : 0;
      const effectOffsetBorder = hostTransform?.effectOffsetBorder ? 1 : 0;
      group.visible = hostTransform?.visible ?? true;
      if (hostTransform) {
        group.matrixAutoUpdate = true;
        group.position.set(...hostTransform.position);
        group.rotation.set(...hostTransform.rotation);
        group.scale.set(...hostTransform.scale);
        group.updateMatrix();
        group.updateMatrixWorld(true);
      } else if (!group.matrixAutoUpdate) {
        group.matrixAutoUpdate = true;
        const pos = instanceLayoutPosition(i, previewInstances.length);
        group.position.set(pos[0], pos[1], pos[2]);
        group.updateMatrix();
        group.updateMatrixWorld(true);
      }

      group.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        let materials: Material[];
        const currentOverride = hostEffectMaterialOverridesRef.current.get(object);
        if (effectMaterialActive) {
          activeEffectMeshes.add(object);
          let override = currentOverride;
          if (!override) {
            const original = object.material;
            const originals = Array.isArray(original) ? original : [original];
            const overrides = originals.map((material) => {
              const override = new MeshBasicMaterial({
                alphaTest: 0.01,
                blending: material.blending,
                color: new Color(effectBaseLevel, effectBaseLevel, effectBaseLevel),
                depthTest: material.depthTest,
                depthWrite: material.depthWrite,
                map: effectTexture,
                opacity: material.opacity,
                side: material.side,
                toneMapped: false,
                transparent: true,
                vertexColors: Boolean(object.geometry.getAttribute("color")),
              });
              efxColorExUniformsRef.current.set(override, attachEfxColorExUniforms(override));
              return override;
            });
            override = { original, overrides };
            hostEffectMaterialOverridesRef.current.set(object, override);
            object.material = Array.isArray(original) ? overrides : overrides[0]!;
          }
          for (const material of override.overrides) {
            if (material.map !== effectTexture) {
              material.map = effectTexture;
              material.needsUpdate = true;
            }
            material.color.setScalar(effectBaseLevel);
            const uniforms = efxColorExUniformsRef.current.get(material);
            if (uniforms) {
              uniforms.efxUvOffsetMap.value = effectUvOffsetTexture;
              uniforms.efxHasUvOffsetMap.value = effectUvOffsetTexture ? 1 : 0;
              uniforms.efxDistortion.value = [effectDistortion[0], effectDistortion[1]];
              uniforms.efxOffsetUvScale.value = [effectOffsetUvScale[0], effectOffsetUvScale[1]];
              uniforms.efxOffsetUvOffset.value = [effectOffsetUvOffset[0], effectOffsetUvOffset[1]];
              uniforms.efxColorBorder.value = effectColorBorder;
              uniforms.efxOffsetBorder.value = effectOffsetBorder;
              uniforms.efxAddMix.value = effectAddMix;
            }
          }
          materials = override.overrides;
        } else {
          if (currentOverride) {
            object.material = currentOverride.original;
            for (const material of currentOverride.overrides) {
              efxColorExUniformsRef.current.delete(material);
              material.dispose();
            }
            hostEffectMaterialOverridesRef.current.delete(object);
          }
          materials = Array.isArray(object.material) ? object.material : [object.material];
        }
        for (const material of materials) {
          const tintable = material as Material & { color?: Color; opacity: number };
          let defaults = hostMaterialDefaultsRef.current.get(material);
          if (hostTransform && !defaults) {
            defaults = {
              color: tintable.color?.clone() ?? null,
              opacity: tintable.opacity,
              transparent: material.transparent,
              depthWrite: material.depthWrite,
              depthTest: material.depthTest,
              blending: material.blending,
              side: material.side,
            };
            hostMaterialDefaultsRef.current.set(material, defaults);
          }
          if (!defaults) continue;

          const previousPipeline = [
            material.transparent,
            material.depthWrite,
            material.depthTest,
            material.blending,
            material.side,
          ] as const;
          if (hostTransform) {
            const color = hostTransform.color ?? [1, 1, 1, 1];
            if (tintable.color && defaults.color) {
              tintable.color.copy(defaults.color).multiply(
                hostTintScratchRef.current.setRGB(color[0], color[1], color[2]),
              );
            }
            tintable.opacity = defaults.opacity * Math.max(0, color[3]);
            material.transparent = defaults.transparent || color[3] < 0.999;
            material.depthWrite = hostTransform.depthWrite ?? defaults.depthWrite;
            material.depthTest = hostTransform.depthTest ?? defaults.depthTest;
            material.blending = hostTransform.blending ?? defaults.blending;
            material.side = hostTransform.side ?? defaults.side;
          } else {
            if (tintable.color && defaults.color) tintable.color.copy(defaults.color);
            tintable.opacity = defaults.opacity;
            material.transparent = defaults.transparent;
            material.depthWrite = defaults.depthWrite;
            material.depthTest = defaults.depthTest;
            material.blending = defaults.blending;
          }
          if (previousPipeline[0] !== material.transparent ||
              previousPipeline[1] !== material.depthWrite ||
              previousPipeline[2] !== material.depthTest ||
              previousPipeline[3] !== material.blending) {
            material.needsUpdate = true;
          }
        }
      });
    }
    for (const [mesh, override] of hostEffectMaterialOverridesRef.current) {
      if (activeEffectMeshes.has(mesh)) continue;
      mesh.material = override.original;
      for (const material of override.overrides) material.dispose();
      hostEffectMaterialOverridesRef.current.delete(mesh);
    }
    for (const [instanceId, cached] of hostEffectTexturesRef.current) {
      if (activeEffectInstanceIds.has(instanceId)) continue;
      cached.texture.dispose();
      hostEffectTexturesRef.current.delete(instanceId);
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
          const isActive = activePreviewInstanceId === inst.id;
          const isInteractionTarget = isActive;
          const instSkel = inst.bundle.skel ? (inst.bundle.skel as SkelDataJson) : null;
          const instMotionState = motionStatesByInstanceId.get(inst.id) ?? null;
          const instMotionSample = instMotionState?.poseEnabled ? (instMotionState.sample ?? null) : null;
          const instMotionLocals =
            instMotionSample && instSkel?.bones?.length === instMotionSample.boneLocals.length
              ? instMotionSample.boneLocals
              : null;
          const skelHasBones = instSkel !== null && instSkel.bones.length > 0;
          const showStaticSkeleton =
            showSkeleton && !skelHasBones && Boolean(skeletonGeometry) && isInteractionTarget;
          const gpuRuntime = gpuRuntimeByInstance.get(inst.id) ?? null;
          const renderState = resolveMotionInstanceRenderState({
            isActive,
            hasRuntime: gpuRuntime !== null,
            poseEnabled: Boolean(instMotionState?.poseEnabled) || (motionScrubbing && isActive),
            playing: Boolean(instMotionState?.playing) || (motionScrubbing && isActive),
            hasMotionSample: Boolean(instMotionLocals),
            skeletonBoneCount: instSkel?.bones.length ?? 0,
            sampledBoneCount: instMotionLocals?.length ?? 0,
          });
          // Attachment drives the GPU skeleton (anchor). Without forcing GPU skin,
          // idle guests use BonePreviewRig CPU armature and ignore the glue.
          const involvedInAttachment = modelAttachments.some(
            (edge) =>
              edge.parentInstanceId === inst.id || edge.childInstanceId === inst.id,
          );
          const motionPoseActive = renderState.motionPoseActive;
          const gpuSkinningActive =
            Boolean(gpuRuntime) && (renderState.gpuSkinningActive || involvedInAttachment);
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
              onClick={unrealSelectionEnabled ? handleInstanceViewportClick(inst.id) : undefined}
              ref={(el) => {
                if (el) {
                  instanceGroupRefs.current.set(inst.id, el);
                  if (isUnrealViewport) {
                    viewportPickRefs.selectableNodesRef.current.set(inst.id, el);
                  }
                } else {
                  instanceGroupRefs.current.delete(inst.id);
                  viewportPickRefs.selectableNodesRef.current.delete(inst.id);
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
                  bonePointSize={bonePointSize}
                  transformMode={boneTransformMode}
                  poseResetNonce={bonePoseResetNonce}
                  showSkeletonLines={showSkeleton}
                  showJointHandles={showSkeleton}
                  orbitControlsRef={controlsRef}
                  gizmoDraggingRef={viewportPickRefs.gizmoDraggingRef}
                  onSelectBone={onViewportBoneSelect}
                  bonePoseGetterRef={bonePoseGetterRef}
                  bonePoseApplyNonce={bonePoseApplyNonce}
                  bonePoseToApply={bonePoseToApply}
                  onBonePoseApplyConsumed={onBonePoseApplyConsumed}
                  onBonePoseCommit={onBonePoseCommit}
                  motionBoneLocals={
                    renderState.boneEditingEnabled &&
                    instMotionLocals &&
                    instMotionLocals.length === instSkel!.bones.length
                      ? instMotionLocals
                      : null
                  }
                  motionPoseActive={motionPoseActive}
                  gpuSkinningActive={gpuSkinningActive}
                  motionDriving={Boolean(instMotionState?.playing)}
                />
              ) : null}
              <DrawMeshes
                draws={instDraws}
                textureDataMap={textureDataMap}
                texturePool={texturePool}
                drawMaterialBindingsByDrawKey={drawMaterialBindingsByDrawKey}
                materialDebugViewMode={materialDebugViewMode}
                textureFlipY={textureFlipY}
                normalMapEnabled={normalMapEnabled}
                visibleKeys={visibleKeys}
                wireframe={wireframe}
                ignoreMeshRaycastForBonePicking={
                  Boolean(instMotionState?.playing) ||
                  (motionScrubbing && isActive) ||
                  (skelHasBones && isActive)
                }
                previewRenderStyle={previewRenderStyle}
                animeKeyLightDir={animeKeyLightDir}
                selectionOutline={shouldShowPreviewSelectionOutline({
                  isActive,
                  selectionOutlineEnabled,
                })}
                motionVisibilityRows={
                  instMotionState?.playing || (motionScrubbing && isActive)
                    ? null
                    : isActive
                      ? (instMotionSample?.visibility ?? null)
                      : null
                }
                skeleton={gpuSkeleton}
                motionForceVisibleDuringPlayback={motionForceVisibleDuringPlayback}
              />
              {showStaticSkeleton && skeletonGeometry ? <SkeletonLines geometry={skeletonGeometry} /> : null}
            </group>
          );
        })}
        {sceneOverlay}
      </group>

      {isUnrealViewport ? (
        <>
          {unrealSelectionEnabled ? (
            <ViewportSelectionController
              enabled
              selectableNodesRef={viewportPickRefs.selectableNodesRef}
              orbitActiveRef={viewportPickRefs.orbitActiveRef}
              gizmoDraggingRef={viewportPickRefs.gizmoDraggingRef}
              onSelectNode={onViewportSelectInstance!}
              onSelectNodes={onViewportSelectInstances!}
              onMarqueeRectChange={onMarqueeRectChange}
              clickGestureRef={viewportPickRefs.clickGestureRef}
              marqueeActiveRef={viewportPickRefs.marqueeActiveRef}
            />
          ) : null}
          <StageOrbitControls
            controlsRef={controlsRef}
            orbitActiveRef={viewportPickRefs.orbitActiveRef}
            rightMouseDownRef={viewportPickRefs.rightMouseDownRef}
          />
        </>
      ) : (
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
      )}

      <MotionCameraController
        enabled={!activeMotionState?.playing && motionApplyCamera && Boolean(activeMotionSample?.camera)}
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
          sectionColor={BLENDER_GRID_SECTION_COLOR}
          cellColor={BLENDER_GRID_CELL_COLOR}
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
  const {
    background,
    previewSuspended = false,
    sceneOverlayAnimating = false,
    motionScrubbing,
    viewportControls = "default",
    onViewportSelectInstance,
    onViewportSelectInstances,
    ...sceneProps
  } = props;
  const canvasExportHandleRef = sceneProps.exportHandleRef;
  const {
    onViewportBoneSelectionClear,
    onBoneTransformHotkey,
    onUndoBonePose,
    onRedoBonePose,
    exportHandleRef: _exportHandleRef,
    ...restSceneProps
  } = sceneProps;
  const isUnrealViewport = viewportControls === "unreal";
  const [marqueeRect, setMarqueeRect] = useState<ScreenRect | null>(null);
  const orbitActiveRef = useRef(false);
  const rightMouseDownRef = useRef(false);
  const clickGestureRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeActiveRef = useRef(false);
  const gizmoDraggingRef = useRef(false);
  const selectableNodesRef = useRef<SelectableNodeRegistry>(new Map());
  const viewportPickRefs = useMemo(
    () => ({
      orbitActiveRef,
      rightMouseDownRef,
      clickGestureRef,
      marqueeActiveRef,
      gizmoDraggingRef,
      selectableNodesRef,
    }),
    [],
  );
  const { previewInstances, activePreviewInstanceId } = restSceneProps;
  // Shared GPU texture pool for the whole canvas — decoded nutexb DataTextures are
  // deduped by content key across draws/instances (scene-editor core path).
  const texturePool = useMemo(() => new SceneTexturePool(), []);
  useEffect(() => () => texturePool.disposeAll(), [texturePool]);
  // Free GPU textures left behind by previously loaded models. Runs after the
  // current draws have acquired their textures, then disposes any pool entry no
  // current draw references — prevents unbounded VRAM growth across "open folder".
  useEffect(() => {
    texturePool.pruneExcept(
      collectActivePoolKeys(
        restSceneProps.draws,
        restSceneProps.drawMaterialBindingsByDrawKey,
        restSceneProps.textureDataMap,
        restSceneProps.materialDebugViewMode,
        restSceneProps.normalMapEnabled,
      ),
    );
  }, [
    texturePool,
    restSceneProps.draws,
    restSceneProps.drawMaterialBindingsByDrawKey,
    restSceneProps.textureDataMap,
    restSceneProps.materialDebugViewMode,
    restSceneProps.normalMapEnabled,
  ]);
  const activeInstance = activePreviewInstanceId
    ? (previewInstances.find((i) => i.id === activePreviewInstanceId) ?? null)
    : null;
  const skel = activeInstance?.bundle?.skel ? (activeInstance.bundle.skel as SkelDataJson) : null;
  const skelHasBones = skel !== null && skel.bones.length > 0;
  const selectedBoneIndex = restSceneProps.selectedBoneIndex;
  const anyMotionPlaying = useMemo(
    () => Array.from(restSceneProps.motionStatesByInstanceId.values()).some((s) => s.playing),
    [restSceneProps.motionStatesByInstanceId],
  );
  const renderLoopActive = anyMotionPlaying || sceneOverlayAnimating || motionScrubbing;
  const drawComplexity = useMemo(
    () => measureDrawComplexity(restSceneProps.draws),
    [restSceneProps.draws],
  );
  const drawListSignature = useMemo(
    () => restSceneProps.draws.map((draw) => draw.key).join("\0"),
    [restSceneProps.draws],
  );
  const canvasPerformanceProfile = useMemo(
    () =>
      getSsbhCanvasPerformanceProfile({
        drawCount: drawComplexity.drawCount,
        triangleCount: drawComplexity.triangleCount,
        motionPlaying: anyMotionPlaying || sceneOverlayAnimating,
        motionScrubbing,
        previewRenderStyle: restSceneProps.previewRenderStyle,
      }),
    [drawComplexity, anyMotionPlaying, motionScrubbing, restSceneProps.previewRenderStyle, sceneOverlayAnimating],
  );
  const adaptivePerformanceOptions = useMemo(
    () =>
      getSsbhAdaptivePerformanceOptions({
        drawCount: drawComplexity.drawCount,
        triangleCount: drawComplexity.triangleCount,
        motionPlaying: anyMotionPlaying || sceneOverlayAnimating,
        motionScrubbing,
        previewRenderStyle: restSceneProps.previewRenderStyle,
      }),
    [drawComplexity, anyMotionPlaying, motionScrubbing, restSceneProps.previewRenderStyle, sceneOverlayAnimating],
  );
  const perfMonitorOptions = useMemo(
    () =>
      getSsbhPerfMonitorOptions({
        drawCount: drawComplexity.drawCount,
        triangleCount: drawComplexity.triangleCount,
        motionPlaying: anyMotionPlaying || sceneOverlayAnimating,
        motionScrubbing,
        previewRenderStyle: restSceneProps.previewRenderStyle,
      }),
    [drawComplexity, anyMotionPlaying, motionScrubbing, restSceneProps.previewRenderStyle, sceneOverlayAnimating],
  );

  useRenderDebug("SsbhModelCanvas", {
    motionPlaying: anyMotionPlaying,
    sceneOverlayAnimating,
    motionScrubbing,
    previewSuspended,
    draws: restSceneProps.draws.length,
    previewInstances: restSceneProps.previewInstances.length,
    activePreviewInstanceId: restSceneProps.activePreviewInstanceId ?? "null",
    selectedBoneIndex: selectedBoneIndex ?? -1,
    bonePointSize: restSceneProps.bonePointSize,
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
      onContextMenu={(ev) => {
        if (isUnrealViewport) ev.preventDefault();
      }}
      onKeyDown={handleCanvasKeyDown}
    >
      {isUnrealViewport ? <ViewportMarqueeOverlay rect={marqueeRect} /> : null}
      <Canvas
        className="h-full w-full touch-none"
        frameloop={previewSuspended ? "never" : renderLoopActive ? "always" : "demand"}
        gl={{
          antialias: canvasPerformanceProfile.antialias,
          alpha: false,
          powerPreference: "high-performance",
          logarithmicDepthBuffer: true,
        }}
        performance={adaptivePerformanceOptions}
        dpr={canvasPerformanceProfile.dpr}
        camera={{ position: [2.4, 1.6, 2.8], fov: 50, near: 0.02, far: 5e6 }}
        onPointerMissed={
          isUnrealViewport
            ? undefined
            : () => {
                if (selectedBoneIndex !== null) {
                  onViewportBoneSelectionClear();
                }
              }
        }
      >
        <AdaptiveCanvasPerformanceController
          baseDprRange={canvasPerformanceProfile.dpr}
          motionActive={renderLoopActive}
          perfMonitorOptions={perfMonitorOptions}
          previewRenderStyle={restSceneProps.previewRenderStyle}
          showStats={restSceneProps.showStats}
        />
        <CanvasContentInvalidator
          textureDataMap={restSceneProps.textureDataMap}
          drawMaterialBindingsByDrawKey={restSceneProps.drawMaterialBindingsByDrawKey}
          drawListSignature={drawListSignature}
        />
        <FrameLoopResumeInvalidator suspended={previewSuspended} />
        <Scene
          {...restSceneProps}
          exportHandleRef={canvasExportHandleRef}
          background={background}
          motionScrubbing={motionScrubbing}
          texturePool={texturePool}
          viewportControls={viewportControls}
          onViewportSelectInstance={onViewportSelectInstance}
          onViewportSelectInstances={onViewportSelectInstances}
          viewportPickRefs={viewportPickRefs}
          onMarqueeRectChange={setMarqueeRect}
        />
      </Canvas>
    </div>
  );
});
