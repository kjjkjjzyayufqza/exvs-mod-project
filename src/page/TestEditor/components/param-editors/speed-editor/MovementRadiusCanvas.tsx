import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Ring, Text } from "@react-three/drei";
import { Suspense } from "react";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

interface MovementRadiusCanvasProps {
  entry: TypedParamEntry | null;
}

function RadiusRing({
  radius,
  color,
  label,
}: {
  radius: number;
  color: string;
  label: string;
}) {
  if (radius <= 0) return null;
  const scale = radius / 10;

  return (
    <group>
      <Ring
        args={[scale - 0.05, scale + 0.05, 64]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshBasicMaterial color={color} transparent opacity={0.8} />
      </Ring>
      <Text
        position={[scale + 0.3, 0.1, 0]}
        fontSize={0.25}
        color={color}
        anchorX="left"
      >
        {label} ({radius.toFixed(1)})
      </Text>
    </group>
  );
}

function UnitDot() {
  return (
    <mesh position={[0, 0.1, 0]}>
      <sphereGeometry args={[0.15, 16, 16]} />
      <meshStandardMaterial
        color="#60a5fa"
        emissive="#60a5fa"
        emissiveIntensity={0.5}
      />
    </mesh>
  );
}

function num(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

export function MovementRadiusCanvas({ entry }: MovementRadiusCanvasProps) {
  const walkRadius = entry ? num(entry, "walkSpeedBase") * 60 : 0;
  const dashRadius = entry ? num(entry, "boostDashMaxSpeed") * 60 : 0;
  const stepRadius = entry ? num(entry, "stepDistance") : 0;

  return (
    <Canvas
      gl={{ antialias: true, alpha: false }}
      style={{ background: "#0a0f1a" }}
    >
      <PerspectiveCamera makeDefault position={[0, 14, 0.01]} fov={50} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        maxPolarAngle={Math.PI * 0.1}
        minPolarAngle={0}
        minDistance={5}
        maxDistance={40}
      />
      <ambientLight intensity={0.6} />
      <gridHelper args={[20, 20, "#1e293b", "#1e293b"]} />
      <Suspense fallback={null}>
        <UnitDot />
        <RadiusRing radius={walkRadius} color="#22c55e" label="Walk" />
        <RadiusRing radius={dashRadius} color="#f59e0b" label="Dash" />
        <RadiusRing radius={stepRadius} color="#8b5cf6" label="Step" />
      </Suspense>
    </Canvas>
  );
}
