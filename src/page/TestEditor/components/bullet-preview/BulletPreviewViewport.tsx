import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, PerspectiveCamera } from "@react-three/drei";
import { Suspense } from "react";
import { BulletPreviewScene } from "./BulletPreviewScene";
import { BulletPreviewControls } from "./BulletPreviewControls";
import { BulletPreviewTimelineControls } from "./BulletPreviewTimelineControls";
import { useBulletPreviewStore } from "./bulletPreviewStore";

function SimulationTicker() {
  useFrame((_, delta) => {
    useBulletPreviewStore.getState().tick(delta);
  });
  return null;
}

export function BulletPreviewViewport() {
  const trajectory = useBulletPreviewStore((s) => s.trajectory);
  const scenario = useBulletPreviewStore((s) => s.scenario);

  const orbitTargetZ = trajectory
    ? Math.min(Math.max(scenario.targetDistance * 0.45, 12), 140)
    : 25;
  const orbitTargetX = trajectory ? scenario.targetOffsetX * 0.45 : 0;
  const orbitTargetY = trajectory ? 1.8 + scenario.targetHeight * 0.35 : 1.8;

  return (
    <div className="grid h-full min-h-0 w-full grid-cols-[360px_minmax(0,1fr)]">
      <BulletPreviewControls />
      <div className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <Canvas gl={{ antialias: true, alpha: false }} style={{ background: "#0f111a" }}>
            <PerspectiveCamera makeDefault position={[14, 11, -18]} fov={48} />
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.1}
              target={[orbitTargetX, orbitTargetY, orbitTargetZ]}
              maxPolarAngle={Math.PI * 0.495}
              minDistance={6}
              maxDistance={280}
            />

            <ambientLight intensity={0.38} />
            <directionalLight position={[12, 22, -8]} intensity={0.85} castShadow={false} />
            <directionalLight position={[-8, 14, 18]} intensity={0.28} />

            <Grid
              args={[220, 220]}
              position={[0, 0, 0]}
              cellSize={5}
              cellThickness={0.35}
              cellColor="#334155"
              sectionSize={25}
              sectionThickness={0.85}
              sectionColor="#475569"
              fadeDistance={165}
              fadeStrength={1}
              followCamera={false}
              infiniteGrid
            />

            <Suspense fallback={null}>
              <SimulationTicker />
              <BulletPreviewScene />
            </Suspense>
          </Canvas>
        </div>
        <BulletPreviewTimelineControls />
      </div>
    </div>
  );
}
