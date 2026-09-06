import { FOV_FLOOR, PITCH_CLAMP_RAD } from "./cameraCommandHashes";
import {
  DEFAULT_CAMERA_PREVIEW_VIEW_ZOOM,
  normalizeCameraPreviewViewZoom,
} from "./cameraPreviewSettings";
import type { CompiledChannel, CompiledShot } from "./compileCameraClip";

export type CameraLivePose = {
  shotIndex: number;
  shotClock: number;
  clock: number;
  total: number;
  done: boolean;
  pitch: number;
  yaw: number;
  fov: number;
  offset: number;
  ch3: number;
  ch4: number;
};

const EASE_EPS = 1e-6;

export function easeKernel(kind: number, clock: number, duration: number): number {
  if (duration <= EASE_EPS) {
    const id = kind >>> 0;
    return id >= 3 && id <= 5 ? 0 : 1;
  }
  const remaining = duration - clock;
  if (remaining <= EASE_EPS) {
    const id = kind >>> 0;
    return id >= 3 && id <= 5 ? 0 : 1;
  }
  const t = Math.min(Math.max(clock / duration, 0), 1);
  switch (kind >>> 0) {
    case 0:
      return t;
    case 1:
      return 1 - Math.cos((Math.PI / 2) * t);
    case 2:
      return Math.sin((Math.PI / 2) * t);
    case 3:
      return 1 - t;
    case 6: {
      const s = t * t;
      return s * (3 - 2 * t);
    }
    case 7: {
      const s = t * t * t;
      return s * (t * (t * 6 - 15) + 10);
    }
    case 4:
    case 5:
    case 8:
      return t * t * (3 - 2 * t);
    default:
      return t;
  }
}

export function lerpScalar(from: number, to: number, kind: number, clock: number, duration: number): number {
  if (Math.abs(to - from) < 1e-6) return from;
  const t = easeKernel(kind, clock, duration);
  return from + (to - from) * t;
}

export function lerpAngle(from: number, to: number, kind: number, clock: number, duration: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) < 1e-6) return from;
  return from + delta * easeKernel(kind, clock, duration);
}

function integrateRate(start: number, channel: CompiledChannel, clock: number, duration: number): number {
  if (clock <= 0) return start;
  if (Math.abs(channel.v3 - channel.v2) < 1e-6) {
    return start + channel.v2 * clock;
  }
  let live = start;
  const steps = Math.max(0, Math.floor(clock));
  for (let i = 0; i < steps; i += 1) {
    live += lerpScalar(channel.v2, channel.v3, channel.ease, i, duration);
  }
  const frac = clock - steps;
  if (frac > 0) {
    live += lerpScalar(channel.v2, channel.v3, channel.ease, steps, duration) * frac;
  }
  return live;
}

function evalChannel(
  channel: CompiledChannel,
  previous: number,
  shotIndex: number,
  clock: number,
  duration: number,
  mode: "angle" | "linear",
): number {
  const start = shotIndex === 0 || channel.nanV0 === 0 ? channel.v0 : previous;
  if (channel.v1Authored === 0) {
    return integrateRate(start, channel, clock, duration);
  }
  if (mode === "angle") {
    return lerpAngle(start, channel.v1, channel.ease, clock, duration);
  }
  return lerpScalar(start, channel.v1, channel.ease, clock, duration);
}

function clampPitch(value: number): number {
  return Math.min(PITCH_CLAMP_RAD, Math.max(-PITCH_CLAMP_RAD, value));
}

export function evalClip(shots: CompiledShot[], clock: number): CameraLivePose {
  const total = shots.reduce((sum, shot) => sum + Math.max(shot.duration, 0), 0);
  let pitch = 0;
  let yaw = 0;
  let fov = 40;
  let offset = 8;
  let ch3 = 0;
  let ch4 = 0;
  let remaining = Math.max(0, clock);
  if (shots.length === 0) {
    return {
      shotIndex: 0,
      shotClock: 0,
      clock: 0,
      total: 0,
      done: true,
      pitch,
      yaw,
      fov,
      offset,
      ch3,
      ch4,
    };
  }

  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i];
    const duration = Math.max(shot.duration, 0);
    const span = duration === 0 ? Number.POSITIVE_INFINITY : duration;
    const atEnd = remaining >= span && Number.isFinite(span);
    const shotClock = atEnd ? span : remaining;
    pitch = clampPitch(evalChannel(shot.pitch, pitch, i, shotClock, duration || 1, "angle"));
    yaw = evalChannel(shot.yaw, yaw, i, shotClock, duration || 1, "angle");
    fov = Math.max(FOV_FLOOR, evalChannel(shot.fov, fov, i, shotClock, duration || 1, "linear"));
    ch3 = evalChannel(shot.ch3, ch3, i, shotClock, duration || 1, "angle");
    ch4 = evalChannel(shot.ch4, ch4, i, shotClock, duration || 1, "linear");
    if (shot.offsetNan || (i > 0 && shot.offset === 0 && offset !== 0)) {
      // keep previous offset
    } else {
      offset = shot.offset;
    }
    if (!atEnd) {
      return {
        shotIndex: i,
        shotClock,
        clock,
        total,
        done: false,
        pitch,
        yaw,
        fov,
        offset,
        ch3,
        ch4,
      };
    }
    remaining -= span;
  }

  const last = shots.length - 1;
  return {
    shotIndex: last,
    shotClock: Math.max(shots[last].duration, 0),
    clock: total,
    total,
    done: true,
    pitch,
    yaw,
    fov,
    offset,
    ch3,
    ch4,
  };
}

/**
 * Preview-only look-at radius. Native `644930` is still unproven
 * (`docs/msc-research/camera-clip-bst-loader.md` §6.3).
 *
 * Authored word40 is a signed extra, not the full orbit radius:
 * Rebellion `0xFD5FD16A` shot 0 is -5.5 with FOV 11, and ENTER
 * `0x8CA6CC45` is 0. Using those as the sphere radius puts the
 * camera inside the dummy. 36 keeps a 4.4-unit dummy inside FOV 11
 * (fill radius is ~22.8) with padding, so FOV still zooms.
 *
 * Three.js preview **negates pitch Y**: +pitch sits below the look-at
 * (looks up). HUD still shows the compiled radian. Native `644930` sign
 * is unproven; this invert is the in-editor match after 0x9AC77769 review.
 */
export const PREVIEW_LOOKAT_RADIUS = 36;
const PREVIEW_MIN_RADIUS = 3.5;

export function previewOrbitRadius(offset: number, viewZoom = DEFAULT_CAMERA_PREVIEW_VIEW_ZOOM): number {
  const zoom = normalizeCameraPreviewViewZoom(viewZoom);
  return Math.max(PREVIEW_MIN_RADIUS, (PREVIEW_LOOKAT_RADIUS + offset) / zoom);
}

export function cameraWorldPosition(
  lookAt: { x: number; y: number; z: number },
  pose: Pick<CameraLivePose, "pitch" | "yaw" | "offset">,
  viewZoom = DEFAULT_CAMERA_PREVIEW_VIEW_ZOOM,
): { x: number; y: number; z: number } {
  const distance = previewOrbitRadius(pose.offset, viewZoom);
  const cosPitch = Math.cos(pose.pitch);
  return {
    x: lookAt.x + distance * cosPitch * Math.sin(pose.yaw),
    y: lookAt.y - distance * Math.sin(pose.pitch),
    z: lookAt.z + distance * cosPitch * Math.cos(pose.yaw),
  };
}
