/**
 * Pure frame stepping for NUANMB playback (matches SsbhModelPreviewContext rAF loop).
 */

import type { MotionClip, MotionFrameSample } from "./motionPreviewTypes";

export type AdvanceMotionFrameResult = {
  nextFrame: number;
  /** When true, caller should stop playback (non-loop, reached end). */
  shouldStopPlayback: boolean;
};

function lerpNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    lerpNumber(a[0], b[0], t),
    lerpNumber(a[1], b[1], t),
    lerpNumber(a[2], b[2], t),
  ];
}

function lerpVec4(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  t: number,
): [number, number, number, number] {
  return [
    lerpNumber(a[0], b[0], t),
    lerpNumber(a[1], b[1], t),
    lerpNumber(a[2], b[2], t),
    lerpNumber(a[3], b[3], t),
  ];
}

function normalizeQuat(x: number, y: number, z: number, w: number): [number, number, number, number] {
  const len = Math.hypot(x, y, z, w);
  if (len <= 1e-8) {
    return [0, 0, 0, 1];
  }
  return [x / len, y / len, z / len, w / len];
}

function lerpQuat(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  t: number,
): [number, number, number, number] {
  let bx = b[0];
  let by = b[1];
  let bz = b[2];
  let bw = b[3];
  const dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  return normalizeQuat(
    lerpNumber(a[0], bx, t),
    lerpNumber(a[1], by, t),
    lerpNumber(a[2], bz, t),
    lerpNumber(a[3], bw, t),
  );
}

function interpolateFrameSample(
  current: MotionFrameSample,
  next: MotionFrameSample,
  t: number,
): MotionFrameSample {
  const boneCount = Math.min(current.boneLocals.length, next.boneLocals.length);
  const boneLocals = new Array(boneCount);
  for (let i = 0; i < boneCount; i++) {
    const a = current.boneLocals[i]!;
    const b = next.boneLocals[i]!;
    boneLocals[i] = {
      translation: lerpVec3(a.translation, b.translation, t),
      rotation: lerpQuat(a.rotation, b.rotation, t),
      scale: lerpVec3(a.scale, b.scale, t),
    };
  }

  const camera =
    current.camera && next.camera
      ? {
          translation: lerpVec3(current.camera.translation, next.camera.translation, t),
          rotation: lerpQuat(current.camera.rotation, next.camera.rotation, t),
          scale: lerpVec3(current.camera.scale, next.camera.scale, t),
          fovYRadians: lerpNumber(current.camera.fovYRadians, next.camera.fovYRadians, t),
          nearClip: lerpNumber(current.camera.nearClip, next.camera.nearClip, t),
          farClip: lerpNumber(current.camera.farClip, next.camera.farClip, t),
        }
      : current.camera;

  const lighting =
    current.lighting && next.lighting
      ? {
          lightChr:
            current.lighting.lightChr && next.lighting.lightChr
              ? {
                  color: lerpVec4(current.lighting.lightChr.color, next.lighting.lightChr.color, t),
                  direction: lerpVec4(current.lighting.lightChr.direction, next.lighting.lightChr.direction, t),
                }
              : current.lighting.lightChr,
          lightStage: current.lighting.lightStage.map((light, index) => {
            const nextLight = next.lighting?.lightStage[index];
            if (!nextLight) {
              return light;
            }
            return {
              color: lerpVec4(light.color, nextLight.color, t),
              direction: lerpVec4(light.direction, nextLight.direction, t),
            };
          }),
        }
      : current.lighting;

  return {
    boneLocals,
    visibility: current.visibility,
    materialTracks: current.materialTracks,
    camera,
    lighting,
  };
}

export function advanceMotionFrame(
  frame: number,
  deltaSeconds: number,
  speed: number,
  maxFrameIndex: number,
  loop: boolean,
): AdvanceMotionFrameResult {
  let next = frame + deltaSeconds * 60 * speed;
  if (loop) {
    next = maxFrameIndex > 0 ? ((next % maxFrameIndex) + maxFrameIndex) % maxFrameIndex : 0;
    return { nextFrame: next, shouldStopPlayback: false };
  }
  if (next >= maxFrameIndex) {
    return { nextFrame: maxFrameIndex, shouldStopPlayback: true };
  }
  return { nextFrame: next, shouldStopPlayback: false };
}

export function sampleMotionClipFrame(
  clip: MotionClip,
  frame: number,
  loop: boolean,
): MotionFrameSample {
  const count = clip.frames.length;
  if (count <= 0) {
    throw new Error("Motion clip has no sampled frames");
  }
  const maxIndex = count - 1;
  let f = frame;
  if (loop) {
    f = clip.finalFrameIndex > 0
      ? ((f % clip.finalFrameIndex) + clip.finalFrameIndex) % clip.finalFrameIndex
      : 0;
  } else if (f < 0) {
    f = 0;
  } else if (f > maxIndex) {
    f = maxIndex;
  }
  const currentIndex = Math.floor(f);
  const current = clip.frames[currentIndex];
  if (!current) {
    throw new Error(`Motion frame index out of range: ${currentIndex}`);
  }
  const nextIndex = loop ? (currentIndex + 1) % count : Math.min(currentIndex + 1, maxIndex);
  const next = clip.frames[nextIndex];
  if (!next) {
    throw new Error(`Motion frame index out of range: ${nextIndex}`);
  }
  const factor = f - currentIndex;
  if (factor <= 1e-8 || currentIndex === nextIndex) {
    return current;
  }
  return interpolateFrameSample(current, next, factor);
}
