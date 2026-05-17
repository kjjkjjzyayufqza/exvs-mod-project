import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  GizmoHelper,
  GizmoViewport,
  Grid,
  Sphere,
  Html,
  Stats,
  Environment,
  Lightformer,
} from "@react-three/drei";
import {
  EffectComposer,
  Outline,
} from "@react-three/postprocessing";
import { BlendFunction, KernelSize } from "postprocessing";
import {
  useRef,
  useCallback,
  useMemo,
  useEffect,
  memo,
  forwardRef,
  useImperativeHandle,
  Fragment,
  useState,
  type RefObject,
} from "react";
import * as THREE from "three";
import { mergeBufferGeometries } from "three-stdlib";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import type {
  SsbhModelPreviewBundle,
  BuiltMeshDraw,
} from "@/page/TestEditor/components/ssbh-model-preview/types";
import {
  buildDrawListFromBundle,
  buildMatlLookup,
  buildTextureRefToPathMap,
  resolveMaterialBinding,
  type ResolvedMaterialBinding,
  type ResolvedTextureSampling,
  type TexturePreviewSlotKey,
} from "@/page/TestEditor/components/ssbh-model-preview/meshFromSsbh";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";
import type { NutexbRgbaData } from "@/page/TestEditor/components/ssbh-model-preview/nutexbPreviewCache";
import type { PlacementRow } from "../types/placement";
import type { GraphicParam } from "./GraphicParamPanel";
import { deriveSceneLightingFromGraphicParams } from "../utils/graphicParamSceneLighting";
import { formatPlacementViewportNodeId } from "../utils/placementNodeId";
import type { SceneDrawStats } from "./SceneViewportOverlay";
import type { TransformData } from "./StagePropertyEditor";
import type { PreviewRenderStyle } from "@/page/TestEditor/components/ssbh-model-preview/SsbhModelPreviewContext";
import { DEFAULT_PREVIEW_3D_BACKGROUND } from "@/page/TestEditor/components/ssbh-model-preview/SsbhModelPreviewContext";
import {
  getSsbhAdaptivePerformanceOptions,
  getSsbhCanvasPerformanceProfile,
  measureDrawComplexity,
  shouldDisableSsbhAnimePostFx,
} from "@/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance";
import { animeExvsOnBeforeCompile, createAnimeExvsUniforms } from "@/page/TestEditor/components/ssbh-model-preview/animeExvsMeshStandard";
import { AnimePreviewPostFx } from "@/page/TestEditor/components/ssbh-model-preview/AnimePreviewPostFx";
import {
  createPreviewSelectionUniforms,
  previewSelectionOnBeforeCompile,
} from "@/page/TestEditor/components/ssbh-model-preview/previewSelectionMaterial";
import { SceneTexturePool } from "../utils/SceneTexturePool";
import {
  shouldInvalidateViewportForGizmoEvent,
  shouldRenderGizmoControls,
  shouldSyncSceneStateForGizmoEvent,
} from "../utils/sceneEditorGizmoSync";
import {
  canEditSceneNode,
  canRenderSceneNode,
  type SceneNodeLockMap,
  type SceneNodeVisibilityMap,
} from "../utils/sceneEditorNodeState";
import { SceneTransformControls } from "./SceneTransformControls";
import {
  hasTextureOverridesForObject,
  isTexturePathEnabledForObject,
  type ObjectTextureLoadState,
} from "../utils/sceneTextureInventory";

const DEG2RAD = Math.PI / 180;

type SelectedGroupMap = Map<string, THREE.Group>;
const OUTLINE_EDGE_COLOR = new THREE.Color("#ff8c00").getHex();
const OUTLINE_HIDDEN_COLOR = new THREE.Color("#4a3000").getHex();
const EMPTY_NODE_VISIBILITY: SceneNodeVisibilityMap = {};
const EMPTY_NODE_LOCKS: SceneNodeLockMap = {};

function SceneSelectionOutline({ selectedGroupsRef }: { selectedGroupsRef: React.RefObject<SelectedGroupMap> }) {
  const [outlineMeshes, setOutlineMeshes] = useState<THREE.Mesh[]>([]);
  const invalidate = useThree((s) => s.invalidate);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const groups = selectedGroupsRef.current;
    const meshes: THREE.Mesh[] = [];
    for (const group of groups.values()) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          meshes.push(child);
        }
      });
    }
    if (meshes.length !== prevCountRef.current || meshes.some((m, i) => m !== outlineMeshes[i])) {
      prevCountRef.current = meshes.length;
      setOutlineMeshes(meshes);
      invalidate();
    }
  });

  if (outlineMeshes.length === 0) return null;

  return (
    <EffectComposer multisampling={0} autoClear={false}>
      <Outline
        selection={outlineMeshes}
        edgeStrength={4}
        pulseSpeed={0}
        visibleEdgeColor={OUTLINE_EDGE_COLOR}
        hiddenEdgeColor={OUTLINE_HIDDEN_COLOR}
        blur
        kernelSize={KernelSize.SMALL}
        xRay={true}
        blendFunction={BlendFunction.ALPHA}
      />
    </EffectComposer>
  );
}

/** Blender-style finite grid plane (aligned with TestEditor ssbh-model-preview). */
const GRID_PLANE_WIDTH = 200;
const GRID_PLANE_HEIGHT = 200;
const GRID_FADE_DISTANCE = 5e6;
const BLENDER_GRID_CELL_COLOR = "#464646";
const BLENDER_GRID_SECTION_COLOR = "#545454";

/**
 * Scene Edit viewport: skip GPU mip chains on decoded nutexb DataTextures (~⅓ less VRAM per 2D texture);
 * editor preview favors stability over distant minification quality.
 */
const SCENE_EDIT_TEXTURE_MIPS = false;
const GENERIC_STAGE_EMISSIVE_INTENSITY = 0.12;
const GENERIC_STAGE_ANIME_EMISSIVE_INTENSITY = 0.18;

const NORMAL_SCALE_DEFAULT = new THREE.Vector2(1, 1);

/**
 * Clip distance far enough for large placements without 1e8 depth precision collapse / driver quirks.
 */
const SCENE_EDIT_CAMERA_FAR = 5e6;

/** Extra DPR / AA clamp from triangle budget — Chromium RSS scales ~ pixelArea × oversampling. */
function clampSceneViewportRasterProfile(
  base: { dpr: [number, number]; antialias: boolean },
  triangleCount: number,
): { dpr: [number, number]; antialias: boolean } {
  let maxDpr = base.dpr[1];
  let antialias = base.antialias;
  if (triangleCount >= 1_000_000) {
    maxDpr = Math.min(maxDpr, 1);
    antialias = false;
  } else if (triangleCount >= 400_000) {
    maxDpr = Math.min(maxDpr, 1.15);
    antialias = false;
  } else if (triangleCount >= 150_000) {
    maxDpr = Math.min(maxDpr, 1.35);
  }
  return { dpr: [1, maxDpr], antialias };
}

export type SceneMapSubModelEntry = {
  folderName: string;
  objectIndex: number;
  bundle: SsbhModelPreviewBundle;
};

export type ImportedDaeObject = {
  id: string;
  name: string;
  sourcePath: string;
  scene: THREE.Group;
  transform: TransformData;
};

export type SceneExportObject = {
  object: THREE.Object3D;
  name: string;
};

function collectSceneDrawsForComplexity(
  baseModel: SsbhModelPreviewBundle | null,
  subModels: SceneMapSubModelEntry[],
): BuiltMeshDraw[] {
  const out: BuiltMeshDraw[] = [];
  const append = (bundle: SsbhModelPreviewBundle) => {
    try {
      const modl = bundle.modl as Parameters<typeof buildDrawListFromBundle>[0];
      const mesh = bundle.mesh as Parameters<typeof buildDrawListFromBundle>[1];
      const skel = bundle.skel as Parameters<typeof buildDrawListFromBundle>[2];
      if (!modl || !mesh) return;
      out.push(...buildDrawListFromBundle(modl, mesh, skel ?? undefined));
    } catch {
      /* skip */
    }
  };
  if (baseModel) append(baseModel);
  for (const sub of subModels) append(sub.bundle);
  return out;
}

export type PlacementGizmoMode = "translate" | "rotate" | "scale";

const MIN_GIZMO_SCALE = 1e-4;

function readTransformFromGroup(group: THREE.Group): TransformData {
  return {
    posX: group.position.x,
    posY: group.position.y,
    posZ: group.position.z,
    rotX: THREE.MathUtils.radToDeg(group.rotation.x),
    rotY: THREE.MathUtils.radToDeg(group.rotation.y),
    rotZ: THREE.MathUtils.radToDeg(group.rotation.z),
    scaleX: Math.max(MIN_GIZMO_SCALE, group.scale.x),
    scaleY: Math.max(MIN_GIZMO_SCALE, group.scale.y),
    scaleZ: Math.max(MIN_GIZMO_SCALE, group.scale.z),
  };
}

/** placement rows often have 0 scale when CSV omitted columns; Three.js would hide the mesh. */
function placementScaleForViewport(sx: number, sy: number, sz: number): [number, number, number] {
  const each = (v: number) => {
    if (!Number.isFinite(v) || v === 0) return 1;
    return Math.max(MIN_GIZMO_SCALE, v);
  };
  return [each(sx), each(sy), each(sz)];
}

function SceneCanvasPerformanceHud({ showStats }: { showStats: boolean }) {
  return (
    <>{showStats ? <Stats className="fixed! top-2! right-2! left-auto! z-2147483000" /> : null}</>
  );
}

/** demand-draw Canvas does not always repaint when light props change — force one frame */
function InvalidateGraphicLightingSync({ canvasSyncKey }: { canvasSyncKey: string }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
  }, [canvasSyncKey, invalidate]);
  return null;
}

function SceneAnimePostFxGate({ previewRenderStyle }: { previewRenderStyle: PreviewRenderStyle }) {
  const current = useThree((s) => s.performance.current);
  if (previewRenderStyle !== "anime") return null;
  if (shouldDisableSsbhAnimePostFx("anime", current)) return null;
  return <AnimePreviewPostFx />;
}

export interface MapViewportProps {
  baseModel: SsbhModelPreviewBundle | null;
  subModels: SceneMapSubModelEntry[];
  importedDaeObjects?: ImportedDaeObject[];
  placementEntries: PlacementRow[];
  showGrid: boolean;
  showAxes: boolean;
  wireframe: boolean;
  showStats: boolean;
  selectedNodeId: string | null;
  selectedNodeIds?: ReadonlySet<string>;
  nodeVisibility?: SceneNodeVisibilityMap;
  objectLocks?: SceneNodeLockMap;
  selectedPlacementIdx: number | null;
  onSelectNode: (id: string | null) => void;
  textureDataMap: NutexbTextureDataMap;
  /** Global PBR slot toggles (decode + render). */
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>;
  objectTextureLoadState?: ObjectTextureLoadState;
  onDrawStatsChange?: (stats: SceneDrawStats) => void;
  /** Parsed graphic_param.csv rows — drives directional / IBL preview lighting when keys exist */
  graphicParams?: GraphicParam[];
  baseTransform?: TransformData;
  onBaseTransformChange?: (t: TransformData) => void;
  standaloneTransforms?: Map<string, TransformData>;
  onStandaloneTransformChange?: (nodeId: string, t: TransformData) => void;
  onImportedDaeTransformChange?: (nodeId: string, t: TransformData) => void;
  clickPickSelectionEnabled?: boolean;
  /** Test Editor-style anime pipeline: bloom + warm lights + cel-tinted PBR when "anime". */
  previewRenderStyle?: PreviewRenderStyle;
  /** Placement manipulator mode for OBJECT rows selected in hierarchy/placement list */
  placementGizmoMode?: PlacementGizmoMode;
  /** Optional preview-only hook for viewport gizmo frames; avoid editor state writes here. */
  onPlacementGizmoFrame?: (placementIdx: number, t: TransformData) => void;
  /** Final editor state sync when releasing gizmo drag. */
  onPlacementGizmoCommit?: (placementIdx: number, t: TransformData) => void;
}

export interface MapViewportHandle {
  resetCamera: () => void;
  getSelectedExportObjects: () => SceneExportObject[];
}

function StageOrbitControls({
  controlsRef,
  orbitActiveRef,
}: {
  controlsRef: RefObject<OrbitControlsType | null>;
  orbitActiveRef?: React.RefObject<boolean>;
}) {
  const regress = useThree((s) => s.performance.regress);
  const invalidate = useThree((s) => s.invalidate);
  const onGestureStart = useCallback(() => {
    if (orbitActiveRef) orbitActiveRef.current = true;
    regress();
    invalidate();
  }, [regress, invalidate, orbitActiveRef]);
  const onGestureEnd = useCallback(() => {
    setTimeout(() => {
      if (orbitActiveRef) orbitActiveRef.current = false;
    }, 80);
  }, [orbitActiveRef]);
  const onDemandFrame = useCallback(() => {
    invalidate();
  }, [invalidate]);
  return (
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
      onStart={onGestureStart}
      onEnd={onGestureEnd}
      onChange={onDemandFrame}
    />
  );
}

export const MapViewport = forwardRef<MapViewportHandle, MapViewportProps>(
  function MapViewport(
    {
      baseModel,
      subModels,
      importedDaeObjects = [],
      placementEntries,
      showGrid,
      showAxes,
      wireframe,
      showStats,
      selectedNodeId,
      selectedNodeIds,
      nodeVisibility = EMPTY_NODE_VISIBILITY,
      objectLocks = EMPTY_NODE_LOCKS,
      selectedPlacementIdx,
      onSelectNode,
      textureDataMap,
      textureSlotLoadEnabled,
      objectTextureLoadState = {},
      onDrawStatsChange,
      graphicParams = [],
      baseTransform,
      onBaseTransformChange,
      standaloneTransforms,
      onStandaloneTransformChange,
      onImportedDaeTransformChange,
      clickPickSelectionEnabled = false,
      previewRenderStyle = "standard",
      placementGizmoMode = "translate",
      onPlacementGizmoFrame,
      onPlacementGizmoCommit,
    },
    ref
  ) {
    const controlsRef = useRef<OrbitControlsType>(null);
    const texturePool = useMemo(() => new SceneTexturePool(), []);
    useEffect(() => () => texturePool.disposeAll(), [texturePool]);
    const gizmoDraggingRef = useRef(false);
    const selectedGroupsRef = useRef<SelectedGroupMap>(new Map());
    const orbitActiveRef = useRef(false);
    const pointerDownTimeRef = useRef(0);

    useImperativeHandle(ref, () => ({
      resetCamera: () => {
        if (controlsRef.current) {
          controlsRef.current.reset();
        }
      },
      getSelectedExportObjects: () =>
        [...selectedGroupsRef.current.entries()].map(([name, object]) => ({
          name,
          object,
        })),
    }));

    const isNodeSelected = useCallback(
      (nodeId: string) => selectedNodeId === nodeId || selectedNodeIds?.has(nodeId) === true,
      [selectedNodeId, selectedNodeIds],
    );
    const isNodeVisible = useCallback(
      (nodeId: string) => canRenderSceneNode(nodeId, nodeVisibility, objectLocks),
      [nodeVisibility, objectLocks],
    );
    const isNodeEditable = useCallback(
      (nodeId: string) => canEditSceneNode(nodeId, nodeVisibility, objectLocks),
      [nodeVisibility, objectLocks],
    );

    const handlePointerMissed = useCallback(() => {
      if (!clickPickSelectionEnabled || gizmoDraggingRef.current) return;
      if (orbitActiveRef.current) return;
      const elapsed = performance.now() - pointerDownTimeRef.current;
      if (elapsed > 250) return;
      onSelectNode(null);
    }, [clickPickSelectionEnabled, onSelectNode]);

    const effectEntries = useMemo(
      () =>
        placementEntries
          .map((e, globalIdx) => ({ entry: e, globalIdx }))
          .filter(({ entry }) => entry.vdkType.toUpperCase() !== "OBJECT"),
      [placementEntries],
    );

    const drawsForComplexity = useMemo(
      () => collectSceneDrawsForComplexity(baseModel, subModels),
      [baseModel, subModels],
    );
    const sceneComplexity = useMemo(() => measureDrawComplexity(drawsForComplexity), [drawsForComplexity]);
    const motionPlaying = false;
    const motionScrubbing = false;
    const canvasPerformanceProfile = useMemo(
      () =>
        getSsbhCanvasPerformanceProfile({
          drawCount: sceneComplexity.drawCount,
          triangleCount: sceneComplexity.triangleCount,
          motionPlaying,
          motionScrubbing,
          previewRenderStyle,
        }),
      [sceneComplexity.drawCount, sceneComplexity.triangleCount, previewRenderStyle],
    );
    const adaptivePerformanceOptions = useMemo(
      () =>
        getSsbhAdaptivePerformanceOptions({
          drawCount: sceneComplexity.drawCount,
          triangleCount: sceneComplexity.triangleCount,
          motionPlaying,
          motionScrubbing,
          previewRenderStyle,
        }),
      [sceneComplexity.drawCount, sceneComplexity.triangleCount, previewRenderStyle],
    );
    const sceneRasterProfile = useMemo(
      () => clampSceneViewportRasterProfile(canvasPerformanceProfile, sceneComplexity.triangleCount),
      [canvasPerformanceProfile, sceneComplexity.triangleCount],
    );
    const sceneLighting = useMemo(
      () => deriveSceneLightingFromGraphicParams(graphicParams),
      [graphicParams],
    );

    const viewportLights = useMemo(() => {
      if (previewRenderStyle !== "anime") {
        return {
          ambientIntensity: sceneLighting.ambientIntensity,
          hemisphereArgs: [
            sceneLighting.hemisphereSky,
            sceneLighting.hemisphereGround,
            sceneLighting.hemisphereIntensity,
          ] as [string, string, number],
          primaryColor: sceneLighting.directionalColor,
          primaryIntensity: sceneLighting.directionalIntensity,
          primaryPosition: sceneLighting.primaryPosition,
          fillColor: sceneLighting.directionalColor,
          fillIntensity: sceneLighting.fillIntensity,
          fillPosition: sceneLighting.fillPosition,
        };
      }
      return {
        ambientIntensity: sceneLighting.ambientIntensity,
        hemisphereArgs: ["#b8c8e8", "#101820", 0.32] as [string, string, number],
        primaryColor: "#fff4ea",
        primaryIntensity: sceneLighting.directionalIntensity * 1.1,
        primaryPosition: sceneLighting.primaryPosition,
        fillColor: "#9eb6d4",
        fillIntensity: sceneLighting.directionalIntensity * 0.22,
        fillPosition: sceneLighting.fillPosition,
      };
    }, [previewRenderStyle, sceneLighting]);

    const animeKeyLightDir = useMemo(() => {
      const [x, y, z] = sceneLighting.primaryPosition;
      const v = new THREE.Vector3(x, y, z);
      if (v.lengthSq() < 1e-12) {
        v.set(0.35, 0.85, 0.45);
      } else {
        v.normalize();
      }
      return v;
    }, [sceneLighting.primaryPosition]);

    const graphicLightingInvalidateKey = useMemo(() => {
      const relevant = graphicParams.filter((p) => {
        const k = p.key.trim().toLowerCase();
        return (
          k.startsWith("directional_lighting_") ||
          k === "ibl_lighting_intensity"
        );
      });
      return relevant.map((p) => `${p.key}=${p.value}`).join("|");
    }, [graphicParams]);

    const canvasSyncKey = `${graphicLightingInvalidateKey}|style:${previewRenderStyle}`;

    const handleCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
      const canvas = gl.domElement;
      canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        console.warn("[SceneEdit] WebGL context lost — waiting for restore");
      });
      canvas.addEventListener("webglcontextrestored", () => {
        console.warn("[SceneEdit] WebGL context restored");
        gl.clear();
      });
    }, []);

    useEffect(() => {
      if (!onDrawStatsChange) return;
      let totalDraws = 0;
      let totalTris = 0;
      let totalVerts = 0;

      const collectFromBundle = (bundle: SsbhModelPreviewBundle) => {
        try {
          const modl = bundle.modl as any;
          const mesh = bundle.mesh as any;
          const skel = bundle.skel as any;
          if (!modl || !mesh) return;
          const draws = buildDrawListFromBundle(modl, mesh, skel ?? undefined);
          totalDraws += draws.length;
          for (const d of draws) {
            const geo = d.geometry;
            const idx = geo.getIndex();
            if (idx) {
              totalTris += Math.floor(idx.count / 3);
            } else {
              const pos = geo.getAttribute("position");
              if (pos) totalTris += Math.floor(pos.count / 3);
            }
            const pos = geo.getAttribute("position");
            if (pos) totalVerts += pos.count;
          }
        } catch { /* skip */ }
      };

      if (baseModel) collectFromBundle(baseModel);
      for (const sub of subModels) collectFromBundle(sub.bundle);

      onDrawStatsChange({
        drawCount: totalDraws,
        triangleCount: totalTris,
        vertexCount: totalVerts,
        subModelCount: subModels.length,
      });
    }, [baseModel, subModels, onDrawStatsChange]);

    return (
      <Canvas
        className="h-full w-full touch-none"
        frameloop="demand"
        camera={{
          position: [300, 300, 300],
          fov: 30,
          near: 0.1,
          far: SCENE_EDIT_CAMERA_FAR,
        }}
        gl={{
          antialias: sceneRasterProfile.antialias,
          alpha: false,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
          logarithmicDepthBuffer: true,
        }}
        performance={adaptivePerformanceOptions}
        dpr={sceneRasterProfile.dpr}
        style={{ touchAction: "none", background: DEFAULT_PREVIEW_3D_BACKGROUND }}
        onPointerMissed={handlePointerMissed}
        onPointerDown={() => { pointerDownTimeRef.current = performance.now(); orbitActiveRef.current = false; }}
        onCreated={handleCreated}
      >
        <SceneCanvasPerformanceHud showStats={showStats} />
        <InvalidateGraphicLightingSync canvasSyncKey={canvasSyncKey} />
        <SceneAnimePostFxGate previewRenderStyle={previewRenderStyle} />

        <color attach="background" args={[DEFAULT_PREVIEW_3D_BACKGROUND]} />
        <ambientLight intensity={viewportLights.ambientIntensity} />
        <hemisphereLight args={viewportLights.hemisphereArgs} />
        <directionalLight
          color={viewportLights.primaryColor}
          position={viewportLights.primaryPosition}
          intensity={viewportLights.primaryIntensity}
        />
        <directionalLight
          color={viewportLights.fillColor}
          position={viewportLights.fillPosition}
          intensity={viewportLights.fillIntensity}
        />

        <Environment resolution={64} frames={1} background={false}>
          <Lightformer
            form="rect"
            intensity={0.8 * sceneLighting.environmentScale}
            position={[0, 5, -2]}
            scale={[10, 5, 1]}
          />
          <Lightformer
            form="ring"
            intensity={0.5 * sceneLighting.environmentScale}
            position={[-5, 3, 2]}
            scale={3}
            color="#dbeafe"
          />
          <Lightformer
            form="rect"
            intensity={0.3 * sceneLighting.environmentScale}
            position={[5, -1, -3]}
            scale={[8, 3, 1]}
            color="#aab0ba"
          />
          <color attach="background" args={["#1a1a2e"]} />
        </Environment>

        {baseModel && isNodeVisible("base") && (
          <StageModelGroup
            nodeId="base"
            bundle={baseModel}
            wireframe={wireframe}
            isSelected={isNodeSelected("base")}
            isLocked={!isNodeEditable("base")}
            onClick={onSelectNode}
            clickPickSelectionEnabled={clickPickSelectionEnabled}
            textureDataMap={textureDataMap}
            textureSlotLoadEnabled={textureSlotLoadEnabled}
            objectTextureLoadState={objectTextureLoadState}
            texturePool={texturePool}
            previewRenderStyle={previewRenderStyle}
            animeKeyLightDir={animeKeyLightDir}
            position={baseTransform ? [baseTransform.posX, baseTransform.posY, baseTransform.posZ] : undefined}
            rotation={baseTransform ? [baseTransform.rotX, baseTransform.rotY, baseTransform.rotZ] : undefined}
            scale={baseTransform ? [baseTransform.scaleX, baseTransform.scaleY, baseTransform.scaleZ] : undefined}
            showPlacementTransformGizmo={selectedNodeId === "base" && isNodeEditable("base")}
            placementGizmoMode={placementGizmoMode}
            onPlacementGizmoCommit={
              onBaseTransformChange
                ? (_idx: number, t: TransformData) => onBaseTransformChange(t)
                : undefined
            }
            gizmoDraggingRef={gizmoDraggingRef}
            orbitActiveRef={orbitActiveRef}
            pointerDownTimeRef={pointerDownTimeRef}
            selectedGroupsRef={selectedGroupsRef}
          />
        )}

        {subModels.flatMap((sub) => {
          const objectRows = placementEntries
            .map((entry, globalIdx) => ({ entry, globalIdx }))
            .filter(
              ({ entry }) =>
                entry.vdkType.toUpperCase() === "OBJECT" &&
                entry.objectNumber === sub.objectIndex,
            );

          if (objectRows.length === 0) {
            const st = standaloneTransforms?.get(sub.folderName);
            const isStandaloneSel = selectedNodeId === sub.folderName && selectedPlacementIdx === null;
            if (!isNodeVisible(sub.folderName)) return [];
            return [
              <StageModelGroup
                key={sub.folderName}
                nodeId={sub.folderName}
                bundle={sub.bundle}
                wireframe={wireframe}
                isSelected={isStandaloneSel || selectedNodeIds?.has(sub.folderName) === true}
                isLocked={!isNodeEditable(sub.folderName)}
                onClick={onSelectNode}
                clickPickSelectionEnabled={clickPickSelectionEnabled}
                textureDataMap={textureDataMap}
                textureSlotLoadEnabled={textureSlotLoadEnabled}
                objectTextureLoadState={objectTextureLoadState}
                texturePool={texturePool}
                previewRenderStyle={previewRenderStyle}
                animeKeyLightDir={animeKeyLightDir}
                gizmoDraggingRef={gizmoDraggingRef}
                orbitActiveRef={orbitActiveRef}
                pointerDownTimeRef={pointerDownTimeRef}
                position={st ? [st.posX, st.posY, st.posZ] : undefined}
                rotation={st ? [st.rotX, st.rotY, st.rotZ] : undefined}
                scale={st ? placementScaleForViewport(st.scaleX, st.scaleY, st.scaleZ) : undefined}
                showPlacementTransformGizmo={isStandaloneSel && isNodeEditable(sub.folderName)}
                placementGizmoMode={placementGizmoMode}
                onPlacementGizmoCommit={
                  onStandaloneTransformChange
                    ? (_idx: number, t: TransformData) => onStandaloneTransformChange(sub.folderName, t)
                    : undefined
                }
                selectedGroupsRef={selectedGroupsRef}
              />,
            ];
          }

          if (objectRows.length === 1) {
            const { entry, globalIdx } = objectRows[0];
            const nodeId = formatPlacementViewportNodeId(sub.folderName, globalIdx);
            if (!isNodeVisible(nodeId)) return [];
            return [(
              <StageModelGroup
                key={`${sub.folderName}-pl-${globalIdx}`}
                nodeId={nodeId}
                bundle={sub.bundle}
                wireframe={wireframe}
                isSelected={
                  selectedPlacementIdx === globalIdx ||
                  selectedNodeIds?.has(nodeId) === true
                }
                isLocked={!isNodeEditable(nodeId)}
                onClick={onSelectNode}
                clickPickSelectionEnabled={clickPickSelectionEnabled}
                textureDataMap={textureDataMap}
                textureSlotLoadEnabled={textureSlotLoadEnabled}
                objectTextureLoadState={objectTextureLoadState}
                texturePool={texturePool}
                previewRenderStyle={previewRenderStyle}
                animeKeyLightDir={animeKeyLightDir}
                position={[entry.posX, entry.posY, entry.posZ]}
                rotation={[entry.rotX, entry.rotY, entry.rotZ]}
                scale={placementScaleForViewport(entry.scaleX, entry.scaleY, entry.scaleZ)}
                placementGlobalIdx={globalIdx}
                showPlacementTransformGizmo={
                  selectedPlacementIdx !== null &&
                  selectedPlacementIdx === globalIdx &&
                  isNodeEditable(nodeId)
                }
                placementGizmoMode={placementGizmoMode}
                onPlacementGizmoFrame={onPlacementGizmoFrame}
                onPlacementGizmoCommit={onPlacementGizmoCommit}
                gizmoDraggingRef={gizmoDraggingRef}
                orbitActiveRef={orbitActiveRef}
                pointerDownTimeRef={pointerDownTimeRef}
                selectedGroupsRef={selectedGroupsRef}
              />
            )];
          }

          const instances: PlacementInstance[] = objectRows.map(({ entry, globalIdx }) => ({
            entry,
            globalIdx,
            nodeId: formatPlacementViewportNodeId(sub.folderName, globalIdx),
          }));

          return [(
            <InstancedStageModel
              key={`inst-${sub.folderName}`}
              bundle={sub.bundle}
              instances={instances}
              wireframe={wireframe}
              selectedPlacementIdx={selectedPlacementIdx}
              selectedNodeIds={selectedNodeIds}
              nodeVisibility={nodeVisibility}
              objectLocks={objectLocks}
              onSelectNode={onSelectNode}
              clickPickSelectionEnabled={clickPickSelectionEnabled}
              textureDataMap={textureDataMap}
              textureSlotLoadEnabled={textureSlotLoadEnabled}
              objectTextureLoadState={objectTextureLoadState}
              texturePool={texturePool}
              previewRenderStyle={previewRenderStyle}
              animeKeyLightDir={animeKeyLightDir}
              placementGizmoMode={placementGizmoMode}
              onPlacementGizmoFrame={onPlacementGizmoFrame}
              onPlacementGizmoCommit={onPlacementGizmoCommit}
              gizmoDraggingRef={gizmoDraggingRef}
              orbitActiveRef={orbitActiveRef}
              pointerDownTimeRef={pointerDownTimeRef}
              selectedGroupsRef={selectedGroupsRef}
            />
          )];
        })}

        {effectEntries.flatMap(({ entry: eff, globalIdx }) => {
          const nodeId = `__effect__${globalIdx}`;
          if (!isNodeVisible(nodeId)) return [];
          return [(
          <EffectMarker
            key={`effect-${globalIdx}`}
            entry={eff}
            globalIdx={globalIdx}
            isSelected={
              selectedPlacementIdx === globalIdx ||
              selectedNodeIds?.has(nodeId) === true
            }
            isLocked={!isNodeEditable(nodeId)}
            onClick={onSelectNode}
            clickPickSelectionEnabled={clickPickSelectionEnabled}
            showGizmo={
              selectedPlacementIdx !== null &&
              selectedPlacementIdx === globalIdx &&
              isNodeEditable(nodeId)
            }
            placementGizmoMode={placementGizmoMode}
            onPlacementGizmoFrame={onPlacementGizmoFrame}
            onPlacementGizmoCommit={onPlacementGizmoCommit}
            gizmoDraggingRef={gizmoDraggingRef}
            orbitActiveRef={orbitActiveRef}
            pointerDownTimeRef={pointerDownTimeRef}
          />
          )];
        })}

        {importedDaeObjects.flatMap((obj) => {
          if (!isNodeVisible(obj.id)) return [];
          return [(
          <ImportedDaeGroup
            key={obj.id}
            object={obj}
            isSelected={isNodeSelected(obj.id)}
            isLocked={!isNodeEditable(obj.id)}
            onClick={onSelectNode}
            clickPickSelectionEnabled={clickPickSelectionEnabled}
            showGizmo={selectedNodeId === obj.id && isNodeEditable(obj.id)}
            placementGizmoMode={placementGizmoMode}
            onTransformCommit={onImportedDaeTransformChange}
            gizmoDraggingRef={gizmoDraggingRef}
            orbitActiveRef={orbitActiveRef}
            pointerDownTimeRef={pointerDownTimeRef}
            selectedGroupsRef={selectedGroupsRef}
          />
          )];
        })}

        {showGrid && (
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
        )}

        {showAxes && (
          <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
            <GizmoViewport axisColors={["#f87171", "#4ade80", "#60a5fa"]} labelColor="white" />
          </GizmoHelper>
        )}

        <StageOrbitControls controlsRef={controlsRef} orbitActiveRef={orbitActiveRef} />
        <SceneSelectionOutline selectedGroupsRef={selectedGroupsRef} />
      </Canvas>
    );
  }
);

const ImportedDaeGroup = memo(function ImportedDaeGroup({
  object,
  isSelected,
  isLocked,
  onClick,
  clickPickSelectionEnabled,
  showGizmo,
  placementGizmoMode = "translate",
  onTransformFrame,
  onTransformCommit,
  gizmoDraggingRef,
  orbitActiveRef,
  pointerDownTimeRef,
  selectedGroupsRef,
}: {
  object: ImportedDaeObject;
  isSelected: boolean;
  isLocked?: boolean;
  onClick: (id: string | null) => void;
  clickPickSelectionEnabled: boolean;
  showGizmo: boolean;
  placementGizmoMode?: PlacementGizmoMode;
  onTransformFrame?: (nodeId: string, t: TransformData) => void;
  onTransformCommit?: (nodeId: string, t: TransformData) => void;
  gizmoDraggingRef?: React.RefObject<boolean>;
  orbitActiveRef?: React.RefObject<boolean>;
  pointerDownTimeRef?: React.RefObject<number>;
  selectedGroupsRef?: React.RefObject<SelectedGroupMap>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const regress = useThree((s) => s.performance.regress);
  const sceneClone = useMemo(() => object.scene.clone(true), [object.scene]);

  useEffect(() => {
    const g = groupRef.current;
    if (!g || !selectedGroupsRef) return;
    if (isSelected) {
      selectedGroupsRef.current.set(object.id, g);
    } else {
      selectedGroupsRef.current.delete(object.id);
    }
    return () => {
      selectedGroupsRef.current.delete(object.id);
    };
  }, [isSelected, object.id, selectedGroupsRef]);

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (isLocked) return;
      if (!clickPickSelectionEnabled) return;
      if (gizmoDraggingRef?.current) return;
      if (orbitActiveRef?.current) return;
      const elapsed = performance.now() - (pointerDownTimeRef?.current ?? 0);
      if (elapsed > 250) return;
      onClick(object.id);
    },
    [clickPickSelectionEnabled, gizmoDraggingRef, isLocked, object.id, onClick, orbitActiveRef, pointerDownTimeRef],
  );

  const euler = useMemo(
    () =>
      new THREE.Euler(
        object.transform.rotX * DEG2RAD,
        object.transform.rotY * DEG2RAD,
        object.transform.rotZ * DEG2RAD,
      ),
    [object.transform.rotX, object.transform.rotY, object.transform.rotZ],
  );

  const handleObjectChange = useCallback(() => {
    if (shouldInvalidateViewportForGizmoEvent("drag")) {
      regress();
      invalidate();
    }
    if (!shouldSyncSceneStateForGizmoEvent("drag")) return;
    const group = groupRef.current;
    if (!group || !onTransformFrame) return;
    onTransformFrame(object.id, readTransformFromGroup(group));
  }, [invalidate, object.id, onTransformFrame, regress]);

  const handleMouseUp = useCallback(() => {
    if (shouldInvalidateViewportForGizmoEvent("commit")) {
      invalidate();
    }
    if (!shouldSyncSceneStateForGizmoEvent("commit")) return;
    const group = groupRef.current;
    if (!group || !onTransformCommit) return;
    onTransformCommit(object.id, readTransformFromGroup(group));
  }, [invalidate, object.id, onTransformCommit]);

  return (
    <Fragment>
      <group
        ref={groupRef}
        name={object.id}
        onClick={handleClick}
        position={[
          object.transform.posX,
          object.transform.posY,
          object.transform.posZ,
        ]}
        rotation={euler}
        scale={placementScaleForViewport(
          object.transform.scaleX,
          object.transform.scaleY,
          object.transform.scaleZ,
        )}
      >
        <primitive object={sceneClone} />
      </group>
      {showGizmo ? (
        <SceneTransformControls
          key={`dae-gizmo-${object.id}-${placementGizmoMode}`}
          object={groupRef as unknown as RefObject<THREE.Object3D>}
          mode={placementGizmoMode}
          space="world"
          size={1.12}
          onObjectChange={handleObjectChange}
          onMouseDown={() => {
            if (gizmoDraggingRef) gizmoDraggingRef.current = true;
          }}
          onMouseUp={() => {
            if (gizmoDraggingRef) setTimeout(() => { gizmoDraggingRef.current = false; }, 50);
            handleMouseUp();
          }}
        />
      ) : null}
    </Fragment>
  );
});

const SRGB_SLOTS = new Set<PbrSlotKind>(["map", "emissiveMap"]);

type PbrSlotKind = "map" | "normalMap" | "roughnessMap" | "metalnessMap" | "emissiveMap" | "aoMap" | "cubeMap";

function toThreeWrapping(mode: ResolvedTextureSampling["wrapS"]): THREE.Wrapping {
  switch (mode) {
    case "Repeat":
      return THREE.RepeatWrapping;
    case "MirroredRepeat":
      return THREE.MirroredRepeatWrapping;
    case "ClampToBorder":
    case "ClampToEdge":
    default:
      return THREE.ClampToEdgeWrapping;
  }
}

function samplingForSlot(
  binding: ResolvedMaterialBinding,
  kind: PbrSlotKind,
): ResolvedTextureSampling | null {
  if (kind === "cubeMap") return null;
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

function pathForSlot(binding: ResolvedMaterialBinding, slot: PbrSlotKind): string | null {
  const p = binding.texturePaths;
  switch (slot) {
    case "map": return p.mapPath;
    case "normalMap": return p.normalPath;
    case "roughnessMap": return p.roughnessPath;
    case "metalnessMap": return p.metalnessPath;
    case "emissiveMap": return p.emissivePath;
    case "aoMap": return p.aoPath;
    case "cubeMap": return p.cubePath;
  }
}

function buildTexturePoolKey(
  path: string,
  slot: PbrSlotKind,
  binding: ResolvedMaterialBinding,
  dataWidth: number,
  dataHeight: number,
): string {
  const sampling = samplingForSlot(binding, slot);
  return [
    path.toLowerCase(),
    slot,
    `${dataWidth}x${dataHeight}`,
    sampling?.wrapS ?? "ClampToEdge",
    sampling?.wrapT ?? "ClampToEdge",
    sampling?.uvTransform?.scale_u ?? 1,
    sampling?.uvTransform?.scale_v ?? 1,
    sampling?.uvTransform?.translate_u ?? 0,
    sampling?.uvTransform?.translate_v ?? 0,
    sampling?.uvTransform?.rotation ?? 0,
  ].join("|");
}

function lookupTextureData(
  textureDataMap: NutexbTextureDataMap,
  path: string | null,
): NutexbRgbaData | null {
  if (!path) return null;
  return textureDataMap.get(path) ?? textureDataMap.get(path.toLowerCase()) ?? null;
}

function createDataTexture(
  data: NutexbRgbaData,
  slot: PbrSlotKind,
  binding: ResolvedMaterialBinding,
): THREE.DataTexture {
  const tex = new THREE.DataTexture(
    data.rgba,
    data.width,
    data.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  tex.colorSpace = SRGB_SLOTS.has(slot)
    ? THREE.SRGBColorSpace
    : THREE.LinearSRGBColorSpace;
  tex.flipY = false;
  tex.generateMipmaps = SCENE_EDIT_TEXTURE_MIPS;
  tex.minFilter = SCENE_EDIT_TEXTURE_MIPS
    ? THREE.LinearMipmapLinearFilter
    : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  if (slot === "cubeMap") {
    tex.mapping = THREE.EquirectangularReflectionMapping;
  } else {
    const sampling = samplingForSlot(binding, slot);
    tex.wrapS = toThreeWrapping(sampling?.wrapS ?? "ClampToEdge");
    tex.wrapT = toThreeWrapping(sampling?.wrapT ?? "ClampToEdge");
    tex.center.set(0, 0);
    tex.repeat.set(
      sampling?.uvTransform?.scale_u ?? 1,
      sampling?.uvTransform?.scale_v ?? 1,
    );
    tex.offset.set(
      sampling?.uvTransform?.translate_u ?? 0,
      sampling?.uvTransform?.translate_v ?? 0,
    );
    tex.rotation = sampling?.uvTransform?.rotation ?? 0;
  }

  tex.needsUpdate = true;
  return tex;
}

interface DrawBinding {
  draw: BuiltMeshDraw;
  binding: ResolvedMaterialBinding;
}

const SLOT_KEYS: PbrSlotKind[] = [
  "map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "cubeMap",
];

const TexturedMesh = memo(function TexturedMesh({
  drawBinding,
  textureDataMap,
  textureSlotLoadEnabled,
  objectTextureLoadState,
  wireframe,
  isSelected,
  objectId,
  texturePool,
  previewRenderStyle,
  animeKeyLightDir,
}: {
  drawBinding: DrawBinding;
  textureDataMap: NutexbTextureDataMap;
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>;
  objectTextureLoadState: ObjectTextureLoadState;
  wireframe: boolean;
  isSelected: boolean;
  objectId: string;
  texturePool: SceneTexturePool;
  previewRenderStyle: PreviewRenderStyle;
  animeKeyLightDir: THREE.Vector3;
}) {
  const { draw, binding } = drawBinding;

  const slotDataEntries = useMemo(() => {
    return SLOT_KEYS.map((slot) => {
      if (!textureSlotLoadEnabled[slot]) {
        return [slot, null] as const;
      }
      const path = pathForSlot(binding, slot);
      if (path && !isTexturePathEnabledForObject(objectTextureLoadState, objectId, path)) {
        return [slot, null] as const;
      }
      const data = lookupTextureData(textureDataMap, path);
      return [slot, data] as const;
    });
  }, [textureDataMap, binding, textureSlotLoadEnabled, objectTextureLoadState, objectId]);

  const dataKey = slotDataEntries
    .map(([, d]) => (d ? `${d.width}x${d.height}` : ""))
    .join("\0");

  const textures = useMemo(() => {
    const result: Partial<Record<PbrSlotKind, THREE.DataTexture>> = {};

    for (const [slot, data] of slotDataEntries) {
      if (!data) continue;
      const path = pathForSlot(binding, slot);
      if (!path) continue;
      const poolKey = buildTexturePoolKey(path, slot, binding, data.width, data.height);
      result[slot] = texturePool.acquire(poolKey, () => createDataTexture(data, slot, binding));
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, texturePool]);

  const exvsActive = previewRenderStyle === "anime";
  const exvsUniforms = useMemo(() => createAnimeExvsUniforms(), [draw.key]);
  const onBeforeCompileExvs = useMemo(() => animeExvsOnBeforeCompile(exvsUniforms), [exvsUniforms]);
  const selectionUniforms = useMemo(() => createPreviewSelectionUniforms(), [draw.key]);
  const onBeforeCompileSelection = useMemo(
    () => previewSelectionOnBeforeCompile(selectionUniforms),
    [selectionUniforms],
  );
  const onBeforeCompileMaterial = useMemo(
    () => (shader: { fragmentShader: string; uniforms: Record<string, { value: unknown }> }) => {
      if (exvsActive) {
        onBeforeCompileExvs(shader);
      }
      onBeforeCompileSelection(shader);
    },
    [exvsActive, onBeforeCompileExvs, onBeforeCompileSelection],
  );
  useEffect(() => {
    if (!exvsActive) return;
    exvsUniforms.uAnimeKeyDir.value.copy(animeKeyLightDir);
  }, [exvsActive, exvsUniforms, animeKeyLightDir]);
  useFrame((state) => {
    selectionUniforms.uSelectionEnabled.value = isSelected ? 1 : 0;
    selectionUniforms.uSelectionTime.value = state.clock.elapsedTime;
  });

  const shaderFamily = binding.shaderFamily;
  const hasMap = !!textures.map;
  const hasRough = !!textures.roughnessMap || typeof binding.uniforms.roughnessScalar === "number";
  const hasMetal = !!textures.metalnessMap || typeof binding.uniforms.metalnessScalar === "number";
  const hasEmit = !!textures.emissiveMap;
  const canUseEmissiveMap = hasEmit && shaderFamily !== "generic";
  const hasAo = !!textures.aoMap;
  const hasCube = !!textures.cubeMap;
  const hasAnyTexture = hasMap || hasRough || hasMetal || hasEmit || hasAo || hasCube || !!textures.normalMap;

  const roughnessValue =
    typeof binding.uniforms.roughnessScalar === "number"
      ? binding.uniforms.roughnessScalar
      : hasRough
        ? 1
        : shaderFamily === "vsngCharaSparkle"
          ? 0.45
          : 0.65;

  const metalnessValue =
    typeof binding.uniforms.metalnessScalar === "number"
      ? binding.uniforms.metalnessScalar
      : hasMetal
        ? 1
        : shaderFamily === "vsngCharaSparkle"
          ? 0.35
          : 0.12;

  const roughnessForStyle = exvsActive ? Math.min(1, roughnessValue * 0.84) : roughnessValue;

  const emissiveIntensity = exvsActive
    ? shaderFamily === "vsngCharaSparkle"
      ? 2.15
      : canUseEmissiveMap
        ? GENERIC_STAGE_ANIME_EMISSIVE_INTENSITY
        : 0
    : shaderFamily === "vsngCharaSparkle"
      ? 1.8
      : canUseEmissiveMap
        ? GENERIC_STAGE_EMISSIVE_INTENSITY
        : 0;

  const transparent = binding.renderHints.isTransparent === true;
  const materialSide = transparent ? THREE.DoubleSide : THREE.FrontSide;
  const envIntensity = exvsActive
    ? shaderFamily === "vsngCharaSparkle"
      ? 1.38
      : hasCube
        ? 1.05
        : 0
    : shaderFamily === "vsngCharaSparkle"
      ? 1.55
      : hasCube
        ? 1.15
        : 0.6;

  const exvsUsesMetalnessMap = hasCube && textureSlotLoadEnabled.metalnessMap;
  const effectiveMetalnessMap = exvsActive
    ? exvsUsesMetalnessMap
      ? textures.metalnessMap ?? null
      : null
    : textureSlotLoadEnabled.metalnessMap
      ? textures.metalnessMap ?? null
      : null;
  const effectiveMetalnessValue = exvsActive
    ? exvsUsesMetalnessMap
      ? metalnessValue
      : Math.min(metalnessValue, 0.2)
    : metalnessValue;

  const baseColor = hasAnyTexture ? "#ffffff" : "#cccccc";

  return (
    <mesh geometry={draw.geometry}>
      <meshStandardMaterial
        key={exvsActive ? "exvs" : "std"}
        color={baseColor}
        wireframe={wireframe}
        side={materialSide}
        map={textures.map ?? null}
        normalMap={textures.normalMap ?? null}
        normalScale={textures.normalMap ? NORMAL_SCALE_DEFAULT : undefined}
        roughnessMap={textures.roughnessMap ?? null}
        metalnessMap={effectiveMetalnessMap}
        emissiveMap={canUseEmissiveMap ? textures.emissiveMap ?? null : null}
        emissive={canUseEmissiveMap ? new THREE.Color(0xffffff) : new THREE.Color(0)}
        emissiveIntensity={emissiveIntensity}
        aoMap={textures.aoMap ?? null}
        aoMapIntensity={hasAo ? 0.35 : 0}
        envMap={textures.cubeMap ?? null}
        envMapIntensity={envIntensity}
        alphaTest={hasMap ? 0.001 : 0}
        transparent={transparent}
        roughness={roughnessForStyle}
        metalness={effectiveMetalnessValue}
        onBeforeCompile={onBeforeCompileMaterial}
      />
    </mesh>
  );
});

interface PlacementInstance {
  entry: PlacementRow;
  globalIdx: number;
  nodeId: string;
}

const InstancedStageModel = memo(function InstancedStageModel({
  bundle,
  instances,
  wireframe,
  selectedPlacementIdx,
  selectedNodeIds,
  nodeVisibility,
  objectLocks,
  onSelectNode,
  clickPickSelectionEnabled,
  textureDataMap,
  textureSlotLoadEnabled,
  objectTextureLoadState,
  texturePool,
  previewRenderStyle,
  animeKeyLightDir,
  placementGizmoMode,
  onPlacementGizmoFrame,
  onPlacementGizmoCommit,
  gizmoDraggingRef,
  orbitActiveRef,
  pointerDownTimeRef,
  selectedGroupsRef,
}: {
  bundle: SsbhModelPreviewBundle;
  instances: PlacementInstance[];
  wireframe: boolean;
  selectedPlacementIdx: number | null;
  selectedNodeIds?: ReadonlySet<string>;
  nodeVisibility: SceneNodeVisibilityMap;
  objectLocks: SceneNodeLockMap;
  onSelectNode: (id: string | null) => void;
  clickPickSelectionEnabled: boolean;
  textureDataMap: NutexbTextureDataMap;
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>;
  objectTextureLoadState: ObjectTextureLoadState;
  texturePool: SceneTexturePool;
  previewRenderStyle: PreviewRenderStyle;
  animeKeyLightDir: THREE.Vector3;
  placementGizmoMode: PlacementGizmoMode;
  onPlacementGizmoFrame?: (placementIdx: number, t: TransformData) => void;
  onPlacementGizmoCommit?: (placementIdx: number, t: TransformData) => void;
  gizmoDraggingRef: React.RefObject<boolean>;
  orbitActiveRef: React.RefObject<boolean>;
  pointerDownTimeRef: React.RefObject<number>;
  selectedGroupsRef: React.RefObject<SelectedGroupMap>;
}) {
  const draws = useMemo((): BuiltMeshDraw[] => {
    try {
      const modl = bundle.modl as any;
      const mesh = bundle.mesh as any;
      const skel = bundle.skel as any;
      if (!modl || !mesh) return [];
      return buildDrawListFromBundle(modl, mesh, skel ?? undefined);
    } catch {
      return [];
    }
  }, [bundle]);

  const matlLookup = useMemo(() => buildMatlLookup(bundle.matl as any), [bundle.matl]);
  const refToPathMap = useMemo(() => buildTextureRefToPathMap(bundle), [bundle]);

  const drawBindings = useMemo((): DrawBinding[] => {
    const rawBindings = draws.map((draw) => {
      const binding = resolveMaterialBinding(draw.materialLabel, matlLookup, refToPathMap);
      return { draw, binding };
    });
    const grouped = new Map<string, DrawBinding[]>();
    for (const db of rawBindings) {
      const key = db.draw.materialLabel;
      const list = grouped.get(key);
      if (list) list.push(db);
      else grouped.set(key, [db]);
    }
    const merged: DrawBinding[] = [];
    for (const group of grouped.values()) {
      if (group.length === 1) {
        merged.push(group[0]);
        continue;
      }
      const geometries = group.map((db) => db.draw.geometry);
      const mergedGeo = mergeBufferGeometries(geometries, false);
      if (mergedGeo) {
        merged.push({
          draw: { ...group[0].draw, geometry: mergedGeo, key: `merged_${group[0].draw.materialLabel}` },
          binding: group[0].binding,
        });
      } else {
        merged.push(...group);
      }
    }
    return merged;
  }, [draws, matlLookup, refToPathMap]);

  const visibleInstances = useMemo(
    () => instances.filter((inst) => canRenderSceneNode(inst.nodeId, nodeVisibility, objectLocks)),
    [instances, nodeVisibility, objectLocks],
  );

  const selectedInstance = useMemo(
    () => visibleInstances.find(
      (inst) => inst.globalIdx === selectedPlacementIdx || selectedNodeIds?.has(inst.nodeId),
    ) ?? null,
    [visibleInstances, selectedPlacementIdx, selectedNodeIds],
  );

  const nonSelectedInstances = useMemo(
    () => visibleInstances.filter((inst) => inst !== selectedInstance),
    [visibleInstances, selectedInstance],
  );

  const hasNonSelectedTextureOverrides = useMemo(
    () => nonSelectedInstances.some((inst) => hasTextureOverridesForObject(objectTextureLoadState, inst.nodeId)),
    [nonSelectedInstances, objectTextureLoadState],
  );

  if (hasNonSelectedTextureOverrides) {
    return (
      <Fragment>
        {visibleInstances.map((inst) => (
          <StageModelGroup
            key={inst.nodeId}
            nodeId={inst.nodeId}
            bundle={bundle}
            wireframe={wireframe}
            isSelected={inst.globalIdx === selectedPlacementIdx || selectedNodeIds?.has(inst.nodeId) === true}
            isLocked={!canEditSceneNode(inst.nodeId, nodeVisibility, objectLocks)}
            onClick={onSelectNode}
            clickPickSelectionEnabled={clickPickSelectionEnabled}
            textureDataMap={textureDataMap}
            textureSlotLoadEnabled={textureSlotLoadEnabled}
            objectTextureLoadState={objectTextureLoadState}
            texturePool={texturePool}
            previewRenderStyle={previewRenderStyle}
            animeKeyLightDir={animeKeyLightDir}
            position={[inst.entry.posX, inst.entry.posY, inst.entry.posZ]}
            rotation={[inst.entry.rotX, inst.entry.rotY, inst.entry.rotZ]}
            scale={placementScaleForViewport(inst.entry.scaleX, inst.entry.scaleY, inst.entry.scaleZ)}
            placementGlobalIdx={inst.globalIdx}
            showPlacementTransformGizmo={
              inst.globalIdx === selectedPlacementIdx &&
              canEditSceneNode(inst.nodeId, nodeVisibility, objectLocks)
            }
            placementGizmoMode={placementGizmoMode}
            onPlacementGizmoFrame={onPlacementGizmoFrame}
            onPlacementGizmoCommit={onPlacementGizmoCommit}
            gizmoDraggingRef={gizmoDraggingRef}
            orbitActiveRef={orbitActiveRef}
            pointerDownTimeRef={pointerDownTimeRef}
            selectedGroupsRef={selectedGroupsRef}
          />
        ))}
      </Fragment>
    );
  }

  const instanceMatrices = useMemo(() => {
    const matrices = new Float32Array(nonSelectedInstances.length * 16);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    const euler = new THREE.Euler();
    for (let i = 0; i < nonSelectedInstances.length; i++) {
      const { entry } = nonSelectedInstances[i];
      pos.set(entry.posX, entry.posY, entry.posZ);
      euler.set(entry.rotX * DEG2RAD, entry.rotY * DEG2RAD, entry.rotZ * DEG2RAD);
      quat.setFromEuler(euler);
      const [sx, sy, sz] = placementScaleForViewport(entry.scaleX, entry.scaleY, entry.scaleZ);
      scl.set(sx, sy, sz);
      m.compose(pos, quat, scl);
      m.toArray(matrices, i * 16);
    }
    return matrices;
  }, [nonSelectedInstances]);

  return (
    <Fragment>
      {drawBindings.map((db) => (
        <InstancedTexturedMesh
          key={db.draw.key}
          drawBinding={db}
          instanceMatrices={instanceMatrices}
          instanceCount={nonSelectedInstances.length}
          textureDataMap={textureDataMap}
          textureSlotLoadEnabled={textureSlotLoadEnabled}
          wireframe={wireframe}
          texturePool={texturePool}
          previewRenderStyle={previewRenderStyle}
          animeKeyLightDir={animeKeyLightDir}
          clickPickSelectionEnabled={clickPickSelectionEnabled}
          instances={nonSelectedInstances}
          onSelectNode={onSelectNode}
          gizmoDraggingRef={gizmoDraggingRef}
          orbitActiveRef={orbitActiveRef}
          pointerDownTimeRef={pointerDownTimeRef}
        />
      ))}

      {selectedInstance && (
        <StageModelGroup
          key={`sel-${selectedInstance.nodeId}`}
          nodeId={selectedInstance.nodeId}
          bundle={bundle}
          wireframe={wireframe}
          isSelected
          isLocked={!canEditSceneNode(selectedInstance.nodeId, nodeVisibility, objectLocks)}
          onClick={onSelectNode}
          clickPickSelectionEnabled={clickPickSelectionEnabled}
          textureDataMap={textureDataMap}
          textureSlotLoadEnabled={textureSlotLoadEnabled}
          objectTextureLoadState={objectTextureLoadState}
          texturePool={texturePool}
          previewRenderStyle={previewRenderStyle}
          animeKeyLightDir={animeKeyLightDir}
          position={[selectedInstance.entry.posX, selectedInstance.entry.posY, selectedInstance.entry.posZ]}
          rotation={[selectedInstance.entry.rotX, selectedInstance.entry.rotY, selectedInstance.entry.rotZ]}
          scale={placementScaleForViewport(selectedInstance.entry.scaleX, selectedInstance.entry.scaleY, selectedInstance.entry.scaleZ)}
          placementGlobalIdx={selectedInstance.globalIdx}
          showPlacementTransformGizmo={canEditSceneNode(selectedInstance.nodeId, nodeVisibility, objectLocks)}
          placementGizmoMode={placementGizmoMode}
          onPlacementGizmoFrame={onPlacementGizmoFrame}
          onPlacementGizmoCommit={onPlacementGizmoCommit}
          gizmoDraggingRef={gizmoDraggingRef}
          orbitActiveRef={orbitActiveRef}
          pointerDownTimeRef={pointerDownTimeRef}
          selectedGroupsRef={selectedGroupsRef}
        />
      )}
    </Fragment>
  );
});

const InstancedTexturedMesh = memo(function InstancedTexturedMesh({
  drawBinding,
  instanceMatrices,
  instanceCount,
  textureDataMap,
  textureSlotLoadEnabled,
  wireframe,
  texturePool,
  previewRenderStyle,
  animeKeyLightDir,
  clickPickSelectionEnabled,
  instances,
  onSelectNode,
  gizmoDraggingRef,
  orbitActiveRef,
  pointerDownTimeRef,
}: {
  drawBinding: DrawBinding;
  instanceMatrices: Float32Array;
  instanceCount: number;
  textureDataMap: NutexbTextureDataMap;
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>;
  wireframe: boolean;
  texturePool: SceneTexturePool;
  previewRenderStyle: PreviewRenderStyle;
  animeKeyLightDir: THREE.Vector3;
  clickPickSelectionEnabled: boolean;
  instances: PlacementInstance[];
  onSelectNode: (id: string | null) => void;
  gizmoDraggingRef: React.RefObject<boolean>;
  orbitActiveRef: React.RefObject<boolean>;
  pointerDownTimeRef: React.RefObject<number>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { draw, binding } = drawBinding;

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    for (let i = 0; i < instanceCount; i++) {
      m.fromArray(instanceMatrices, i * 16);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [instanceMatrices, instanceCount]);

  const slotDataEntries = useMemo(() => {
    return SLOT_KEYS.map((slot) => {
      if (!textureSlotLoadEnabled[slot]) return [slot, null] as const;
      const data = lookupTextureData(textureDataMap, pathForSlot(binding, slot));
      return [slot, data] as const;
    });
  }, [textureDataMap, binding, textureSlotLoadEnabled]);

  const dataKey = slotDataEntries.map(([, d]) => (d ? `${d.width}x${d.height}` : "")).join("\0");

  const textures = useMemo(() => {
    const result: Partial<Record<PbrSlotKind, THREE.DataTexture>> = {};
    for (const [slot, data] of slotDataEntries) {
      if (!data) continue;
      const path = pathForSlot(binding, slot);
      if (!path) continue;
      const poolKey = buildTexturePoolKey(path, slot, binding, data.width, data.height);
      result[slot] = texturePool.acquire(poolKey, () => createDataTexture(data, slot, binding));
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, texturePool]);

  const exvsActive = previewRenderStyle === "anime";
  const shaderFamily = binding.shaderFamily;
  const hasMap = !!textures.map;
  const hasRough = !!textures.roughnessMap || typeof binding.uniforms.roughnessScalar === "number";
  const hasMetal = !!textures.metalnessMap || typeof binding.uniforms.metalnessScalar === "number";
  const hasEmit = !!textures.emissiveMap;
  const canUseEmissiveMap = hasEmit && shaderFamily !== "generic";
  const hasAo = !!textures.aoMap;
  const hasCube = !!textures.cubeMap;
  const hasAnyTexture = hasMap || hasRough || hasMetal || hasEmit || hasAo || hasCube || !!textures.normalMap;
  const transparent = binding.renderHints.isTransparent === true;
  const materialSide = transparent ? THREE.DoubleSide : THREE.FrontSide;

  const roughnessValue = typeof binding.uniforms.roughnessScalar === "number"
    ? binding.uniforms.roughnessScalar
    : hasRough ? 1 : shaderFamily === "vsngCharaSparkle" ? 0.45 : 0.65;
  const metalnessValue = typeof binding.uniforms.metalnessScalar === "number"
    ? binding.uniforms.metalnessScalar
    : hasMetal ? 1 : shaderFamily === "vsngCharaSparkle" ? 0.35 : 0.12;
  const roughnessForStyle = exvsActive ? Math.min(1, roughnessValue * 0.84) : roughnessValue;
  const emissiveIntensity = exvsActive
    ? shaderFamily === "vsngCharaSparkle" ? 2.15 : canUseEmissiveMap ? GENERIC_STAGE_ANIME_EMISSIVE_INTENSITY : 0
    : shaderFamily === "vsngCharaSparkle" ? 1.8 : canUseEmissiveMap ? GENERIC_STAGE_EMISSIVE_INTENSITY : 0;
  const envIntensity = exvsActive
    ? shaderFamily === "vsngCharaSparkle" ? 1.38 : hasCube ? 1.05 : 0
    : shaderFamily === "vsngCharaSparkle" ? 1.55 : hasCube ? 1.15 : 0.6;
  const exvsUsesMetalnessMap = hasCube && textureSlotLoadEnabled.metalnessMap;
  const effectiveMetalnessMap = exvsActive
    ? exvsUsesMetalnessMap ? textures.metalnessMap ?? null : null
    : textureSlotLoadEnabled.metalnessMap ? textures.metalnessMap ?? null : null;
  const effectiveMetalnessValue = exvsActive
    ? exvsUsesMetalnessMap ? metalnessValue : Math.min(metalnessValue, 0.2)
    : metalnessValue;
  const baseColor = hasAnyTexture ? "#ffffff" : "#cccccc";

  const handleClick = useCallback((e: any) => {
    if (!clickPickSelectionEnabled) return;
    if (gizmoDraggingRef?.current || orbitActiveRef?.current) return;
    const elapsed = performance.now() - (pointerDownTimeRef?.current ?? 0);
    if (elapsed > 250) return;
    e.stopPropagation();
    const instanceId = e.instanceId;
    if (instanceId != null && instanceId < instances.length) {
      onSelectNode(instances[instanceId].nodeId);
    }
  }, [clickPickSelectionEnabled, gizmoDraggingRef, instances, onSelectNode, orbitActiveRef, pointerDownTimeRef]);

  if (instanceCount === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[draw.geometry, undefined, instanceCount]}
      frustumCulled={false}
      onClick={handleClick}
    >
      <meshStandardMaterial
        color={baseColor}
        wireframe={wireframe}
        side={materialSide}
        map={textures.map ?? null}
        normalMap={textures.normalMap ?? null}
        normalScale={textures.normalMap ? NORMAL_SCALE_DEFAULT : undefined}
        roughnessMap={textures.roughnessMap ?? null}
        metalnessMap={effectiveMetalnessMap}
        emissiveMap={canUseEmissiveMap ? textures.emissiveMap ?? null : null}
        emissive={canUseEmissiveMap ? new THREE.Color(0xffffff) : new THREE.Color(0)}
        emissiveIntensity={emissiveIntensity}
        aoMap={textures.aoMap ?? null}
        aoMapIntensity={hasAo ? 0.35 : 0}
        envMap={textures.cubeMap ?? null}
        envMapIntensity={envIntensity}
        alphaTest={hasMap ? 0.001 : 0}
        transparent={transparent}
        roughness={roughnessForStyle}
        metalness={effectiveMetalnessValue}
      />
    </instancedMesh>
  );
});

const StageModelGroup = memo(function StageModelGroup({
  nodeId,
  bundle,
  wireframe,
  isSelected,
  isLocked,
  onClick,
  clickPickSelectionEnabled,
  position,
  rotation,
  scale,
  textureDataMap,
  textureSlotLoadEnabled,
  objectTextureLoadState,
  texturePool,
  previewRenderStyle,
  animeKeyLightDir,
  placementGlobalIdx,
  showPlacementTransformGizmo = false,
  placementGizmoMode = "translate",
  onPlacementGizmoFrame,
  onPlacementGizmoCommit,
  gizmoDraggingRef,
  orbitActiveRef,
  pointerDownTimeRef,
  selectedGroupsRef,
}: {
  nodeId: string;
  bundle: SsbhModelPreviewBundle;
  wireframe: boolean;
  isSelected: boolean;
  isLocked?: boolean;
  onClick: (id: string) => void;
  clickPickSelectionEnabled: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  textureDataMap: NutexbTextureDataMap;
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>;
  objectTextureLoadState: ObjectTextureLoadState;
  texturePool: SceneTexturePool;
  previewRenderStyle: PreviewRenderStyle;
  animeKeyLightDir: THREE.Vector3;
  placementGlobalIdx?: number;
  showPlacementTransformGizmo?: boolean;
  placementGizmoMode?: PlacementGizmoMode;
  onPlacementGizmoFrame?: (placementIdx: number, t: TransformData) => void;
  onPlacementGizmoCommit?: (placementIdx: number, t: TransformData) => void;
  gizmoDraggingRef?: React.RefObject<boolean>;
  orbitActiveRef?: React.RefObject<boolean>;
  pointerDownTimeRef?: React.RefObject<number>;
  selectedGroupsRef?: React.RefObject<SelectedGroupMap>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const regress = useThree((s) => s.performance.regress);

  useEffect(() => {
    const g = groupRef.current;
    if (!g || !selectedGroupsRef) return;
    if (isSelected) {
      selectedGroupsRef.current.set(nodeId, g);
    } else {
      selectedGroupsRef.current.delete(nodeId);
    }
    return () => { selectedGroupsRef.current.delete(nodeId); };
  }, [isSelected, nodeId, selectedGroupsRef]);

  const draws = useMemo((): BuiltMeshDraw[] => {
    try {
      const modl = bundle.modl as any;
      const mesh = bundle.mesh as any;
      const skel = bundle.skel as any;
      if (!modl || !mesh) return [];
      return buildDrawListFromBundle(modl, mesh, skel ?? undefined);
    } catch {
      return [];
    }
  }, [bundle]);

  const matlLookup = useMemo(
    () => buildMatlLookup(bundle.matl as any),
    [bundle.matl],
  );

  const refToPathMap = useMemo(
    () => buildTextureRefToPathMap(bundle),
    [bundle],
  );

  const drawBindings = useMemo((): DrawBinding[] => {
    const rawBindings = draws.map((draw) => {
      const binding = resolveMaterialBinding(draw.materialLabel, matlLookup, refToPathMap);
      return { draw, binding };
    });

    const grouped = new Map<string, DrawBinding[]>();
    for (const db of rawBindings) {
      const key = db.draw.materialLabel;
      const list = grouped.get(key);
      if (list) list.push(db);
      else grouped.set(key, [db]);
    }

    const merged: DrawBinding[] = [];
    for (const group of grouped.values()) {
      if (group.length === 1) {
        merged.push(group[0]);
        continue;
      }
      const geometries = group.map((db) => db.draw.geometry);
      const mergedGeo = mergeBufferGeometries(geometries, false);
      if (mergedGeo) {
        merged.push({
          draw: { ...group[0].draw, geometry: mergedGeo, key: `merged_${group[0].draw.materialLabel}` },
          binding: group[0].binding,
        });
      } else {
        merged.push(...group);
      }
    }
    return merged;
  }, [draws, matlLookup, refToPathMap]);

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (isLocked) return;
      if (!clickPickSelectionEnabled) return;
      if (gizmoDraggingRef?.current) return;
      if (orbitActiveRef?.current) return;
      const elapsed = performance.now() - (pointerDownTimeRef?.current ?? 0);
      if (elapsed > 250) return;
      onClick(nodeId);
    },
    [clickPickSelectionEnabled, isLocked, nodeId, onClick, gizmoDraggingRef, orbitActiveRef, pointerDownTimeRef]
  );

  const euler = useMemo(
    () =>
      rotation
        ? new THREE.Euler(
            rotation[0] * DEG2RAD,
            rotation[1] * DEG2RAD,
            rotation[2] * DEG2RAD,
          )
        : undefined,
    [rotation]
  );

  const gizmoReady =
    shouldRenderGizmoControls({
      isSelected: showPlacementTransformGizmo,
      hasCommitHandler: Boolean(onPlacementGizmoCommit),
    });

  const tcRef = useRef<any>(null);

  useEffect(() => {
    const tc = tcRef.current;
    if (!tc || placementGizmoMode !== "scale") return;
    const enlargeUniformHandle = () => {
      tc.traverse((child: THREE.Object3D) => {
        if (child.name === "XYZS" || child.name === "XYZ") {
          child.scale.setScalar(1.8);
        }
      });
    };
    enlargeUniformHandle();
  }, [placementGizmoMode]);

  const handleTcObjectChange = useCallback(() => {
    if (shouldInvalidateViewportForGizmoEvent("drag")) {
      regress();
      invalidate();
    }
    if (!shouldSyncSceneStateForGizmoEvent("drag")) return;
    const g = groupRef.current;
    if (!g || !onPlacementGizmoFrame) return;
    onPlacementGizmoFrame(placementGlobalIdx ?? -1, readTransformFromGroup(g));
  }, [invalidate, placementGlobalIdx, onPlacementGizmoFrame, regress]);

  const handleTcMouseUp = useCallback(() => {
    if (shouldInvalidateViewportForGizmoEvent("commit")) {
      invalidate();
    }
    if (!shouldSyncSceneStateForGizmoEvent("commit")) return;
    const g = groupRef.current;
    if (!g || !onPlacementGizmoCommit) return;
    onPlacementGizmoCommit(placementGlobalIdx ?? -1, readTransformFromGroup(g));
  }, [invalidate, placementGlobalIdx, onPlacementGizmoCommit]);

  return (
    <Fragment>
      <group
        ref={groupRef}
        name={nodeId}
        onClick={handleClick}
        position={position}
        rotation={euler}
        scale={scale}
      >
        {drawBindings.map((db) => (
          <TexturedMesh
            key={db.draw.key}
            drawBinding={db}
            textureDataMap={textureDataMap}
            textureSlotLoadEnabled={textureSlotLoadEnabled}
            objectTextureLoadState={objectTextureLoadState}
            wireframe={wireframe}
            isSelected={isSelected}
            objectId={nodeId}
            texturePool={texturePool}
            previewRenderStyle={previewRenderStyle}
            animeKeyLightDir={animeKeyLightDir}
          />
        ))}
      </group>
      {gizmoReady ? (
        <SceneTransformControls
          ref={tcRef}
          key={`${nodeId}-${placementGizmoMode}`}
          object={groupRef as unknown as RefObject<THREE.Object3D>}
          mode={placementGizmoMode}
          space="world"
          size={1.12}
          showX
          showY
          showZ
          onObjectChange={handleTcObjectChange}
          onMouseDown={() => { if (gizmoDraggingRef) gizmoDraggingRef.current = true; }}
          onMouseUp={() => {
            if (gizmoDraggingRef) setTimeout(() => { gizmoDraggingRef.current = false; }, 50);
            handleTcMouseUp();
          }}
        />
      ) : null}
    </Fragment>
  );
});

const EffectMarker = memo(function EffectMarker({
  entry,
  globalIdx,
  isSelected,
  isLocked,
  onClick,
  clickPickSelectionEnabled,
  showGizmo,
  placementGizmoMode = "translate",
  onPlacementGizmoFrame,
  onPlacementGizmoCommit,
  gizmoDraggingRef,
  orbitActiveRef,
  pointerDownTimeRef,
}: {
  entry: PlacementRow;
  globalIdx: number;
  isSelected: boolean;
  isLocked?: boolean;
  onClick: (id: string | null) => void;
  clickPickSelectionEnabled: boolean;
  showGizmo: boolean;
  placementGizmoMode?: PlacementGizmoMode;
  onPlacementGizmoFrame?: (idx: number, t: TransformData) => void;
  onPlacementGizmoCommit?: (idx: number, t: TransformData) => void;
  gizmoDraggingRef?: React.RefObject<boolean>;
  orbitActiveRef?: React.RefObject<boolean>;
  pointerDownTimeRef?: React.RefObject<number>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const regress = useThree((s) => s.performance.regress);
  const nodeId = `__effect__${globalIdx}`;

  const handleClick = useCallback(
    (e: any) => {
      if (isLocked) return;
      if (!clickPickSelectionEnabled) return;
      if (gizmoDraggingRef?.current) return;
      if (orbitActiveRef?.current) return;
      const elapsed = performance.now() - (pointerDownTimeRef?.current ?? 0);
      if (elapsed > 250) return;
      e.stopPropagation();
      onClick(nodeId);
    },
    [clickPickSelectionEnabled, isLocked, onClick, nodeId, gizmoDraggingRef, orbitActiveRef, pointerDownTimeRef],
  );

  const handleGizmoChange = useCallback(() => {
    if (shouldInvalidateViewportForGizmoEvent("drag")) {
      regress();
      invalidate();
    }
    if (!shouldSyncSceneStateForGizmoEvent("drag")) return;
    if (!groupRef.current || !onPlacementGizmoFrame) return;
    onPlacementGizmoFrame(globalIdx, readTransformFromGroup(groupRef.current));
  }, [globalIdx, onPlacementGizmoFrame, invalidate, regress]);

  const handleGizmoEnd = useCallback(() => {
    if (shouldInvalidateViewportForGizmoEvent("commit")) {
      invalidate();
    }
    if (!shouldSyncSceneStateForGizmoEvent("commit")) return;
    if (!groupRef.current || !onPlacementGizmoCommit) return;
    onPlacementGizmoCommit(globalIdx, readTransformFromGroup(groupRef.current));
  }, [globalIdx, onPlacementGizmoCommit, invalidate]);

  return (
    <Fragment>
      <group
        ref={groupRef}
        position={[entry.posX, entry.posY, entry.posZ]}
        rotation={[entry.rotX * DEG2RAD, entry.rotY * DEG2RAD, entry.rotZ * DEG2RAD]}
        scale={[
          Math.max(1e-4, entry.scaleX),
          Math.max(1e-4, entry.scaleY),
          Math.max(1e-4, entry.scaleZ),
        ]}
      >
        <Sphere args={[2, 8, 8]} onClick={handleClick}>
          <meshStandardMaterial
            color={isSelected ? "#ffaa22" : "#ff6644"}
            emissive={isSelected ? "#ffaa22" : "#ff4422"}
            emissiveIntensity={isSelected ? 0.8 : 0.5}
          />
        </Sphere>
        <Html center distanceFactor={200} style={{ pointerEvents: "none" }}>
          <div className="text-[9px] text-orange-400 font-mono whitespace-nowrap bg-black/60 px-1 rounded">
            {entry.vdkType}#{globalIdx}
          </div>
        </Html>
      </group>
      {showGizmo && groupRef.current ? (
        <SceneTransformControls
          key={`eff-gizmo-${globalIdx}-${placementGizmoMode}`}
          object={groupRef.current}
          mode={placementGizmoMode}
          size={0.6}
          onChange={handleGizmoChange}
          onMouseDown={() => { if (gizmoDraggingRef) gizmoDraggingRef.current = true; }}
          onMouseUp={() => {
            if (gizmoDraggingRef) setTimeout(() => { gizmoDraggingRef.current = false; }, 50);
            handleGizmoEnd();
          }}
        />
      ) : null}
    </Fragment>
  );
});
