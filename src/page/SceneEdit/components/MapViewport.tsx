import { Canvas } from "@react-three/fiber";
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
import { buildDrawListFromBundle } from "@/page/TestEditor/components/ssbh-model-preview/meshFromSsbh";
import type { PlacementRow } from "./PlacementPanel";

export interface MapViewportProps {
  baseModel: SsbhModelPreviewBundle | null;
  subModels: Array<{
    folderName: string;
    objectIndex: number;
    bundle: SsbhModelPreviewBundle;
  }>;
  placementEntries: PlacementRow[];
  showGrid: boolean;
  showAxes: boolean;
  wireframe: boolean;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
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
      showGrid,
      showAxes,
      wireframe,
      selectedNodeId,
      onSelectNode,
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
        <ambientLight intensity={0.6} />
        <directionalLight position={[400, 400, 350]} intensity={1.0} />
        <directionalLight position={[-200, 300, -200]} intensity={0.3} />

        {baseModel && (
          <StageModelGroup
            nodeId="base"
            bundle={baseModel}
            wireframe={wireframe}
            isSelected={selectedNodeId === "base"}
            onClick={onSelectNode}
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

const StageModelGroup = memo(function StageModelGroup({
  nodeId,
  bundle,
  wireframe,
  isSelected,
  onClick,
  position,
  rotation,
  scale,
}: {
  nodeId: string;
  bundle: SsbhModelPreviewBundle;
  wireframe: boolean;
  isSelected: boolean;
  onClick: (id: string) => void;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
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
        ? new THREE.Euler(rotation[0], rotation[1], rotation[2])
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
      {draws.map((draw) => (
        <mesh key={draw.key} geometry={draw.geometry}>
          <meshStandardMaterial
            color={isSelected ? "#88aaff" : "#cccccc"}
            wireframe={wireframe}
            side={THREE.DoubleSide}
          />
        </mesh>
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
