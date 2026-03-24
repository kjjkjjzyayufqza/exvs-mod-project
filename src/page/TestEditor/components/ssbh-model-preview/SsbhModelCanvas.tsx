import { Canvas, useThree } from "@react-three/fiber";
import {
  Grid,
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  Stats,
  useTexture,
} from "@react-three/drei";
import { Suspense, useLayoutEffect, useState, useEffect, useRef, type RefObject } from "react";
import { Color, DoubleSide, Group, LineBasicMaterial, PerspectiveCamera, SRGBColorSpace } from "three";
import type { BufferGeometry } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { fitCameraToObject } from "./cameraFit";
import type { BuiltMeshDraw } from "./types";

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
  textureDataUrlByDrawKey: ReadonlyMap<string, string | null>;
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
  /** Increment to request a one-shot camera fit (user Reset view or new model). */
  fitRequestId: number;
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

type DrawMeshProps = {
  draw: BuiltMeshDraw;
  visible: boolean;
  wireframe: boolean;
};

function DrawMeshUntextured({ draw, visible, wireframe }: DrawMeshProps) {
  if (!visible) return null;
  return (
    <mesh geometry={draw.geometry}>
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

type DrawMeshTexturedProps = DrawMeshProps & { dataUrl: string };

function DrawMeshTextured({ draw, dataUrl, visible, wireframe }: DrawMeshTexturedProps) {
  const map = useTexture(dataUrl);
  useLayoutEffect(() => {
    map.colorSpace = SRGBColorSpace;
    map.needsUpdate = true;
  }, [map]);

  if (!visible) return null;

  return (
    <mesh geometry={draw.geometry}>
      <meshStandardMaterial
        map={map}
        roughness={0.62}
        metalness={0.18}
        side={DoubleSide}
        wireframe={wireframe}
      />
    </mesh>
  );
}

function DrawMeshes({
  draws,
  textureDataUrlByDrawKey,
  visibleKeys,
  wireframe,
}: Pick<SsbhModelCanvasProps, "draws" | "textureDataUrlByDrawKey" | "visibleKeys" | "wireframe">) {
  return (
    <>
      {draws.map((d) => {
        const url = textureDataUrlByDrawKey.get(d.key) ?? null;
        return (
          <Suspense key={d.key} fallback={null}>
            {url ? (
              <DrawMeshTextured
                draw={d}
                dataUrl={url}
                visible={visibleKeys.has(d.key)}
                wireframe={wireframe}
              />
            ) : (
              <DrawMeshUntextured draw={d} visible={visibleKeys.has(d.key)} wireframe={wireframe} />
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
  textureDataUrlByDrawKey,
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
  fitRequestId,
}: SsbhModelCanvasProps) {
  const modelRootRef = useRef<Group>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  return (
    <>
      <color attach="background" args={[background]} />
      <ambientLight intensity={ambientIntensity} />
      <directionalLight position={[8, 14, 6]} intensity={directionalIntensity} />

      <group ref={modelRootRef}>
        <DrawMeshes
          draws={draws}
          textureDataUrlByDrawKey={textureDataUrlByDrawKey}
          visibleKeys={visibleKeys}
          wireframe={wireframe}
        />
        {showSkeleton && skeletonGeometry ? <SkeletonLines geometry={skeletonGeometry} /> : null}
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
  const { background, ...sceneProps } = props;

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
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        camera={{ position: [2.4, 1.6, 2.8], fov: 50, near: 0.02, far: 5e6 }}
      >
        <Scene {...sceneProps} background={background} />
      </Canvas>
    </div>
  );
}
