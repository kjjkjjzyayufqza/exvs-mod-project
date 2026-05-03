import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

interface ProjectilePreview3DProps {
  entry: TypedParamEntry | null;
}

function num(entry: TypedParamEntry, key: string, fallback = 0): number {
  const v = entry[key];
  return typeof v === "number" ? v : fallback;
}

function ProjectileBody({ entry }: { entry: TypedParamEntry }) {
  const scale = num(entry, "scale", 1);
  const renderMode = num(entry, "renderMode");
  const trailLength = num(entry, "trailLength");

  const color = renderMode === 0 ? "#60a5fa" : "#f59e0b";

  return (
    <group>
      <mesh position={[0, 0.5, 0]} scale={Math.max(scale, 0.1)}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          color={color}
          roughness={0.3}
          metalness={0.6}
        />
      </mesh>
      {trailLength > 0 && (
        <mesh position={[-trailLength * 0.05, 0.5, 0]}>
          <boxGeometry args={[trailLength * 0.1, 0.05, 0.05]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.4}
          />
        </mesh>
      )}
    </group>
  );
}

function Scene({ entry }: { entry: TypedParamEntry }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 3]} intensity={1} />
      <ProjectileBody entry={entry} />
      <Grid
        args={[10, 10]}
        cellSize={0.5}
        cellColor="#444"
        sectionSize={2}
        sectionColor="#666"
        fadeDistance={12}
        fadeStrength={1}
        infiniteGrid
      />
      <OrbitControls makeDefault enableDamping dampingFactor={0.1} />
    </>
  );
}

export function ProjectilePreview3D({ entry }: ProjectilePreview3DProps) {
  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No entry selected for preview
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
        <Scene entry={entry} />
      </Canvas>
    </div>
  );
}
