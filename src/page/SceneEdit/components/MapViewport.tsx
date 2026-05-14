import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  GizmoHelper,
  GizmoViewport,
  Grid,
  Sphere,
  Html,
  Stats,
} from "@react-three/drei";
import {
  useRef,
  useCallback,
  useMemo,
  useEffect,
  memo,
  forwardRef,
  useImperativeHandle,
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
import type { SceneDrawStats } from "./SceneViewportOverlay";
import type { PreviewRenderStyle } from "@/page/TestEditor/components/ssbh-model-preview/SsbhModelPreviewContext";
import {
  DEFAULT_PREVIEW_3D_BACKGROUND,
  DEFAULT_PREVIEW_AMBIENT_INTENSITY,
  DEFAULT_PREVIEW_DIRECTIONAL_INTENSITY,
  DEFAULT_PREVIEW_DIRECTIONAL_X,
  DEFAULT_PREVIEW_DIRECTIONAL_Y,
  DEFAULT_PREVIEW_DIRECTIONAL_Z,
} from "@/page/TestEditor/components/ssbh-model-preview/SsbhModelPreviewContext";
import {
  getSsbhAdaptiveDpr,
  getSsbhAdaptivePerformanceOptions,
  getSsbhCanvasPerformanceProfile,
  measureDrawComplexity,
} from "@/page/TestEditor/components/ssbh-model-preview/ssbhCanvasPerformance";

const DEG2RAD = Math.PI / 180;

/** Blender-style finite grid plane (aligned with TestEditor ssbh-model-preview). */
const GRID_PLANE_WIDTH = 200;
const GRID_PLANE_HEIGHT = 200;
const GRID_FADE_DISTANCE = 5e6;
const BLENDER_GRID_CELL_COLOR = "#464646";
const BLENDER_GRID_SECTION_COLOR = "#545454";

function resolveBaseDpr(dprRange: [number, number]): number {
  const deviceDpr =
    typeof window !== "undefined" && Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
  return Math.min(dprRange[1], Math.max(dprRange[0], deviceDpr));
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

function SceneCanvasPerformanceHud({
  drawsForComplexity,
  showStats,
  previewRenderStyle,
}: {
  drawsForComplexity: BuiltMeshDraw[];
  showStats: boolean;
  previewRenderStyle: PreviewRenderStyle;
}) {
  const drawComplexity = useMemo(() => measureDrawComplexity(drawsForComplexity), [drawsForComplexity]);
  const motionPlaying = false;
  const motionScrubbing = false;
  const baseDprRange = useMemo(
    () =>
      getSsbhCanvasPerformanceProfile({
        drawCount: drawComplexity.drawCount,
        triangleCount: drawComplexity.triangleCount,
        motionPlaying,
        motionScrubbing,
        previewRenderStyle,
      }).dpr,
    [drawComplexity.drawCount, drawComplexity.triangleCount, previewRenderStyle],
  );
  const current = useThree((s) => s.performance.current);
  const setDpr = useThree((s) => s.setDpr);
  const resolvedBaseDpr = useMemo(() => resolveBaseDpr(baseDprRange), [baseDprRange]);

  useEffect(() => {
    setDpr(getSsbhAdaptiveDpr(resolvedBaseDpr, current));
  }, [current, resolvedBaseDpr, setDpr]);

  return (
    <>{showStats ? <Stats className="fixed! top-2! right-2! left-auto! z-2147483000" /> : null}</>
  );
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
  onSelectNode: (id: string | null) => void;
  textureDataMap: NutexbTextureDataMap;
  onDrawStatsChange?: (stats: SceneDrawStats) => void;
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
  const onInteract = useCallback(() => {
    regress();
    invalidate();
  }, [regress, invalidate]);
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
      onStart={onInteract}
      onChange={onInteract}
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
      onSelectNode,
      textureDataMap,
      onDrawStatsChange,
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

    const handlePointerMissed = useCallback(() => {
      onSelectNode(null);
    }, [onSelectNode]);

    const placementByObjectNumber = useMemo(() => {
      const map = new Map<number, PlacementRow>();
      for (const entry of placementEntries) {
        if (
          entry.vdkType.toUpperCase() === "OBJECT" &&
          entry.objectNumber !== null
        ) {
          map.set(entry.objectNumber, entry);
        }
      }
      return map;
    }, [placementEntries]);

    const effectEntries = useMemo(
      () =>
        placementEntries.filter(
          (e) => e.vdkType.toUpperCase() === "EFFECT"
        ),
      [placementEntries]
    );

    const previewRenderStyle: PreviewRenderStyle = "standard";
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
    const primaryKeyLightPosition = useMemo<[number, number, number]>(
      () => [DEFAULT_PREVIEW_DIRECTIONAL_X, DEFAULT_PREVIEW_DIRECTIONAL_Y, DEFAULT_PREVIEW_DIRECTIONAL_Z],
      [],
    );
    const fillKeyLightPosition = useMemo<[number, number, number]>(
      () => [
        -DEFAULT_PREVIEW_DIRECTIONAL_X * 0.7,
        DEFAULT_PREVIEW_DIRECTIONAL_Y * 0.45,
        -DEFAULT_PREVIEW_DIRECTIONAL_Z * 0.7,
      ],
      [],
    );

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
          far: 100000000,
        }}
        gl={{
          antialias: canvasPerformanceProfile.antialias,
          alpha: false,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        }}
        performance={adaptivePerformanceOptions}
        dpr={canvasPerformanceProfile.dpr}
        style={{ touchAction: "none", background: DEFAULT_PREVIEW_3D_BACKGROUND }}
        onPointerMissed={handlePointerMissed}
        onCreated={handleCreated}
      >
        <SceneCanvasPerformanceHud
          drawsForComplexity={drawsForComplexity}
          showStats={showStats}
          previewRenderStyle={previewRenderStyle}
        />

        <color attach="background" args={[DEFAULT_PREVIEW_3D_BACKGROUND]} />
        <ambientLight intensity={DEFAULT_PREVIEW_AMBIENT_INTENSITY} />
        <hemisphereLight args={["#dbeafe", "#111827", 0.26]} />
        <directionalLight
          color="#ffffff"
          position={primaryKeyLightPosition}
          intensity={DEFAULT_PREVIEW_DIRECTIONAL_INTENSITY}
        />
        <directionalLight
          color="#ffffff"
          position={fillKeyLightPosition}
          intensity={DEFAULT_PREVIEW_DIRECTIONAL_INTENSITY * 0.28}
        />

        {baseModel && (
          <StageModelGroup
            nodeId="base"
            bundle={baseModel}
            wireframe={wireframe}
            isSelected={selectedNodeId === "base"}
            onClick={onSelectNode}
            textureDataMap={textureDataMap}
          />
        )}

        {subModels.map((sub) => {
          const placement = placementByObjectNumber.get(sub.objectIndex);
          return (
            <StageModelGroup
              key={sub.folderName}
              nodeId={sub.folderName}
              bundle={sub.bundle}
              wireframe={wireframe}
              isSelected={selectedNodeId === sub.folderName}
              onClick={onSelectNode}
              textureDataMap={textureDataMap}
              position={
                placement
                  ? [placement.posX, placement.posY, placement.posZ]
                  : undefined
              }
              rotation={
                placement
                  ? [placement.rotX, placement.rotY, placement.rotZ]
                  : undefined
              }
              scale={
                placement
                  ? [placement.scaleX, placement.scaleY, placement.scaleZ]
                  : undefined
              }
            />
          );
        })}

        {effectEntries.map((eff, i) => (
          <EffectMarker
            key={`effect-${i}`}
            position={[eff.posX, eff.posY, eff.posZ]}
            index={i}
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
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
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
}: {
  drawBinding: DrawBinding;
  textureDataMap: NutexbTextureDataMap;
  wireframe: boolean;
  isSelected: boolean;
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
      result[slot] = createDataTexture(data, slot, binding);
      loaded.push(slot);
    }

    if (loaded.length > 0) {
      console.log(
        `[SceneEdit:Texture] mat="${binding.materialLabel}" shader="${binding.shaderFamily}" applied=[${loaded.join(",")}]`,
      );
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  useEffect(() => {
    return () => {
      for (const tex of Object.values(textures)) {
        tex.dispose();
      }
    };
  }, [textures]);

  const shaderFamily = binding.shaderFamily;
  const hasMap = !!textures.map;
  const hasRough = !!textures.roughnessMap || typeof binding.uniforms.roughnessScalar === "number";
  const hasMetal = !!textures.metalnessMap || typeof binding.uniforms.metalnessScalar === "number";
  const hasEmit = !!textures.emissiveMap;
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

  const emissiveIntensity = shaderFamily === "vsngCharaSparkle"
    ? 1.8
    : hasEmit
      ? 1
      : 0;

  const transparent = binding.renderHints.isTransparent ?? hasMap;
  const envIntensity = shaderFamily === "vsngCharaSparkle"
    ? 1.55
    : hasCube
      ? 1.15
      : 0;

  const effectiveMetalnessMap = hasCube ? textures.metalnessMap : undefined;
  const effectiveMetalnessValue = hasCube ? metalnessValue : Math.min(metalnessValue, 0.2);

  return (
    <mesh geometry={draw.geometry}>
      <meshStandardMaterial
        color={isSelected ? "#88aaff" : hasAnyTexture ? "#ffffff" : "#cccccc"}
        wireframe={wireframe}
        side={THREE.DoubleSide}
        map={textures.map ?? null}
        normalMap={textures.normalMap ?? null}
        roughnessMap={textures.roughnessMap ?? null}
        metalnessMap={effectiveMetalnessMap ?? null}
        emissiveMap={textures.emissiveMap ?? null}
        emissive={hasEmit ? new THREE.Color(0xffffff) : new THREE.Color(0)}
        emissiveIntensity={emissiveIntensity}
        aoMap={textures.aoMap ?? null}
        aoMapIntensity={hasAo ? 0.35 : 0}
        envMap={textures.cubeMap ?? null}
        envMapIntensity={envIntensity}
        alphaTest={hasMap ? 0.001 : 0}
        transparent={transparent}
        roughness={roughnessValue}
        metalness={effectiveMetalnessValue}
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
  position,
  rotation,
  scale,
  textureDataMap,
}: {
  nodeId: string;
  bundle: SsbhModelPreviewBundle;
  wireframe: boolean;
  isSelected: boolean;
  onClick: (id: string) => void;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  textureDataMap: NutexbTextureDataMap;
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
      onClick(nodeId);
    },
    [nodeId, onClick]
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

  return (
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
        />
      ))}
    </group>
  );
});

function EffectMarker({
  position,
  index,
}: {
  position: [number, number, number];
  index: number;
}) {
  return (
    <group position={position}>
      <Sphere args={[2, 8, 8]}>
        <meshStandardMaterial
          color="#ff6644"
          emissive="#ff4422"
          emissiveIntensity={0.5}
        />
      </Sphere>
      <Html center distanceFactor={200} style={{ pointerEvents: "none" }}>
        <div className="text-[9px] text-orange-400 font-mono whitespace-nowrap bg-black/60 px-1 rounded">
          FX#{index}
        </div>
      </Html>
    </group>
  );
}
