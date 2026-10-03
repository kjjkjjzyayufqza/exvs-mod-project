import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, PerspectiveCamera } from "@react-three/drei";
import { Suspense, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { DEG2RAD, RAD2DEG } from "./cameraCommandHashes";
import { normalizeCameraPreviewViewZoom } from "./cameraPreviewSettings";
import type { CameraVec3 } from "./compileCameraClip";
import {
  PREVIEW_TARGET_POSITION,
  PREVIEW_UNIT_POSITION,
  type CameraLivePose,
} from "./evalCameraClip";

/** Game axes put X on the unit's right; three.js is right-handed with the unit facing +Z, so X flips. */
function toThree(v: CameraVec3): THREE.Vector3 {
  return new THREE.Vector3(-v.x, v.y, v.z);
}

/** Preview lens zoom: narrows the rendered field of view only, never the authored one. */
function lensFieldOfView(fieldOfViewDeg: number, viewZoom: number): number {
  const half = Math.tan((Math.max(fieldOfViewDeg, 0.01) * DEG2RAD) / 2) / normalizeCameraPreviewViewZoom(viewZoom);
  return 2 * Math.atan(half) * RAD2DEG;
}

const AXIS_ORIGIN = new THREE.Vector3(0, 0.05, 0);
const AXIS_X = new THREE.Vector3(-1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/** About a unit's height (20 game units, CENTER_RT 10 above the root), facing +Z. */
function UnitDummy({ position, color, facing }: { position: CameraVec3; color: string; facing: 1 | -1 }) {
  const base = toThree(position);
  return (
    <group position={base} rotation={[0, facing === 1 ? 0 : Math.PI, 0]}>
      <mesh position={[0, 8, 0]}>
        <boxGeometry args={[8, 16, 5]} />
        <meshStandardMaterial color={color} metalness={0.28} roughness={0.48} />
      </mesh>
      <mesh position={[0, 18, 0.5]}>
        <boxGeometry args={[4, 4, 4]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 12, 4]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[1.4, 3, 4]} />
        <meshStandardMaterial color="#d6a54a" emissive="#d6a54a" emissiveIntensity={0.28} />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6, 7, 48]} />
        <meshBasicMaterial color="#64748b" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function GameCameraRig({ pose, viewZoom }: { pose: CameraLivePose; viewZoom: number }) {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const eye = toThree(pose.eye);
  const lookAt = toThree(pose.lookAt);
  const fov = lensFieldOfView(pose.fieldOfView, viewZoom);

  useFrame(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    camera.position.copy(eye);
    camera.up.set(0, 1, 0);
    camera.lookAt(lookAt);
    camera.fov = fov;
    camera.near = 0.5;
    camera.far = 10000;
    camera.updateProjectionMatrix();
  });

  return <PerspectiveCamera ref={cameraRef} makeDefault fov={fov} near={0.5} far={10000} position={eye} />;
}

function LookAtMarker({ position }: { position: CameraVec3 }) {
  return (
    <mesh position={toThree(position)}>
      <sphereGeometry args={[1.2, 16, 16]} />
      <meshBasicMaterial color="#d6a54a" />
    </mesh>
  );
}

function AxisHelper() {
  return (
    <group>
      <arrowHelper args={[AXIS_X, AXIS_ORIGIN, 24, 0xc45c5c, 3, 2]} />
      <arrowHelper args={[AXIS_Y, AXIS_ORIGIN, 24, 0x5ea36b, 3, 2]} />
      <arrowHelper args={[AXIS_Z, AXIS_ORIGIN, 24, 0x4f84c4, 3, 2]} />
    </group>
  );
}

function PreviewScene({ pose, viewZoom }: { pose: CameraLivePose; viewZoom: number }) {
  return (
    <Suspense fallback={null}>
      <GameCameraRig pose={pose} viewZoom={viewZoom} />
      <ambientLight intensity={0.48} />
      <directionalLight position={[80, 140, 60]} intensity={1.05} />
      <directionalLight position={[-60, 80, -40]} intensity={0.22} />
      <UnitDummy position={PREVIEW_UNIT_POSITION} color="#3f6f9a" facing={1} />
      <UnitDummy position={PREVIEW_TARGET_POSITION} color="#9a4f4f" facing={-1} />
      <LookAtMarker position={pose.lookAt} />
      <AxisHelper />
      <Grid
        args={[2000, 2000]}
        cellSize={10}
        cellThickness={0.75}
        sectionSize={50}
        sectionThickness={1.2}
        fadeDistance={2500}
        fadeFrom={0}
        fadeStrength={0.25}
        infiniteGrid={false}
        side={THREE.DoubleSide}
        cellColor="#5b6d82"
        sectionColor="#8a9bb0"
        position={[0, 0, 0]}
      />
    </Suspense>
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

function formatVec(v: CameraVec3): string {
  return `${v.x.toFixed(0)}, ${v.y.toFixed(0)}, ${v.z.toFixed(0)}`;
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
  const { t } = useTranslation("test-lists");
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

  const banners = [
    ...(pose.unsupported
      ? [
          t(`cameraTable.preview.unsupported_${pose.unsupported.field}`, {
            value: pose.unsupported.value,
            shot: pose.unsupported.shotIndex + 1,
          }),
        ]
      : []),
    ...pose.notices.map((notice) => t(`cameraTable.preview.notice_${notice}`)),
  ];

  return (
    <div ref={rootRef} className="relative h-full min-h-0 w-full overflow-hidden bg-zinc-950">
      <Canvas className="absolute inset-0 h-full w-full" gl={{ antialias: true, alpha: false }} dpr={[1, 1.5]}>
        <color attach="background" args={["#10141c"]} />
        {pose.unsupported ? null : <PreviewScene pose={pose} viewZoom={viewZoom} />}
      </Canvas>
      <ViewfinderFrame />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-1.5 bg-linear-to-b from-black/55 to-transparent px-3 pb-8 pt-2.5">
        <div className="flex items-start justify-between">
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
        {banners.map((text) => (
          <p key={text} className="max-w-[80%] text-pretty text-[11px] text-amber-200">
            {text}
          </p>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-linear-to-t from-black/60 to-transparent px-3 pb-2.5 pt-8">
        <HudReadout label="FOV" value={pose.fieldOfView.toFixed(1)} />
        <HudReadout label="DIST" value={pose.distance.toFixed(1)} />
        <HudReadout label="PITCH" value={(pose.pitch * RAD2DEG).toFixed(1)} />
        <HudReadout label="YAW" value={(pose.yaw * RAD2DEG).toFixed(1)} />
        <HudReadout label="ROLL" value={(pose.roll * RAD2DEG).toFixed(1)} />
        <HudReadout label="LOOK" value={formatVec(pose.offset)} />
        <HudReadout label="VIEW" value={`${normalizeCameraPreviewViewZoom(viewZoom).toFixed(2)}×`} />
        <HudReadout label="TICK" value={pose.shotClock.toFixed(0)} />
      </div>
    </div>
  );
}
