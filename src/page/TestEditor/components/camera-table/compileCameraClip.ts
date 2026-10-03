import type { CameraFieldSpec, CameraTableEntry } from "./cameraTableDocument";
import { cameraFieldFloat, cameraFieldUint } from "./cameraTableDocument";
import {
  CAM_CMD,
  DEG2RAD,
  EASE_REMAP,
} from "./cameraCommandHashes";

export type CompiledChannel = {
  v1Authored: number;
  v0: number;
  v1: number;
  v2: number;
  v3: number;
  ease: number;
  nanV0: number;
};

/** Game axes: X the unit's right, Y up, Z the unit's front. */
export type CameraVec3 = { x: number; y: number; z: number };

export type CompiledShot = {
  entryIndex: number;
  duration: number;
  firstShot: number;
  nuanmb: number;
  positionTarget: number;
  orientationTarget: number;
  frameMode: number;
  distanceScale: number;
  offsetStart: CameraVec3;
  offsetEnd: CameraVec3;
  offsetEase: number;
  pitch: CompiledChannel;
  yaw: CompiledChannel;
  /** Eye distance from the look-at point (`player+472`). */
  distance: CompiledChannel;
  /** Roll in degrees on disk (`player+476`). */
  roll: CompiledChannel;
  /** Field of view in degrees (`player+480`). */
  fieldOfView: CompiledChannel;
};

function specOffset(specs: CameraFieldSpec[], hash: number): number | null {
  const want = hash >>> 0;
  for (const spec of specs) {
    if ((spec.hash >>> 0) === want) return spec.entryOffset;
  }
  return null;
}

function readFloat(raw: number[] | undefined, specs: CameraFieldSpec[], hash: number): number {
  const offset = specOffset(specs, hash);
  if (offset == null) return Number.NaN;
  return cameraFieldFloat(raw, offset);
}

function readUint(raw: number[] | undefined, specs: CameraFieldSpec[], hash: number): number {
  const offset = specOffset(specs, hash);
  if (offset == null) return 0;
  return cameraFieldUint(raw, offset);
}

function isNan32(value: number): boolean {
  return !Number.isFinite(value);
}

export function remapEase(authored: number): number {
  const index = authored >>> 0;
  if (index < EASE_REMAP.length) return EASE_REMAP[index];
  return 0;
}

function compileChannel(
  raw: number[] | undefined,
  specs: CameraFieldSpec[],
  hashes: { mode: number; v0: number; v1: number; v2: number; v3: number },
  radian: boolean,
): CompiledChannel {
  const authoredV0 = readFloat(raw, specs, hashes.v0);
  const authoredV1 = readFloat(raw, specs, hashes.v1);
  const authoredV2 = readFloat(raw, specs, hashes.v2);
  const authoredV3 = readFloat(raw, specs, hashes.v3);
  const nanV0 = isNan32(authoredV0) ? 1 : 0;
  const v1Authored = isNan32(authoredV1) ? 0 : 1;
  const convert = (value: number, fallback: number): number => {
    if (isNan32(value)) return fallback;
    return radian ? value * DEG2RAD : value;
  };
  const v0 = convert(authoredV0, 0);
  const v1 = convert(authoredV1, v0);
  const v2 = convert(authoredV2, 0);
  const v3 = convert(authoredV3, v2);
  return {
    v1Authored,
    v0,
    v1,
    v2,
    v3,
    ease: remapEase(readUint(raw, specs, hashes.mode)),
    nanV0,
  };
}

/** sub_1405DBF70: a NaN start compiles to 0 and a NaN end to the start. */
function compileOffsetAxis(
  raw: number[] | undefined,
  specs: CameraFieldSpec[],
  startHash: number,
  endHash: number,
): { start: number; end: number } {
  const startRaw = readFloat(raw, specs, startHash);
  const endRaw = readFloat(raw, specs, endHash);
  const start = isNan32(startRaw) ? 0 : startRaw;
  return { start, end: isNan32(endRaw) ? start : endRaw };
}

export function compileShot(
  raw: number[] | undefined,
  specs: CameraFieldSpec[],
  entry: CameraTableEntry,
): CompiledShot {
  const durationRaw = readFloat(raw, specs, CAM_CMD.duration);
  const x = compileOffsetAxis(raw, specs, CAM_CMD.offsetX, CAM_CMD.offsetXEnd);
  const y = compileOffsetAxis(raw, specs, CAM_CMD.offset, CAM_CMD.offsetYEnd);
  const z = compileOffsetAxis(raw, specs, CAM_CMD.offsetZ, CAM_CMD.offsetZEnd);
  return {
    entryIndex: entry.entryIndex,
    duration: isNan32(durationRaw) ? 0 : durationRaw,
    firstShot: entry.firstShot,
    nuanmb: readUint(raw, specs, CAM_CMD.nuanmb),
    positionTarget: readUint(raw, specs, CAM_CMD.positionTarget),
    orientationTarget: readUint(raw, specs, CAM_CMD.orientationTarget),
    frameMode: readUint(raw, specs, CAM_CMD.frameMode),
    distanceScale: readUint(raw, specs, CAM_CMD.distanceScale),
    offsetStart: { x: x.start, y: y.start, z: z.start },
    offsetEnd: { x: x.end, y: y.end, z: z.end },
    offsetEase: remapEase(readUint(raw, specs, CAM_CMD.offsetEase)),
    pitch: compileChannel(raw, specs, {
      mode: CAM_CMD.pitchMode,
      v0: CAM_CMD.pitchV0,
      v1: CAM_CMD.pitchV1,
      v2: CAM_CMD.pitchV2,
      v3: CAM_CMD.pitchV3,
    }, true),
    yaw: compileChannel(raw, specs, {
      mode: CAM_CMD.yawMode,
      v0: CAM_CMD.yawV0,
      v1: CAM_CMD.yawV1,
      v2: CAM_CMD.yawV2,
      v3: CAM_CMD.yawV3,
    }, true),
    distance: compileChannel(raw, specs, {
      mode: CAM_CMD.fovMode,
      v0: CAM_CMD.fovV0,
      v1: CAM_CMD.fovV1,
      v2: CAM_CMD.fovV2,
      v3: CAM_CMD.fovV3,
    }, false),
    roll: compileChannel(raw, specs, {
      mode: CAM_CMD.ch3Mode,
      v0: CAM_CMD.ch3V0,
      v1: CAM_CMD.ch3V1,
      v2: CAM_CMD.ch3V2,
      v3: CAM_CMD.ch3V3,
    }, true),
    fieldOfView: compileChannel(raw, specs, {
      mode: CAM_CMD.ch4Mode,
      v0: CAM_CMD.ch4V0,
      v1: CAM_CMD.ch4V1,
      v2: CAM_CMD.ch4V2,
      v3: CAM_CMD.ch4V3,
    }, false),
  };
}

export function compileClip(
  shots: CameraTableEntry[],
  entriesRaw: number[][],
  specs: CameraFieldSpec[],
): CompiledShot[] {
  return shots.map((shot) => compileShot(entriesRaw[shot.entryIndex], specs, shot));
}

export function clipDuration(shots: CompiledShot[]): number {
  return shots.reduce((sum, shot) => sum + Math.max(shot.duration, 0), 0);
}

export function clipShotStarts(shots: CompiledShot[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const shot of shots) {
    starts.push(acc);
    acc += Math.max(shot.duration, 0);
  }
  return starts;
}
