import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  GizmoHelper,
  GizmoViewport,
  Grid,
  Sphere,
  Html,
  AdaptiveDpr,
} from "@react-three/drei";
import { Perf } from "r3f-perf";
import {
  useRef,
  useCallback,
  useMemo,
  useEffect,
  memo,
  forwardRef,
  useImperativeHandle,
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

export interface GraphicParam {
  key: string;
  value: string;
}

interface StageLightingConfig {
  directionalPosition: [number, number, number];
  directionalColor: THREE.Color;
  directionalIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
}

const DEG2RAD = Math.PI / 180;

function parseGraphicParamConfig(params: GraphicParam[]): StageLightingConfig {
  const m = new Map<string, number>();
  for (const p of params) {
    const v = parseFloat(p.value);
    if (!isNaN(v)) m.set(p.key, v);
  }

  const rotX = (m.get("directional_lighting_rot_x") ?? -40) * DEG2RAD;
  const rotY = (m.get("directional_lighting_rot_y") ?? 142) * DEG2RAD;
  const rotZ = (m.get("directional_lighting_rot_z") ?? 0) * DEG2RAD;

  const euler = new THREE.Euler(rotX, rotY, rotZ, "YXZ");
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(euler).normalize();
  const distance = 500;
  const directionalPosition: [number, number, number] = [
    -dir.x * distance,
    -dir.y * distance,
    -dir.z * distance,
  ];

  const dlR = m.get("directional_lighting_color_r") ?? 1;
  const dlG = m.get("directional_lighting_color_g") ?? 1;
  const dlB = m.get("directional_lighting_color_b") ?? 1;
  const directionalColor = new THREE.Color(dlR, dlG, dlB);

  const rawIntensity = m.get("directional_lighting_intensity") ?? 5.5;
  const directionalIntensity = rawIntensity / 5;

  const egR = m.get("effect_ground_color_r") ?? 1;
  const egG = m.get("effect_ground_color_g") ?? 0.9;
  const egB = m.get("effect_ground_color_b") ?? 0.8;
  const ambientColor = new THREE.Color(egR, egG, egB);
  const ambientIntensity = 0.35;

  return {
    directionalPosition,
    directionalColor,
    directionalIntensity,
    ambientColor,
    ambientIntensity,
  };
}

export interface MapViewportProps {
  baseModel: SsbhModelPreviewBundle | null;
  subModels: Array<{
    folderName: string;
    objectIndex: number;
    bundle: SsbhModelPreviewBundle;
  }>;
  placementEntries: PlacementRow[];
  graphicParams: GraphicParam[];
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

function ScenePerfMonitor({ showStats }: { showStats: boolean }) {
  if (!showStats) return null;
  return <Perf position="top-right" minimal showGraph={false} />;
}

function AdaptivePerformance() {
  const regress = useThree((s) => s.performance.regress);
  const invalidate = useThree((s) => s.invalidate);

  const handleInteraction = useCallback(() => {
    regress();
    invalidate();
  }, [regress, invalidate]);

  useEffect(() => {
    const handler = () => handleInteraction();
    window.addEventListener("pointerdown", handler, { passive: true });
    return () => window.removeEventListener("pointerdown", handler);
  }, [handleInteraction]);

  return <AdaptiveDpr pixelated />;
}

export const MapViewport = forwardRef<MapViewportHandle, MapViewportProps>(
  function MapViewport(
    {
      baseModel,
      subModels,
      placementEntries,
      graphicParams,
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

    const lighting = useMemo(
      () => parseGraphicParamConfig(graphicParams),
      [graphicParams]
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
        camera={{
          position: [300, 300, 300],
          fov: 30,
          near: 0.1,
          far: 100000000,
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        }}
        performance={{ min: 0.5, max: 1, debounce: 500 }}
        dpr={[1, 2]}
        style={{ background: "#12121a" }}
        onPointerMissed={handlePointerMissed}
        onCreated={handleCreated}
      >
        <AdaptivePerformance />
        <ScenePerfMonitor showStats={showStats} />

        <ambientLight color={lighting.ambientColor} intensity={lighting.ambientIntensity} />
        <hemisphereLight args={["#c8d8f0", "#0a0a14", 0.2]} />
        <directionalLight
          position={lighting.directionalPosition}
          color={lighting.directionalColor}
          intensity={lighting.directionalIntensity}
        />
        <directionalLight position={[-200, 300, -200]} intensity={0.15} />

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
            args={[1000, 1000]}
            cellSize={10}
            cellThickness={0.5}
            cellColor="#353548"
            sectionSize={100}
            sectionThickness={1}
            sectionColor="#4a4a60"
            fadeDistance={2000}
            fadeStrength={1}
            followCamera={false}
            infiniteGrid
          />
        )}

        {showAxes && <axesHelper args={[200]} />}

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          zoomSpeed={0.85}
          rotateSpeed={0.65}
          panSpeed={0.65}
        />

        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport axisColors={["#f87171", "#4ade80", "#60a5fa"]} labelColor="white" axisHeadScale={0.8} />
        </GizmoHelper>
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
