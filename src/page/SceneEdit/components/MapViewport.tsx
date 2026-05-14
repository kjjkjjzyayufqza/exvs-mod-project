import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  GizmoHelper,
  GizmoViewport,
  Grid,
  Sphere,
  Html,
} from "@react-three/drei";
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
import type { NutexbBlobUrlMap } from "../hooks/useSceneTextureLoader";
import type { PlacementRow } from "./PlacementPanel";

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
  fogColor: THREE.Color | null;
  fogNear: number;
  fogFar: number;
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

  const fogWidth = m.get("mapfog_width") ?? 0;
  const fogHeight = m.get("mapfog_height") ?? 0;
  const hasFog = fogWidth > 0 && fogHeight > 0;
  const fogAttenEnd = m.get("mapfog_atten_end") ?? 0.2;
  const fogAlphaBoost = m.get("fog_alpha_boost") ?? 0.5;
  const fogDensity = fogAlphaBoost * fogAttenEnd;
  const fogExtent = Math.max(fogWidth, fogHeight);
  const fogColor = hasFog && fogDensity > 0.001
    ? new THREE.Color(dlR * 0.15, dlG * 0.15, dlB * 0.25)
    : null;
  const fogNear = hasFog ? fogExtent * (1 - fogAttenEnd) : 0;
  const fogFar = hasFog ? fogExtent : 0;

  return {
    directionalPosition,
    directionalColor,
    directionalIntensity,
    ambientColor,
    ambientIntensity,
    fogColor,
    fogNear,
    fogFar,
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
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  blobUrlMap: NutexbBlobUrlMap;
}

export interface MapViewportHandle {
  resetCamera: () => void;
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
      selectedNodeId,
      onSelectNode,
      blobUrlMap,
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

    return (
      <Canvas
        camera={{
          position: [300, 300, 300],
          fov: 30,
          near: 0.1,
          far: 100000000,
        }}
        style={{ background: "#1a1a2e" }}
        onPointerMissed={handlePointerMissed}
      >
        {lighting.fogColor && (
          <fog attach="fog" args={[lighting.fogColor, lighting.fogNear, lighting.fogFar]} />
        )}
        <ambientLight color={lighting.ambientColor} intensity={lighting.ambientIntensity} />
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
            blobUrlMap={blobUrlMap}
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
              blobUrlMap={blobUrlMap}
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
            cellColor="#404060"
            sectionSize={100}
            sectionThickness={1}
            sectionColor="#606080"
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
          enableDamping={false}
        />

        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
          <GizmoViewport labelColor="white" axisHeadScale={0.8} />
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

function lookupBlobUrl(blobUrlMap: NutexbBlobUrlMap, path: string | null): string | null {
  if (!path) return null;
  return blobUrlMap.get(path) ?? blobUrlMap.get(path.toLowerCase()) ?? null;
}

interface DrawBinding {
  draw: BuiltMeshDraw;
  binding: ResolvedMaterialBinding;
}

const TexturedMesh = memo(function TexturedMesh({
  drawBinding,
  blobUrlMap,
  wireframe,
  isSelected,
}: {
  drawBinding: DrawBinding;
  blobUrlMap: NutexbBlobUrlMap;
  wireframe: boolean;
  isSelected: boolean;
}) {
  const { gl } = useThree();
  const { draw, binding } = drawBinding;

  const mapUrl = lookupBlobUrl(blobUrlMap, pathForSlot(binding, "map"));
  const normalUrl = lookupBlobUrl(blobUrlMap, pathForSlot(binding, "normalMap"));
  const roughnessUrl = lookupBlobUrl(blobUrlMap, pathForSlot(binding, "roughnessMap"));
  const metalnessUrl = lookupBlobUrl(blobUrlMap, pathForSlot(binding, "metalnessMap"));
  const emissiveUrl = lookupBlobUrl(blobUrlMap, pathForSlot(binding, "emissiveMap"));
  const aoUrl = lookupBlobUrl(blobUrlMap, pathForSlot(binding, "aoMap"));
  const cubeUrl = lookupBlobUrl(blobUrlMap, pathForSlot(binding, "cubeMap"));

  const urlKey = `${mapUrl}\0${normalUrl}\0${roughnessUrl}\0${metalnessUrl}\0${emissiveUrl}\0${aoUrl}\0${cubeUrl}`;

  const textures = useMemo(() => {
    const urls: [PbrSlotKind, string | null][] = [
      ["map", mapUrl], ["normalMap", normalUrl], ["roughnessMap", roughnessUrl],
      ["metalnessMap", metalnessUrl], ["emissiveMap", emissiveUrl],
      ["aoMap", aoUrl], ["cubeMap", cubeUrl],
    ];
    const result: Partial<Record<PbrSlotKind, THREE.Texture>> = {};
    const loader = new THREE.TextureLoader();
    const loaded: string[] = [];

    for (const [key, url] of urls) {
      if (!url) continue;
      const tex = loader.load(url, (t) => {
        t.colorSpace = SRGB_SLOTS.has(key) ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
        t.flipY = false;
        if (key === "cubeMap") {
          t.mapping = THREE.EquirectangularReflectionMapping;
        } else {
          const sampling = samplingForSlot(binding, key);
          t.wrapS = toThreeWrapping(sampling?.wrapS ?? "ClampToEdge");
          t.wrapT = toThreeWrapping(sampling?.wrapT ?? "ClampToEdge");
          t.center.set(0, 0);
          t.repeat.set(sampling?.uvTransform?.scale_u ?? 1, sampling?.uvTransform?.scale_v ?? 1);
          t.offset.set(sampling?.uvTransform?.translate_u ?? 0, sampling?.uvTransform?.translate_v ?? 0);
          t.rotation = sampling?.uvTransform?.rotation ?? 0;
        }
        t.needsUpdate = true;
        gl.initTexture(t);
      });
      result[key] = tex;
      loaded.push(key);
    }

    if (loaded.length > 0) {
      console.log(
        `[SceneEdit:Texture] mat="${binding.materialLabel}" shader="${binding.shaderFamily}" applied=[${loaded.join(",")}]`,
      );
    }

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey, gl]);

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
  blobUrlMap,
}: {
  nodeId: string;
  bundle: SsbhModelPreviewBundle;
  wireframe: boolean;
  isSelected: boolean;
  onClick: (id: string) => void;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  blobUrlMap: NutexbBlobUrlMap;
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
          blobUrlMap={blobUrlMap}
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
