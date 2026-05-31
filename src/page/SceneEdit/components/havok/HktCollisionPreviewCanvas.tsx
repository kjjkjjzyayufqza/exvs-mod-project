import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export interface CollisionPreviewGeometry {
  positions: number[];
  indices: number[];
}

/** Collision visualization accent — matches the in-scene Havok overlay green. */
const COLLISION_FILL = "#34d399";
const COLLISION_WIRE = "#6ee7b7";
const PREVIEW_BACKGROUND = "#0b0f14";

function CollisionMeshObject({ geometry }: { geometry: THREE.BufferGeometry }) {
  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={COLLISION_FILL}
          transparent
          opacity={0.22}
          metalness={0.0}
          roughness={0.85}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={COLLISION_WIRE} wireframe transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function FitView({
  boundingSphere,
  controlsRef,
}: {
  boundingSphere: THREE.Sphere | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (!boundingSphere || !(camera instanceof THREE.PerspectiveCamera)) return;
    const radius = Math.max(boundingSphere.radius, 1e-3);
    const center = boundingSphere.center;
    const fov = (camera.fov * Math.PI) / 180;
    const distance = (radius / Math.sin(fov / 2)) * 1.4;
    camera.position.set(
      center.x + distance * 0.75,
      center.y + distance * 0.55,
      center.z + distance * 0.75,
    );
    camera.near = Math.max(0.01, radius / 100);
    camera.far = radius * 200 + 1000;
    camera.updateProjectionMatrix();
    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(center);
      controls.update();
    }
    invalidate();
  }, [boundingSphere, camera, controlsRef, invalidate]);

  return null;
}

/**
 * Live collision-mesh preview viewport for the New-Model HKT window. Renders the
 * simplified collision geometry as a translucent emerald shell plus wireframe,
 * matching the in-scene Havok overlay language, and auto-fits the camera.
 */
export function HktCollisionPreviewCanvas({
  geometry,
}: {
  geometry: CollisionPreviewGeometry | null;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const builtGeometry = useMemo(() => {
    if (!geometry || geometry.positions.length === 0 || geometry.indices.length === 0) {
      return null;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(geometry.positions), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(geometry.indices), 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [geometry]);

  useEffect(() => {
    return () => {
      builtGeometry?.dispose();
    };
  }, [builtGeometry]);

  return (
    <Canvas
      className="h-full w-full touch-none"
      frameloop="demand"
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", logarithmicDepthBuffer: true }}
      dpr={[1, 2]}
      camera={{ position: [4, 3, 4], fov: 45, near: 0.05, far: 5000 }}
      style={{ background: PREVIEW_BACKGROUND }}
    >
      <color attach="background" args={[PREVIEW_BACKGROUND]} />
      <ambientLight intensity={0.65} />
      <hemisphereLight args={["#cbd5e1", "#0b0f14", 0.4]} />
      <directionalLight position={[6, 10, 6]} intensity={0.8} />
      <directionalLight position={[-5, 4, -5]} intensity={0.3} />

      {builtGeometry ? <CollisionMeshObject geometry={builtGeometry} /> : null}

      <Grid
        args={[40, 40]}
        infiniteGrid={false}
        cellSize={1}
        sectionSize={5}
        fadeDistance={400}
        fadeStrength={1}
        sectionColor="#475569"
        cellColor="#1e293b"
        sectionThickness={1}
        cellThickness={0.6}
      />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={0.1}
        maxDistance={4000}
      />
      <FitView boundingSphere={builtGeometry?.boundingSphere ?? null} controlsRef={controlsRef} />
    </Canvas>
  );
}
