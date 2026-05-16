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
  TransformControls,
} from "@react-three/drei";
import {
  useRef,
  useCallback,
  useMemo,
  useEffect,
  memo,
  forwardRef,
  useImperativeHandle,
  Fragment,
  type RefObject,
} from "react";
import * as THREE from "three";
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
} from "@/page/TestEditor/components/ssbh-model-preview/meshFromSsbh";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";
import type { NutexbRgbaData } from "@/page/TestEditor/components/ssbh-model-preview/nutexbPreviewCache";
import type { PlacementRow } from "./PlacementPanel";
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

const DEG2RAD = Math.PI / 180;

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
  placementEntries: PlacementRow[];
  showGrid: boolean;
  showAxes: boolean;
  wireframe: boolean;
  showStats: boolean;
  selectedNodeId: string | null;
  selectedPlacementIdx: number | null;
  onSelectNode: (id: string | null) => void;
  textureDataMap: NutexbTextureDataMap;
  onDrawStatsChange?: (stats: SceneDrawStats) => void;
  /** Parsed graphic_param.csv rows — drives directional / IBL preview lighting when keys exist */
  graphicParams?: GraphicParam[];
  baseTransform?: TransformData;
  onBaseTransformChange?: (t: TransformData) => void;
  standaloneTransforms?: Map<string, TransformData>;
  onStandaloneTransformChange?: (nodeId: string, t: TransformData) => void;
  clickPickSelectionEnabled?: boolean;
  /** Test Editor-style anime pipeline: bloom + warm lights + cel-tinted PBR when "anime". */
  previewRenderStyle?: PreviewRenderStyle;
  /** Placement manipulator mode for OBJECT rows selected in hierarchy/placement list */
  placementGizmoMode?: PlacementGizmoMode;
  /** Batched transform sync while dragging viewport gizmo (placement CSV row index). */
  onPlacementGizmoFrame?: (placementIdx: number, t: TransformData) => void;
  /** Final transform sync when releasing gizmo drag */
  onPlacementGizmoCommit?: (placementIdx: number, t: TransformData) => void;
}

export interface MapViewportHandle {
  resetCamera: () => void;
}

function StageOrbitControls({
  controlsRef,
}: {
  controlsRef: RefObject<OrbitControlsType | null>;
}) {
  const regress = useThree((s) => s.performance.regress);
  const invalidate = useThree((s) => s.invalidate);
  /**
   * regress() updates performance.current; pairing it with Canvas-level adaptive setDpr caused
   * WebGL buffer reallocations every orbit-control change event (~many/sec), doubling RSS on large scenes.
   * Match prior Scene Editor behavior: regress once per gesture (pointer down / orbit start).
   */
  const onGestureStart = useCallback(() => {
    regress();
    invalidate();
  }, [regress, invalidate]);
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
      onChange={onDemandFrame}
    />
  );
}

export const MapViewport = forwardRef<MapViewportHandle, MapViewportProps>(
  function MapViewport(
    {
      baseModel,
      subModels,
      placementEntries,
      showGrid,
      showAxes,
      wireframe,
      showStats,
      selectedNodeId,
      selectedPlacementIdx,
      onSelectNode,
      textureDataMap,
      onDrawStatsChange,
      graphicParams = [],
      baseTransform,
      onBaseTransformChange,
      standaloneTransforms,
      onStandaloneTransformChange,
      clickPickSelectionEnabled = false,
      previewRenderStyle = "standard",
      placementGizmoMode = "translate",
      onPlacementGizmoFrame,
      onPlacementGizmoCommit,
    },
    ref
  ) {
    const controlsRef = useRef<OrbitControlsType>(null);

    useImperativeHandle(ref, () => ({
      resetCamera: () => {
        if (controlsRef.current) {
          controlsRef.current.reset();
        }
      },
    }));

    const texturePool = useMemo(() => new SceneTexturePool(), []);
    useEffect(() => () => texturePool.disposeAll(), [texturePool]);

    const gizmoDraggingRef = useRef(false);

    const handlePointerMissed = useCallback(() => {
      if (!clickPickSelectionEnabled || gizmoDraggingRef.current) return;
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

        {baseModel && (
          <StageModelGroup
            nodeId="base"
            bundle={baseModel}
            wireframe={wireframe}
            isSelected={selectedNodeId === "base"}
            onClick={onSelectNode}
            clickPickSelectionEnabled={clickPickSelectionEnabled}
            textureDataMap={textureDataMap}
            texturePool={texturePool}
            previewRenderStyle={previewRenderStyle}
            animeKeyLightDir={animeKeyLightDir}
            position={baseTransform ? [baseTransform.posX, baseTransform.posY, baseTransform.posZ] : undefined}
            rotation={baseTransform ? [baseTransform.rotX, baseTransform.rotY, baseTransform.rotZ] : undefined}
            scale={baseTransform ? [baseTransform.scaleX, baseTransform.scaleY, baseTransform.scaleZ] : undefined}
            showPlacementTransformGizmo={selectedNodeId === "base"}
            placementGizmoMode={placementGizmoMode}
            onPlacementGizmoFrame={
              onBaseTransformChange
                ? (_idx: number, t: TransformData) => onBaseTransformChange(t)
                : undefined
            }
            onPlacementGizmoCommit={
              onBaseTransformChange
                ? (_idx: number, t: TransformData) => onBaseTransformChange(t)
                : undefined
            }
            gizmoDraggingRef={gizmoDraggingRef}
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
            return [
              <StageModelGroup
                key={sub.folderName}
                nodeId={sub.folderName}
                bundle={sub.bundle}
                wireframe={wireframe}
                isSelected={isStandaloneSel}
                onClick={onSelectNode}
                clickPickSelectionEnabled={clickPickSelectionEnabled}
                textureDataMap={textureDataMap}
                texturePool={texturePool}
                previewRenderStyle={previewRenderStyle}
                animeKeyLightDir={animeKeyLightDir}
                gizmoDraggingRef={gizmoDraggingRef}
                position={st ? [st.posX, st.posY, st.posZ] : undefined}
                rotation={st ? [st.rotX, st.rotY, st.rotZ] : undefined}
                scale={st ? [st.scaleX, st.scaleY, st.scaleZ] : undefined}
                showPlacementTransformGizmo={isStandaloneSel}
                placementGizmoMode={placementGizmoMode}
                onPlacementGizmoFrame={
                  onStandaloneTransformChange
                    ? (_idx: number, t: TransformData) => onStandaloneTransformChange(sub.folderName, t)
                    : undefined
                }
                onPlacementGizmoCommit={
                  onStandaloneTransformChange
                    ? (_idx: number, t: TransformData) => onStandaloneTransformChange(sub.folderName, t)
                    : undefined
                }
              />,
            ];
          }

          return objectRows.map(({ entry, globalIdx }) => (
            <StageModelGroup
              key={`${sub.folderName}-pl-${globalIdx}`}
              nodeId={formatPlacementViewportNodeId(sub.folderName, globalIdx)}
              bundle={sub.bundle}
              wireframe={wireframe}
              isSelected={selectedPlacementIdx === globalIdx}
              onClick={onSelectNode}
              clickPickSelectionEnabled={clickPickSelectionEnabled}
              textureDataMap={textureDataMap}
              texturePool={texturePool}
              previewRenderStyle={previewRenderStyle}
              animeKeyLightDir={animeKeyLightDir}
              position={[entry.posX, entry.posY, entry.posZ]}
              rotation={[entry.rotX, entry.rotY, entry.rotZ]}
              scale={[entry.scaleX, entry.scaleY, entry.scaleZ]}
              placementGlobalIdx={globalIdx}
              showPlacementTransformGizmo={
                selectedPlacementIdx !== null &&
                selectedPlacementIdx === globalIdx
              }
              placementGizmoMode={placementGizmoMode}
              onPlacementGizmoFrame={onPlacementGizmoFrame}
              onPlacementGizmoCommit={onPlacementGizmoCommit}
              gizmoDraggingRef={gizmoDraggingRef}
            />
          ));
        })}

        {effectEntries.map(({ entry: eff, globalIdx }) => (
          <EffectMarker
            key={`effect-${globalIdx}`}
            entry={eff}
            globalIdx={globalIdx}
            isSelected={selectedPlacementIdx === globalIdx}
            onClick={onSelectNode}
            clickPickSelectionEnabled={clickPickSelectionEnabled}
            showGizmo={
              selectedPlacementIdx !== null &&
              selectedPlacementIdx === globalIdx
            }
            placementGizmoMode={placementGizmoMode}
            onPlacementGizmoFrame={onPlacementGizmoFrame}
            onPlacementGizmoCommit={onPlacementGizmoCommit}
            gizmoDraggingRef={gizmoDraggingRef}
          />
        ))}

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

        <StageOrbitControls controlsRef={controlsRef} />
      </Canvas>
    );
  }
);

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
  wireframe,
  isSelected,
  texturePool,
  previewRenderStyle,
  animeKeyLightDir,
}: {
  drawBinding: DrawBinding;
  textureDataMap: NutexbTextureDataMap;
  wireframe: boolean;
  isSelected: boolean;
  texturePool: SceneTexturePool;
  previewRenderStyle: PreviewRenderStyle;
  animeKeyLightDir: THREE.Vector3;
}) {
  const { draw, binding } = drawBinding;

  const slotDataEntries = useMemo(() => {
    return SLOT_KEYS.map((slot) => {
      const data = lookupTextureData(textureDataMap, pathForSlot(binding, slot));
      return [slot, data] as const;
    });
  }, [textureDataMap, binding]);

  const dataKey = slotDataEntries
    .map(([, d]) => (d ? `${d.width}x${d.height}` : ""))
    .join("\0");

  const textures = useMemo(() => {
    const result: Partial<Record<PbrSlotKind, THREE.DataTexture>> = {};
    const loaded: string[] = [];

    for (const [slot, data] of slotDataEntries) {
      if (!data) continue;
      const path = pathForSlot(binding, slot);
      if (!path) continue;
      const poolKey = buildTexturePoolKey(path, slot, binding, data.width, data.height);
      const shared = texturePool.has(poolKey);
      result[slot] = texturePool.acquire(poolKey, () => createDataTexture(data, slot, binding));
      loaded.push(shared ? `${slot}(shared)` : slot);
    }

    if (loaded.length > 0) {
      console.log(
        `[SceneEdit:Texture] mat="${binding.materialLabel}" shader="${binding.shaderFamily}" applied=[${loaded.join(",")}] poolSize=${texturePool.size}`,
      );
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
  const onBeforeCompileAnime = useMemo(
    () => (shader: { fragmentShader: string; uniforms: Record<string, { value: unknown }> }) => {
      onBeforeCompileExvs(shader);
      onBeforeCompileSelection(shader);
    },
    [onBeforeCompileExvs, onBeforeCompileSelection],
  );

  useFrame(() => {
    if (!exvsActive) return;
    exvsUniforms.uAnimeKeyDir.value.copy(animeKeyLightDir);
  });

  useFrame((state) => {
    if (!exvsActive) return;
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

  const transparent = binding.renderHints.isTransparent ?? hasMap;
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

  const canUseMetalnessMap = hasCube;
  const effectiveMetalnessMap = exvsActive
    ? canUseMetalnessMap
      ? textures.metalnessMap ?? null
      : null
    : textures.metalnessMap ?? null;
  const effectiveMetalnessValue = exvsActive
    ? canUseMetalnessMap
      ? metalnessValue
      : Math.min(metalnessValue, 0.2)
    : metalnessValue;

  const baseColor = exvsActive
    ? hasAnyTexture
      ? "#ffffff"
      : "#cccccc"
    : isSelected
      ? "#88aaff"
      : hasAnyTexture
        ? "#ffffff"
        : "#cccccc";

  return (
    <mesh geometry={draw.geometry}>
      <meshStandardMaterial
        key={exvsActive ? "exvs" : "std"}
        color={baseColor}
        wireframe={wireframe}
        side={THREE.DoubleSide}
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
        onBeforeCompile={exvsActive ? onBeforeCompileAnime : undefined}
      />
    </mesh>
  );
});

const StageModelGroup = memo(function StageModelGroup({
  nodeId,
  bundle,
  wireframe,
  isSelected,
  onClick,
  clickPickSelectionEnabled,
  position,
  rotation,
  scale,
  textureDataMap,
  texturePool,
  previewRenderStyle,
  animeKeyLightDir,
  placementGlobalIdx,
  showPlacementTransformGizmo = false,
  placementGizmoMode = "translate",
  onPlacementGizmoFrame,
  onPlacementGizmoCommit,
  gizmoDraggingRef,
}: {
  nodeId: string;
  bundle: SsbhModelPreviewBundle;
  wireframe: boolean;
  isSelected: boolean;
  onClick: (id: string) => void;
  clickPickSelectionEnabled: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  textureDataMap: NutexbTextureDataMap;
  texturePool: SceneTexturePool;
  previewRenderStyle: PreviewRenderStyle;
  animeKeyLightDir: THREE.Vector3;
  placementGlobalIdx?: number;
  showPlacementTransformGizmo?: boolean;
  placementGizmoMode?: PlacementGizmoMode;
  onPlacementGizmoFrame?: (placementIdx: number, t: TransformData) => void;
  onPlacementGizmoCommit?: (placementIdx: number, t: TransformData) => void;
  gizmoDraggingRef?: React.RefObject<boolean>;
}) {
  const groupRef = useRef<THREE.Group>(null);

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
    return draws.map((draw) => {
      const binding = resolveMaterialBinding(draw.materialLabel, matlLookup, refToPathMap);
      console.log(
        `[SceneEdit:Material] node="${nodeId}" mat="${binding.materialLabel}" shader="${binding.shaderFamily}"` +
        ` texPaths={map=${binding.texturePaths.mapPath ? "Y" : "N"}, nrm=${binding.texturePaths.normalPath ? "Y" : "N"},` +
        ` rgh=${binding.texturePaths.roughnessPath ? "Y" : "N"}, mtl=${binding.texturePaths.metalnessPath ? "Y" : "N"},` +
        ` emi=${binding.texturePaths.emissivePath ? "Y" : "N"}, ao=${binding.texturePaths.aoPath ? "Y" : "N"},` +
        ` cube=${binding.texturePaths.cubePath ? "Y" : "N"}}` +
        ` uniforms={rough=${binding.uniforms.roughnessScalar}, metal=${binding.uniforms.metalnessScalar}}`,
      );
      return { draw, binding };
    });
  }, [draws, matlLookup, refToPathMap, nodeId]);

  const handleClick = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (!clickPickSelectionEnabled) return;
      if (gizmoDraggingRef?.current) return;
      onClick(nodeId);
    },
    [clickPickSelectionEnabled, nodeId, onClick, gizmoDraggingRef]
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
    showPlacementTransformGizmo &&
    onPlacementGizmoFrame &&
    onPlacementGizmoCommit;

  const handleTcObjectChange = useCallback(() => {
    const g = groupRef.current;
    if (!g || !onPlacementGizmoFrame) return;
    onPlacementGizmoFrame(placementGlobalIdx ?? -1, readTransformFromGroup(g));
  }, [placementGlobalIdx, onPlacementGizmoFrame]);

  const handleTcMouseUp = useCallback(() => {
    const g = groupRef.current;
    if (!g || !onPlacementGizmoCommit) return;
    onPlacementGizmoCommit(placementGlobalIdx ?? -1, readTransformFromGroup(g));
  }, [placementGlobalIdx, onPlacementGizmoCommit]);

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
            wireframe={wireframe}
            isSelected={isSelected}
            texturePool={texturePool}
            previewRenderStyle={previewRenderStyle}
            animeKeyLightDir={animeKeyLightDir}
          />
        ))}
      </group>
      {gizmoReady ? (
        <TransformControls
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
  onClick,
  clickPickSelectionEnabled,
  showGizmo,
  placementGizmoMode = "translate",
  onPlacementGizmoFrame,
  onPlacementGizmoCommit,
  gizmoDraggingRef,
}: {
  entry: PlacementRow;
  globalIdx: number;
  isSelected: boolean;
  onClick: (id: string | null) => void;
  clickPickSelectionEnabled: boolean;
  showGizmo: boolean;
  placementGizmoMode?: PlacementGizmoMode;
  onPlacementGizmoFrame?: (idx: number, t: TransformData) => void;
  onPlacementGizmoCommit?: (idx: number, t: TransformData) => void;
  gizmoDraggingRef?: React.RefObject<boolean>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const nodeId = `__effect__${globalIdx}`;

  const handleClick = useCallback(
    (e: any) => {
      if (!clickPickSelectionEnabled) return;
      if (gizmoDraggingRef?.current) return;
      e.stopPropagation();
      onClick(nodeId);
    },
    [clickPickSelectionEnabled, onClick, nodeId, gizmoDraggingRef],
  );

  const handleGizmoChange = useCallback(() => {
    if (!groupRef.current || !onPlacementGizmoFrame) return;
    onPlacementGizmoFrame(globalIdx, readTransformFromGroup(groupRef.current));
    invalidate();
  }, [globalIdx, onPlacementGizmoFrame, invalidate]);

  const handleGizmoEnd = useCallback(() => {
    if (!groupRef.current || !onPlacementGizmoCommit) return;
    onPlacementGizmoCommit(globalIdx, readTransformFromGroup(groupRef.current));
  }, [globalIdx, onPlacementGizmoCommit]);

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
        <TransformControls
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
