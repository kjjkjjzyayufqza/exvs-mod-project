import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, PerspectiveCamera } from "@react-three/drei";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { RAD2DEG } from "./cameraCommandHashes";
import { normalizeCameraPreviewViewZoom } from "./cameraPreviewSettings";
import { cameraWorldPosition, type CameraLivePose } from "./evalCameraClip";

const LOOK_AT = { x: 0, y: 2.2, z: 0 };
const AXIS_ORIGIN = new THREE.Vector3(0, 0, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function UnitDummy() {
  return (
    <group>
      <mesh position={[0, 2.2, 0]} castShadow={false}>
        <boxGeometry args={[1.8, 4.4, 1.1]} />
        <meshStandardMaterial color="#3f6f9a" metalness={0.28} roughness={0.48} />
      </mesh>
      <mesh position={[0, 4.55, 0.15]}>
        <boxGeometry args={[0.9, 0.7, 0.8]} />
        <meshStandardMaterial color="#355f86" />
      </mesh>
      <mesh position={[0, 5.05, 0]}>
        <coneGeometry args={[0.12, 0.48, 4]} />
        <meshStandardMaterial color="#d6a54a" emissive="#d6a54a" emissiveIntensity={0.28} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.15, 1.35, 48]} />
        <meshBasicMaterial color="#64748b" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function GameCameraRig({ pose, viewZoom }: { pose: CameraLivePose; viewZoom: number }) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const world = cameraWorldPosition(LOOK_AT, pose, viewZoom);

  useFrame(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.position.set(world.x, world.y, world.z);
    camera.lookAt(LOOK_AT.x, LOOK_AT.y, LOOK_AT.z);
    camera.fov = Math.max(pose.fov, 0.01);
    camera.near = 0.05;
    camera.far = 400;
    camera.updateProjectionMatrix();
  });

  return (
    <PerspectiveCamera
      ref={cameraRef}
      makeDefault
      fov={Math.max(pose.fov, 0.01)}
      near={0.05}
      far={400}
      position={[world.x, world.y, world.z]}
    />
  );
}

function LookAtMarker() {
  return (
    <mesh position={[LOOK_AT.x, LOOK_AT.y, LOOK_AT.z]}>
      <sphereGeometry args={[0.1, 12, 12]} />
      <meshBasicMaterial color="#d6a54a" />
    </mesh>
  );
}

function AxisHelper() {
  return (
    <group>
      <arrowHelper args={[AXIS_X, AXIS_ORIGIN, 2.4, 0xc45c5c, 0.22, 0.14]} />
      <arrowHelper args={[AXIS_Y, AXIS_ORIGIN, 2.4, 0x5ea36b, 0.22, 0.14]} />
      <arrowHelper args={[AXIS_Z, AXIS_ORIGIN, 2.4, 0x4f84c4, 0.22, 0.14]} />
    </group>
  );
}

function HudReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-18 flex-col">
      <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-400">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-zinc-100">{value}</span>
    </div>
  );
}

function ViewfinderFrame() {
  return (
    <div className="pointer-events-none absolute inset-0 outline-1 -outline-offset-1 outline-white/10">
      <div className="absolute left-3 top-3 h-5 w-5 border-l-2 border-t-2 border-white/55" />
      <div className="absolute right-3 top-3 h-5 w-5 border-r-2 border-t-2 border-white/55" />
      <div className="absolute bottom-3 left-3 h-5 w-5 border-b-2 border-l-2 border-white/55" />
      <div className="absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-white/55" />
      <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/25" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/25" />
      </div>
    </div>
  );
}

type CameraClipPreviewCanvasProps = {
  pose: CameraLivePose;
  playing: boolean;
  clipLabel: string;
  viewZoom: number;
  onViewZoomChange: (zoom: number) => void;
};

export function CameraClipPreviewCanvas({
  pose,
  playing,
  clipLabel,
  viewZoom,
  onViewZoomChange,
}: CameraClipPreviewCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewZoomRef = useRef(viewZoom);
  viewZoomRef.current = viewZoom;

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      onViewZoomChange(normalizeCameraPreviewViewZoom(viewZoomRef.current * factor));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [onViewZoomChange]);

  return (
    <div ref={rootRef} className="relative h-full min-h-0 w-full overflow-hidden bg-zinc-950">
      <Canvas className="absolute inset-0 h-full w-full" gl={{ antialias: true, alpha: false }} dpr={[1, 1.5]}>
        <color attach="background" args={["#10141c"]} />
        <Suspense fallback={null}>
          <GameCameraRig pose={pose} viewZoom={viewZoom} />
          <ambientLight intensity={0.48} />
          <directionalLight position={[8, 14, 6]} intensity={1.05} />
          <directionalLight position={[-6, 8, -4]} intensity={0.22} />
          <UnitDummy />
          <LookAtMarker />
          <AxisHelper />
          <Grid
            args={[80, 80]}
            cellSize={1}
            cellThickness={0.75}
            sectionSize={5}
            sectionThickness={1.2}
            fadeDistance={400}
            fadeFrom={0}
            fadeStrength={0.25}
            infiniteGrid={false}
            side={THREE.DoubleSide}
            cellColor="#5b6d82"
            sectionColor="#8a9bb0"
            position={[0, 0, 0]}
          />
        </Suspense>
      </Canvas>
      <ViewfinderFrame />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-linear-to-b from-black/55 to-transparent px-3 pb-8 pt-2.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-2 w-2 rounded-full",
              playing ? "bg-red-500 motion-safe:animate-pulse" : "bg-zinc-500",
            )}
          />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-100">
            {playing ? "Play" : "Hold"}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-zinc-300">
            SHOT {String(pose.shotIndex + 1).padStart(2, "0")}
          </span>
        </div>
        <span className="max-w-[45%] truncate font-mono text-[10px] tabular-nums text-zinc-300">{clipLabel}</span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-linear-to-t from-black/60 to-transparent px-3 pb-2.5 pt-8">
        <HudReadout label="FOV" value={pose.fov.toFixed(1)} />
        <HudReadout label="OFF" value={pose.offset.toFixed(2)} />
        <HudReadout label="PITCH" value={`${(pose.pitch * RAD2DEG).toFixed(1)}`} />
        <HudReadout label="YAW" value={`${(pose.yaw * RAD2DEG).toFixed(1)}`} />
        <HudReadout
          label="VIEW"
          value={`${normalizeCameraPreviewViewZoom(viewZoom).toFixed(2)}×`}
        />
        <HudReadout label="TICK" value={pose.shotClock.toFixed(0)} />
      </div>
    </div>
  );
}
