import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { useBulletPreviewStore } from "./bulletPreviewStore";

// ─── Player (Self) Unit ───────────────────────────────────────────────────────

function PlayerUnit() {
  return (
    <group position={[0, 0, 0]}>
      {/* Body */}
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[1.8, 2.4, 1.0]} />
        <meshStandardMaterial color="#3366cc" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 3.8, 0]}>
        <boxGeometry args={[0.9, 0.8, 0.8]} />
        <meshStandardMaterial color="#3366cc" />
      </mesh>
      {/* V-fin */}
      <mesh position={[0, 4.3, 0]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.15, 0.7, 4]} />
        <meshStandardMaterial color="#ffcc00" emissive="#ffaa00" emissiveIntensity={0.4} />
      </mesh>
      {/* Left arm */}
      <mesh position={[-1.4, 2.2, 0]}>
        <boxGeometry args={[0.6, 2.0, 0.7]} />
        <meshStandardMaterial color="#2255aa" />
      </mesh>
      {/* Right arm */}
      <mesh position={[1.4, 2.2, 0]}>
        <boxGeometry args={[0.6, 2.0, 0.7]} />
        <meshStandardMaterial color="#2255aa" />
      </mesh>
      {/* Left leg */}
      <mesh position={[-0.5, 0.0, 0]}>
        <boxGeometry args={[0.7, 2.0, 0.8]} />
        <meshStandardMaterial color="#2244aa" />
      </mesh>
      {/* Right leg */}
      <mesh position={[0.5, 0.0, 0]}>
        <boxGeometry args={[0.7, 2.0, 0.8]} />
        <meshStandardMaterial color="#2244aa" />
      </mesh>
      {/* Shield (left) */}
      <mesh position={[-1.8, 2.5, 0.3]}>
        <boxGeometry args={[0.15, 1.8, 1.2]} />
        <meshStandardMaterial color="#cc3333" />
      </mesh>
      {/* Label */}
      <Html position={[0, 5.2, 0]} center distanceFactor={60}>
        <div className="whitespace-nowrap rounded bg-blue-900/80 px-2 py-0.5 text-[10px] font-bold text-blue-200 select-none">
          PLAYER
        </div>
      </Html>
    </group>
  );
}

// ─── Enemy Unit ───────────────────────────────────────────────────────────────

function EnemyUnit() {
  const targetDistance = useBulletPreviewStore((s) => s.targetDistance);

  return (
    <group position={[0, 0, targetDistance]}>
      {/* Body */}
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[1.8, 2.4, 1.0]} />
        <meshStandardMaterial color="#993333" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 3.8, 0]}>
        <boxGeometry args={[1.0, 0.7, 0.8]} />
        <meshStandardMaterial color="#aa3333" />
      </mesh>
      {/* Mono-eye */}
      <mesh position={[0, 3.8, 0.45]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#ff3366" emissive="#ff1144" emissiveIntensity={3} />
      </mesh>
      {/* Left arm */}
      <mesh position={[-1.4, 2.2, 0]}>
        <boxGeometry args={[0.6, 2.0, 0.7]} />
        <meshStandardMaterial color="#882222" />
      </mesh>
      {/* Right arm */}
      <mesh position={[1.4, 2.2, 0]}>
        <boxGeometry args={[0.6, 2.0, 0.7]} />
        <meshStandardMaterial color="#882222" />
      </mesh>
      {/* Left leg */}
      <mesh position={[-0.5, 0.0, 0]}>
        <boxGeometry args={[0.7, 2.0, 0.8]} />
        <meshStandardMaterial color="#772222" />
      </mesh>
      {/* Right leg */}
      <mesh position={[0.5, 0.0, 0]}>
        <boxGeometry args={[0.7, 2.0, 0.8]} />
        <meshStandardMaterial color="#772222" />
      </mesh>
      {/* Spike shoulder (left) */}
      <mesh position={[-1.6, 3.4, 0]}>
        <coneGeometry args={[0.3, 0.8, 6]} />
        <meshStandardMaterial color="#aa4444" />
      </mesh>
      {/* Spike shoulder (right) */}
      <mesh position={[1.6, 3.4, 0]}>
        <coneGeometry args={[0.3, 0.8, 6]} />
        <meshStandardMaterial color="#aa4444" />
      </mesh>
      {/* Label */}
      <Html position={[0, 5.2, 0]} center distanceFactor={60}>
        <div className="whitespace-nowrap rounded bg-red-900/80 px-2 py-0.5 text-[10px] font-bold text-red-200 select-none">
          ENEMY
        </div>
      </Html>
    </group>
  );
}

// ─── Distance Line ────────────────────────────────────────────────────────────

function DistanceLine() {
  const targetDistance = useBulletPreviewStore((s) => s.targetDistance);

  const points = useMemo(
    () => [new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 0.05, targetDistance)],
    [targetDistance],
  );

  return (
    <group>
      <Line points={points} color="#556677" lineWidth={1} dashed dashSize={1} gapSize={0.5} opacity={0.4} transparent />
      <Html position={[0, 0.5, targetDistance / 2]} center distanceFactor={80}>
        <div className="whitespace-nowrap text-[9px] text-slate-400 select-none">
          {targetDistance.toFixed(0)}m
        </div>
      </Html>
    </group>
  );
}

// ─── Projectile Red Dot ───────────────────────────────────────────────────────

function ProjectileDot() {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const trajectory = useBulletPreviewStore((s) => s.trajectory);

  useFrame((_, delta) => {
    const state = useBulletPreviewStore.getState();
    if (!state.trajectory) return;
    state.advanceFrame(delta * 60);
    const frame = Math.floor(state.currentFrame);
    const idx = Math.min(frame, state.trajectory.totalFrames - 1);
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
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color="#ff2222" emissive="#ff0000" emissiveIntensity={3} />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.7, 12, 12]} />
        <meshBasicMaterial color="#ff4400" transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

// ─── Trail Lines ──────────────────────────────────────────────────────────────

function TrailLine() {
  const lineRef = useRef<THREE.Line>(null);
  const trajectory = useBulletPreviewStore((s) => s.trajectory);
  const showTrail = useBulletPreviewStore((s) => s.showTrail);

  const geometry = useMemo(() => {
    if (!trajectory) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(trajectory.positions, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, [trajectory]);

  useFrame(() => {
    if (!geometry) return;
    const { currentFrame, trajectory: traj } = useBulletPreviewStore.getState();
    if (!traj) return;
    geometry.setDrawRange(0, Math.min(Math.floor(currentFrame) + 1, traj.totalFrames));
  });

  if (!geometry || !showTrail) return null;

  return (
    <primitive object={new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#ff6644", transparent: true, opacity: 0.8 }))} ref={lineRef} />
  );
}

function FullTrailLine() {
  const trajectory = useBulletPreviewStore((s) => s.trajectory);
  const showTrail = useBulletPreviewStore((s) => s.showTrail);

  const points = useMemo(() => {
    if (!trajectory) return null;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < trajectory.totalFrames; i++) {
      pts.push(new THREE.Vector3(
        trajectory.positions[i * 3],
        trajectory.positions[i * 3 + 1],
        trajectory.positions[i * 3 + 2],
      ));
    }
    return pts.length >= 2 ? pts : null;
  }, [trajectory]);

  if (!points || !showTrail) return null;

  return <Line points={points} color="#553322" lineWidth={1} opacity={0.2} transparent />;
}

// ─── Range Visualization ──────────────────────────────────────────────────────

function RangeVisualization() {
  const trajectory = useBulletPreviewStore((s) => s.trajectory);
  const showRange = useBulletPreviewStore((s) => s.showRange);
  const targetDistance = useBulletPreviewStore((s) => s.targetDistance);

  if (!trajectory || !showRange) return null;

  return (
    <group>
      {trajectory.maxRange > 0 && (
        <mesh position={[0, 2, targetDistance]}>
          <sphereGeometry args={[trajectory.maxRange, 24, 16]} />
          <meshBasicMaterial color="#44ff44" wireframe transparent opacity={0.12} />
        </mesh>
      )}
      {trajectory.effectiveRange > 0 && (
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[trajectory.effectiveRange, 32, 16]} />
          <meshBasicMaterial color="#ffaa00" wireframe transparent opacity={0.06} />
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
          <sphereGeometry args={[trajectory.blastRadius, 24, 16]} />
          <meshBasicMaterial color="#ff4400" transparent opacity={0.1} />
        </mesh>
      )}
    </group>
  );
}

// ─── Hitbox Wireframe ─────────────────────────────────────────────────────────

function HitboxVisualization() {
  const ref = useRef<THREE.Mesh>(null);
  const trajectory = useBulletPreviewStore((s) => s.trajectory);
  const showHitbox = useBulletPreviewStore((s) => s.showHitbox);

  useFrame(() => {
    if (!ref.current) return;
    const { currentFrame, trajectory: traj } = useBulletPreviewStore.getState();
    if (!traj) return;
    const idx = Math.min(Math.floor(currentFrame), traj.totalFrames - 1);
    ref.current.position.set(
      traj.positions[idx * 3],
      traj.positions[idx * 3 + 1],
      traj.positions[idx * 3 + 2],
    );
  });

  if (!trajectory || !showHitbox) return null;
  const [w, h, d] = trajectory.hitboxSize;
  if (w <= 0 && h <= 0 && d <= 0) return null;

  return (
    <mesh ref={ref}>
      <boxGeometry args={[Math.max(w, 0.5), Math.max(h, 0.5), Math.max(d, 0.5)]} />
      <meshBasicMaterial color="#00ffff" wireframe transparent opacity={0.3} />
    </mesh>
  );
}

// ─── Axis Arrows ──────────────────────────────────────────────────────────────

const AXIS_ORIGIN = new THREE.Vector3(0, 0, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function AxisHelper() {
  return (
    <group>
      <arrowHelper args={[AXIS_X, AXIS_ORIGIN, 4, 0xff4444, 0.4, 0.25]} />
      <arrowHelper args={[AXIS_Y, AXIS_ORIGIN, 4, 0x44ff44, 0.4, 0.25]} />
      <arrowHelper args={[AXIS_Z, AXIS_ORIGIN, 4, 0x4488ff, 0.4, 0.25]} />
    </group>
  );
}

// ─── Main Scene ───────────────────────────────────────────────────────────────

export function BulletPreviewScene() {
  const trajectory = useBulletPreviewStore((s) => s.trajectory);

  return (
    <group>
      <AxisHelper />
      <PlayerUnit />
      <EnemyUnit />
      <DistanceLine />
      {trajectory && (
        <>
          <FullTrailLine />
          <TrailLine />
          <ProjectileDot />
          <RangeVisualization />
          <HitboxVisualization />
        </>
      )}
    </group>
  );
}
