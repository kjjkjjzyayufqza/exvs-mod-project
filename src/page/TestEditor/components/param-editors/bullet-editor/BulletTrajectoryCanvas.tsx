import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, PerspectiveCamera, Line } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import { useBulletEditorStore } from "./BulletEditorStore";
import type { TrajectoryResult } from "../../bullet-preview/TrajectorySimulator";
import * as THREE from "three";

function TrajectoryLine({
  trajectory,
  currentFrame,
}: {
  trajectory: TrajectoryResult;
  currentFrame: number;
}) {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const frameCount = Math.min(
      Math.floor(currentFrame),
      trajectory.totalFrames,
    );
    for (let i = 0; i <= frameCount; i++) {
      pts.push(
        new THREE.Vector3(
          trajectory.positions[i * 3],
          trajectory.positions[i * 3 + 1],
          trajectory.positions[i * 3 + 2],
        ),
      );
    }
    return pts;
  }, [trajectory, currentFrame]);

  if (points.length < 2) return null;

  return <Line points={points} color="#60a5fa" lineWidth={2} />;
}

function PlayerUnit() {
  return (
    <group position={[0, 1.0, 0]}>
      <mesh>
        <capsuleGeometry args={[0.4, 1.2, 8, 16]} />
        <meshStandardMaterial color="#3b82f6" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function EnemyUnit({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.0, 0]}>
        <capsuleGeometry args={[0.4, 1.2, 8, 16]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function HitboxMarker({
  trajectory,
  currentFrame,
}: {
  trajectory: TrajectoryResult;
  currentFrame: number;
}) {
  const frame = Math.min(
    Math.floor(currentFrame),
    trajectory.totalFrames - 1,
  );
  const x = trajectory.positions[frame * 3];
  const y = trajectory.positions[frame * 3 + 1];
  const z = trajectory.positions[frame * 3 + 2];
  const [w, h, d] = trajectory.hitboxSize;

  if (w === 0 && h === 0 && d === 0) return null;

  return (
    <mesh position={[x, y, z]}>
      <boxGeometry args={[w || 0.5, h || 0.5, d || 0.5]} />
      <meshStandardMaterial
        color="#fbbf24"
        transparent
        opacity={0.3}
        wireframe
      />
    </mesh>
  );
}

function SimTicker() {
  useFrame((_, delta) => {
    useBulletEditorStore.getState().tick(delta);
  });
  return null;
}

export function BulletTrajectoryCanvas() {
  const trajectory = useBulletEditorStore((s) => s.trajectory);
  const shootingLoopResult = useBulletEditorStore((s) => s.shootingLoopResult);
  const scenario = useBulletEditorStore((s) => s.scenario);
  const playbackFrame = useBulletEditorStore((s) => s.playbackFrame);
  const firstShot = shootingLoopResult?.shots[0];
  const trajectoryFrame = firstShot
    ? Math.max(0, playbackFrame - firstShot.spawnFrame)
    : playbackFrame;
  const shouldShowTrajectory = Boolean(
    trajectory && (!firstShot || playbackFrame >= firstShot.spawnFrame),
  );

  const targetPos: [number, number, number] = [
    scenario.targetOffsetX ?? 0,
    scenario.targetHeight ?? 0,
    scenario.targetDistance ?? 30,
  ];

  return (
    <Canvas
      gl={{ antialias: true, alpha: false }}
      style={{ background: "#0f111a" }}
    >
      <PerspectiveCamera makeDefault position={[12, 9, -15]} fov={48} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        target={[0, 1, targetPos[2] * 0.4]}
        maxPolarAngle={Math.PI * 0.495}
        minDistance={4}
        maxDistance={200}
      />
      <ambientLight intensity={0.38} />
      <directionalLight position={[12, 22, -8]} intensity={0.85} />
      <directionalLight position={[-8, 14, 18]} intensity={0.28} />
      <Grid
        args={[160, 160]}
        cellSize={5}
        cellThickness={0.35}
        cellColor="#334155"
        sectionSize={25}
        sectionThickness={0.85}
        sectionColor="#475569"
        fadeDistance={120}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
      />
      <Suspense fallback={null}>
        <SimTicker />
        <PlayerUnit />
        <EnemyUnit position={targetPos} />
        {trajectory && shouldShowTrajectory && (
          <>
            <TrajectoryLine
              trajectory={trajectory}
              currentFrame={trajectoryFrame}
            />
            <HitboxMarker
              trajectory={trajectory}
              currentFrame={trajectoryFrame}
            />
          </>
        )}
      </Suspense>
    </Canvas>
  );
}
