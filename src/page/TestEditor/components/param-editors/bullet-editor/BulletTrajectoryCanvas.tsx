import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, PerspectiveCamera, Html, Line } from "@react-three/drei";
import { Suspense } from "react";
import { useBulletEditorStore } from "./BulletEditorStore";
import type { TrajectoryResult } from "../../bullet-preview/TrajectorySimulator";
import {
  computeScenarioTargetPosition,
  type BulletPreviewScenario,
} from "../../bullet-preview/bulletPreviewTypes";
import * as THREE from "three";

function resolveTargetPosition(
  trajectory: TrajectoryResult | null,
  scenario: BulletPreviewScenario,
  playbackFrame: number,
): [number, number, number] {
  if (!trajectory || trajectory.totalFrames <= 0 || !trajectory.targetPositions || trajectory.targetPositions.length < 3) {
    return computeScenarioTargetPosition(scenario, playbackFrame);
  }
  const idx = Math.min(Math.floor(playbackFrame), trajectory.totalFrames - 1);
  return [
    trajectory.targetPositions[idx * 3] ?? 0,
    trajectory.targetPositions[idx * 3 + 1] ?? 0,
    trajectory.targetPositions[idx * 3 + 2] ?? 0,
  ];
}

function PlayerUnit() {
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[1.8, 2.4, 1.0]} />
        <meshStandardMaterial color="#3366cc" metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0, 3.8, 0]}>
        <boxGeometry args={[0.9, 0.8, 0.8]} />
        <meshStandardMaterial color="#3366cc" metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0, 4.3, 0]}>
        <coneGeometry args={[0.15, 0.7, 4]} />
        <meshStandardMaterial color="#ffcc00" emissive="#ffaa00" emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[-1.4, 2.2, 0]}>
        <boxGeometry args={[0.6, 2.0, 0.7]} />
        <meshStandardMaterial color="#2255aa" metalness={0.25} roughness={0.55} />
      </mesh>
      <mesh position={[1.4, 2.2, 0]}>
        <boxGeometry args={[0.6, 2.0, 0.7]} />
        <meshStandardMaterial color="#2255aa" metalness={0.25} roughness={0.55} />
      </mesh>
      <mesh position={[-0.5, 0.0, 0]}>
        <boxGeometry args={[0.7, 2.0, 0.8]} />
        <meshStandardMaterial color="#2244aa" metalness={0.2} roughness={0.6} />
      </mesh>
      <mesh position={[0.5, 0.0, 0]}>
        <boxGeometry args={[0.7, 2.0, 0.8]} />
        <meshStandardMaterial color="#2244aa" metalness={0.2} roughness={0.6} />
      </mesh>
      <mesh position={[-1.8, 2.5, 0.3]}>
        <boxGeometry args={[0.15, 1.8, 1.2]} />
        <meshStandardMaterial color="#cc3333" roughness={0.5} />
      </mesh>
      <Html position={[0, 5.2, 0]} center distanceFactor={60}>
        <div className="pointer-events-none whitespace-nowrap rounded bg-blue-950/85 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-blue-100 shadow-md backdrop-blur-sm">
          Self
        </div>
      </Html>
    </group>
  );
}

function EnemyUnit() {
  const scenario = useBulletEditorStore((s) => s.scenario);
  const trajectory = useBulletEditorStore((s) => s.trajectory);
  const playbackFrame = useBulletEditorStore((s) => s.playbackFrame);
  const targetPosition = useMemo(
    () => resolveTargetPosition(trajectory, scenario, playbackFrame),
    [trajectory, scenario, playbackFrame],
  );

  return (
    <group position={targetPosition}>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[1.8, 2.4, 1.0]} />
        <meshStandardMaterial color="#993333" metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0, 3.8, 0]}>
        <boxGeometry args={[1.0, 0.7, 0.8]} />
        <meshStandardMaterial color="#aa3333" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, 3.8, 0.45]}>
        <sphereGeometry args={[0.12, 10, 10]} />
        <meshStandardMaterial color="#ff3366" emissive="#ff1144" emissiveIntensity={2.5} />
      </mesh>
      <mesh position={[-1.4, 2.2, 0]}>
        <boxGeometry args={[0.6, 2.0, 0.7]} />
        <meshStandardMaterial color="#882222" roughness={0.55} />
      </mesh>
      <mesh position={[1.4, 2.2, 0]}>
        <boxGeometry args={[0.6, 2.0, 0.7]} />
        <meshStandardMaterial color="#882222" roughness={0.55} />
      </mesh>
      <mesh position={[-0.5, 0.0, 0]}>
        <boxGeometry args={[0.7, 2.0, 0.8]} />
        <meshStandardMaterial color="#772222" roughness={0.58} />
      </mesh>
      <mesh position={[0.5, 0.0, 0]}>
        <boxGeometry args={[0.7, 2.0, 0.8]} />
        <meshStandardMaterial color="#772222" roughness={0.58} />
      </mesh>
      <mesh position={[-1.6, 3.4, 0]}>
        <coneGeometry args={[0.3, 0.8, 6]} />
        <meshStandardMaterial color="#aa4444" />
      </mesh>
      <mesh position={[1.6, 3.4, 0]}>
        <coneGeometry args={[0.3, 0.8, 6]} />
        <meshStandardMaterial color="#aa4444" />
      </mesh>
      <Html position={[0, 5.2, 0]} center distanceFactor={60}>
        <div className="pointer-events-none whitespace-nowrap rounded bg-red-950/85 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-red-100 shadow-md backdrop-blur-sm">
          Target
        </div>
      </Html>
    </group>
  );
}

function DistanceLine() {
  const scenario = useBulletEditorStore((s) => s.scenario);
  const trajectory = useBulletEditorStore((s) => s.trajectory);
  const playbackFrame = useBulletEditorStore((s) => s.playbackFrame);
  const targetPosition = useMemo(
    () => resolveTargetPosition(trajectory, scenario, playbackFrame),
    [trajectory, scenario, playbackFrame],
  );

  const points = useMemo(
    () => [
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(targetPosition[0], targetPosition[1] + 0.05, targetPosition[2]),
    ],
    [targetPosition],
  );
  const mid = useMemo(
    () =>
      new THREE.Vector3(
        targetPosition[0] * 0.5,
        targetPosition[1] * 0.5 + 0.5,
        targetPosition[2] * 0.5,
      ),
    [targetPosition],
  );
  const span = useMemo(
    () => Math.hypot(targetPosition[0], targetPosition[1], targetPosition[2]),
    [targetPosition],
  );

  return (
    <group>
      <Line points={points} color="#64748b" lineWidth={1} dashed dashSize={1} gapSize={0.5} opacity={0.45} transparent />
      <Html position={[mid.x, mid.y, mid.z]} center distanceFactor={80}>
        <div className="pointer-events-none whitespace-nowrap text-[10px] text-slate-400 tabular-nums">
          {span.toFixed(0)} u
        </div>
      </Html>
    </group>
  );
}

function ProjectileBody() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const trajectory = useBulletEditorStore((s) => s.trajectory);

  useFrame(() => {
    const state = useBulletEditorStore.getState();
    if (!state.trajectory) return;
    const idx = Math.min(Math.floor(state.playbackFrame), state.trajectory.totalFrames - 1);
    const x = state.trajectory.positions[idx * 3];
    const y = state.trajectory.positions[idx * 3 + 1];
    const z = state.trajectory.positions[idx * 3 + 2];
    meshRef.current?.position.set(x, y, z);
    glowRef.current?.position.set(x, y, z);
  });

  if (!trajectory) return null;

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.28, 24, 24]} />
        <meshStandardMaterial color="#ff3344" emissive="#dd0018" emissiveIntensity={2.2} metalness={0.15} roughness={0.35} />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.62, 16, 16]} />
        <meshBasicMaterial color="#ff5522" transparent opacity={0.14} depthWrite={false} />
      </mesh>
    </group>
  );
}

function ProgressiveTrailLine() {
  const trajectory = useBulletEditorStore((s) => s.trajectory);
  const [lineObj, setLineObj] = useState<THREE.Line | null>(null);

  useEffect(() => {
    if (!trajectory) {
      setLineObj(null);
      return;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(trajectory.positions, 3));
    geo.setDrawRange(0, 1);
    const mat = new THREE.LineBasicMaterial({
      color: "#ff7744",
      transparent: true,
      opacity: 0.92,
    });
    const line = new THREE.Line(geo, mat);
    setLineObj(line);

    return () => {
      geo.dispose();
      mat.dispose();
    };
  }, [trajectory]);

  useFrame(() => {
    if (!lineObj) return;
    const geo = lineObj.geometry as THREE.BufferGeometry;
    const { trajectory: traj, playbackFrame } = useBulletEditorStore.getState();
    if (!traj) return;
    const frame = Math.floor(playbackFrame);
    geo.setDrawRange(0, Math.min(frame + 1, traj.totalFrames));
  });

  if (!lineObj) return null;
  return <primitive object={lineObj} />;
}

function GhostTrailLine() {
  const trajectory = useBulletEditorStore((s) => s.trajectory);

  const points = useMemo(() => {
    if (!trajectory) return null;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < trajectory.totalFrames; i++) {
      pts.push(
        new THREE.Vector3(
          trajectory.positions[i * 3],
          trajectory.positions[i * 3 + 1],
          trajectory.positions[i * 3 + 2],
        ),
      );
    }
    return pts.length >= 2 ? pts : null;
  }, [trajectory]);

  if (!points) return null;

  return <Line points={points} color="#475569" lineWidth={1} opacity={0.28} transparent />;
}

function RangeVisualization() {
  const trajectory = useBulletEditorStore((s) => s.trajectory);
  const scenario = useBulletEditorStore((s) => s.scenario);
  const playbackFrame = useBulletEditorStore((s) => s.playbackFrame);
  const targetPosition = useMemo(
    () => resolveTargetPosition(trajectory, scenario, playbackFrame),
    [trajectory, scenario, playbackFrame],
  );

  if (!trajectory) return null;

  return (
    <group>
      {trajectory.maxRange > 0 && (
        <mesh position={[targetPosition[0], targetPosition[1] + 2, targetPosition[2]]}>
          <sphereGeometry args={[trajectory.maxRange, 28, 18]} />
          <meshBasicMaterial color="#4ade80" wireframe transparent opacity={0.14} depthWrite={false} />
        </mesh>
      )}
      {trajectory.effectiveRange > 0 && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[trajectory.effectiveRange, 36, 22]} />
          <meshBasicMaterial color="#fbbf24" wireframe transparent opacity={0.09} depthWrite={false} />
        </mesh>
      )}
      {trajectory.blastRadius > 0 && trajectory.hitFrame < trajectory.totalFrames && (
        <mesh
          position={[
            trajectory.positions[trajectory.hitFrame * 3] ?? 0,
            trajectory.positions[trajectory.hitFrame * 3 + 1] ?? 0,
            trajectory.positions[trajectory.hitFrame * 3 + 2] ?? 0,
          ]}
        >
          <sphereGeometry args={[Math.abs(trajectory.blastRadius), 26, 18]} />
          <meshBasicMaterial color="#fb923c" transparent opacity={0.14} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function HitboxVisualization() {
  const meshRef = useRef<THREE.Mesh>(null);
  const trajectory = useBulletEditorStore((s) => s.trajectory);

  useFrame(() => {
    if (!meshRef.current) return;
    const { trajectory: traj, playbackFrame } = useBulletEditorStore.getState();
    if (!traj) return;
    const idx = Math.min(Math.floor(playbackFrame), traj.totalFrames - 1);
    meshRef.current.position.set(traj.positions[idx * 3], traj.positions[idx * 3 + 1], traj.positions[idx * 3 + 2]);
  });

  if (!trajectory) return null;
  const [w, h, d] = trajectory.hitboxSize;
  if (w <= 0 && h <= 0 && d <= 0) return null;

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[Math.max(w, 0.08), Math.max(h, 0.08), Math.max(d, 0.08)]} />
      <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.38} depthWrite={false} />
    </mesh>
  );
}

const AXIS_ORIGIN = new THREE.Vector3(0, 0, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function AxisHelper() {
  return (
    <group>
      <arrowHelper args={[AXIS_X, AXIS_ORIGIN, 4, 0xff4444, 0.35, 0.22]} />
      <arrowHelper args={[AXIS_Y, AXIS_ORIGIN, 4, 0x44ff44, 0.35, 0.22]} />
      <arrowHelper args={[AXIS_Z, AXIS_ORIGIN, 4, 0x4488ff, 0.35, 0.22]} />
    </group>
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
  const scenario = useBulletEditorStore((s) => s.scenario);

  const orbitTargetZ = trajectory
    ? Math.min(Math.max(scenario.targetDistance * 0.45, 12), 140)
    : 25;
  const orbitTargetX = trajectory ? scenario.targetOffsetX * 0.45 : 0;
  const orbitTargetY = trajectory ? 1.8 + scenario.targetHeight * 0.35 : 1.8;

  return (
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
        <SimTicker />
        <AxisHelper />
        <PlayerUnit />
        <EnemyUnit />
        <DistanceLine />
        {trajectory && (
          <>
            <GhostTrailLine />
            <ProgressiveTrailLine />
            <ProjectileBody />
            <RangeVisualization />
            <HitboxVisualization />
          </>
        )}
      </Suspense>
    </Canvas>
  );
}
