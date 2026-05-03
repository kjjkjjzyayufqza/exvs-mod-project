import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, PerspectiveCamera } from "@react-three/drei";
import { Suspense } from "react";
import { BulletPreviewScene } from "./BulletPreviewScene";
import { BulletPreviewControls } from "./BulletPreviewControls";
import { useBulletPreviewStore } from "./bulletPreviewStore";

export function BulletPreviewViewport() {
  const trajectory = useBulletPreviewStore((s) => s.trajectory);

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="min-h-0 flex-1">
        <Canvas
          gl={{ antialias: true, alpha: false }}
          style={{ background: "#141422" }}
        >
          <PerspectiveCamera makeDefault position={[15, 12, -20]} fov={50} />
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.1}
            target={[0, 0, trajectory ? trajectory.totalFrames * 0.15 : 25]}
          />

          <ambientLight intensity={0.4} />
          <directionalLight position={[10, 20, -10]} intensity={0.8} />
          <directionalLight position={[-5, 10, 15]} intensity={0.3} />

          <Grid
            args={[200, 200]}
            position={[0, 0, 0]}
            cellSize={5}
            cellThickness={0.4}
            cellColor="#334155"
            sectionSize={25}
            sectionThickness={1}
            sectionColor="#475569"
            fadeDistance={150}
            fadeStrength={1}
            followCamera={false}
            infiniteGrid
          />

          <Suspense fallback={null}>
            <BulletPreviewScene />
          </Suspense>
        </Canvas>
      </div>
      <BulletPreviewControls />
    </div>
  );
}
