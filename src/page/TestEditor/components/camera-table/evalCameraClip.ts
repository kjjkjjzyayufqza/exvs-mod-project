import { DEG2RAD, DISTANCE_FLOOR, PITCH_CLAMP_RAD } from "./cameraCommandHashes";
import type { CameraVec3, CompiledChannel, CompiledShot } from "./compileCameraClip";

/**
 * Game-camera pose of a compiled clip (OB vsac27).
 *
 * - Look-at = target origin + look-at offset in the target frame (sub_140644930).
 * - Eye = look-at + (sin yaw cos pitch, -sin pitch, cos yaw cos pitch) * distance * scale
 *   (sub_140645240): yaw 0 puts the eye in front of the look-at, a negative pitch above it,
 *   a positive yaw on the unit's right. The scale is 1, or the framing distance when the
 *   shot's distance scale is 1.
 * - Field of view is the fifth channel (`player+480`). Roll is evaluated but not applied.
 *
 * Preview layout, in game units and game axes (X right, Y up, Z front): the unit stands at the
 * origin facing +Z and its target stands straight ahead at the same height. Every supported
 * orientation target (sub_1406441B0 cases 1-4) then resolves to yaw 0 / pitch 0, so the frame
 * is the world axes. The characterparam position query offset of a real unit is not applied.
 */
export const PREVIEW_UNIT_POSITION: CameraVec3 = { x: 0, y: 0, z: 0 };
export const PREVIEW_TARGET_POSITION: CameraVec3 = { x: 0, y: 0, z: 150 };
/** sub_140643D60: unit radius = characterparam 0xFEADD5BE (1.0 on most units) * 7. */
const PREVIEW_UNIT_RADIUS = 7;
/**
 * Hand-over slots (`player+256` eye, `+304` field of view) as the CCameraParameter constructor
 * sub_140642EC0 leaves them. In game the battle camera fills them when the clip starts, so a first
 * shot with NaN starts begins from that camera instead (notice `handoverStart`).
 */
const HANDOVER_EYE: CameraVec3 = { x: 50, y: 20, z: 50 };
const HANDOVER_FIELD_OF_VIEW = 45;

const SUPPORTED_POSITION_TARGETS = new Set([1, 2, 3]);
const SUPPORTED_ORIENTATION_TARGETS = new Set([1, 2, 3, 4]);

export type CameraPreviewNotice = "handoverStart" | "stageChecks";

export type CameraUnsupportedField = {
  field: "positionTarget" | "orientationTarget" | "frameMode";
  value: number;
  shotIndex: number;
};

type ChannelState = {
  pitch: number;
  yaw: number;
  distance: number;
  roll: number;
  fieldOfView: number;
};

export type CameraLivePose = ChannelState & {
  shotIndex: number;
  shotClock: number;
  clock: number;
  total: number;
  done: boolean;
  offset: CameraVec3;
  lookAt: CameraVec3;
  eye: CameraVec3;
  notices: CameraPreviewNotice[];
  unsupported: CameraUnsupportedField | null;
};

const EASE_EPS = 1e-6;

/**
 * sub_14030BC60 / BBA0 / BAF0: a cubic Bezier from 0 to 1 through two control values, then a cosine ease
 * (0.5 + 0.5 sin(pi b - pi/2)). Kernel 8 (authored 6) reaches 90% at half the span and 99% at 70% of it.
 */
function bezierCosine(t: number, control1: number, control2: number): number {
  const s = 1 - t;
  const b = 3 * t * s * s * control1 + 3 * t * t * s * control2 + t * t * t;
  return 0.5 - 0.5 * Math.cos(Math.PI * b);
}

/** sub_14030B900: the shot clock over the duration through kernels 0-8 (authored eases remap via EASE_REMAP). */
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
    case 4:
      return Math.cos((Math.PI / 2) * t);
    case 5:
      return 1 - Math.sin((Math.PI / 2) * t);
    case 6:
      return bezierCosine(t, 0, 1);
    case 7:
      return bezierCosine(t, 0, 0.2);
    case 8:
      return bezierCosine(t, 0.8, 1);
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

/** sub_140647590: v1 authored lerps from the shot-start snapshot, otherwise v2 -> v3 is a rate. */
function channelValue(
  channel: CompiledChannel,
  start: number,
  clock: number,
  duration: number,
  mode: "angle" | "linear",
): number {
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

function add(a: CameraVec3, b: CameraVec3): CameraVec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** sub_140643D60 for the preview unit alone: the distance that fits its box at this field of view. */
export function framingDistance(fieldOfViewDeg: number): number {
  return ((4 / 3) * PREVIEW_UNIT_RADIUS) / Math.tan((fieldOfViewDeg * DEG2RAD) / 2);
}

function distanceScale(shot: CompiledShot, fieldOfView: number): number {
  return shot.distanceScale === 1 ? framingDistance(fieldOfView) : 1;
}

/** sub_140643640 cases 1-3 in the preview layout. */
function targetOrigin(positionTarget: number): CameraVec3 {
  if (positionTarget === 2) return PREVIEW_UNIT_POSITION;
  if (positionTarget === 3) return PREVIEW_TARGET_POSITION;
  return {
    x: (PREVIEW_UNIT_POSITION.x + PREVIEW_TARGET_POSITION.x) * 0.5,
    y: (PREVIEW_UNIT_POSITION.y + PREVIEW_TARGET_POSITION.y) * 0.5,
    z: (PREVIEW_UNIT_POSITION.z + PREVIEW_TARGET_POSITION.z) * 0.5,
  };
}

function unsupportedField(shot: CompiledShot, shotIndex: number): CameraUnsupportedField | null {
  if (!SUPPORTED_POSITION_TARGETS.has(shot.positionTarget)) {
    return { field: "positionTarget", value: shot.positionTarget, shotIndex };
  }
  if (!SUPPORTED_ORIENTATION_TARGETS.has(shot.orientationTarget)) {
    return { field: "orientationTarget", value: shot.orientationTarget, shotIndex };
  }
  if (shot.frameMode !== 0) {
    return { field: "frameMode", value: shot.frameMode, shotIndex };
  }
  return null;
}

function hasNanStart(shot: CompiledShot): boolean {
  return [shot.pitch, shot.yaw, shot.distance, shot.roll, shot.fieldOfView].some((channel) => channel.nanV0 !== 0);
}

/** sub_140646AD0 keeps the first nonzero kind; kinds 1 / 2 turn on the stage ray checks that can end the clip. */
function clipNotices(shots: CompiledShot[]): CameraPreviewNotice[] {
  const notices: CameraPreviewNotice[] = [];
  if (shots.length > 0 && hasNanStart(shots[0])) notices.push("handoverStart");
  const kind = shots.find((shot) => shot.firstShot !== 0)?.firstShot ?? 0;
  if (kind === 1 || kind === 2) notices.push("stageChecks");
  return notices;
}

/**
 * sub_140646C20: authored starts (and every start of the first shot) are copied; later NaN
 * roll / field of view keep the live value. A NaN pitch / yaw / distance is measured from the
 * eye (the hand-over eye on the first shot) against this shot's starting look-at.
 */
function resolveShotStart(
  shot: CompiledShot,
  shotIndex: number,
  live: ChannelState,
  eye: CameraVec3,
  lookAtStart: CameraVec3,
): ChannelState {
  const copied = (channel: CompiledChannel) => shotIndex === 0 || channel.nanV0 === 0;
  const start: ChannelState = {
    pitch: copied(shot.pitch) ? clampPitch(shot.pitch.v0) : live.pitch,
    yaw: copied(shot.yaw) ? shot.yaw.v0 : live.yaw,
    distance: copied(shot.distance) ? shot.distance.v0 : live.distance,
    roll: copied(shot.roll) ? shot.roll.v0 : live.roll,
    fieldOfView: copied(shot.fieldOfView) ? shot.fieldOfView.v0 : live.fieldOfView,
  };
  if (shotIndex === 0 && shot.fieldOfView.nanV0 !== 0) start.fieldOfView = HANDOVER_FIELD_OF_VIEW;
  if (shot.pitch.nanV0 === 0 && shot.yaw.nanV0 === 0 && shot.distance.nanV0 === 0) return start;
  const from = shotIndex === 0 ? HANDOVER_EYE : eye;
  const v = { x: from.x - lookAtStart.x, y: from.y - lookAtStart.y, z: from.z - lookAtStart.z };
  if (shot.pitch.nanV0 !== 0) start.pitch = clampPitch(Math.atan2(-v.y, Math.hypot(v.x, v.z)));
  if (shot.yaw.nanV0 !== 0) start.yaw = Math.atan2(v.x, v.z);
  if (shot.distance.nanV0 !== 0) {
    start.distance = Math.hypot(v.x, v.y, v.z) / distanceScale(shot, start.fieldOfView);
  }
  return start;
}

function shotPose(
  shot: CompiledShot,
  start: ChannelState,
  origin: CameraVec3,
  clock: number,
  duration: number,
): ChannelState & { offset: CameraVec3; lookAt: CameraVec3; eye: CameraVec3 } {
  const pitch = clampPitch(channelValue(shot.pitch, start.pitch, clock, duration, "angle"));
  const yaw = channelValue(shot.yaw, start.yaw, clock, duration, "angle");
  const distance = Math.max(DISTANCE_FLOOR, channelValue(shot.distance, start.distance, clock, duration, "linear"));
  const roll = channelValue(shot.roll, start.roll, clock, duration, "angle");
  const fieldOfView = channelValue(shot.fieldOfView, start.fieldOfView, clock, duration, "linear");
  const offset = {
    x: lerpScalar(shot.offsetStart.x, shot.offsetEnd.x, shot.offsetEase, clock, duration),
    y: lerpScalar(shot.offsetStart.y, shot.offsetEnd.y, shot.offsetEase, clock, duration),
    z: lerpScalar(shot.offsetStart.z, shot.offsetEnd.z, shot.offsetEase, clock, duration),
  };
  const lookAt = add(origin, offset);
  const reach = distance * distanceScale(shot, fieldOfView);
  const cosPitch = Math.cos(pitch);
  const eye = {
    x: lookAt.x + reach * Math.sin(yaw) * cosPitch,
    y: lookAt.y - reach * Math.sin(pitch),
    z: lookAt.z + reach * Math.cos(yaw) * cosPitch,
  };
  return { pitch, yaw, distance, roll, fieldOfView, offset, lookAt, eye };
}

export function evalClip(shots: CompiledShot[], clock: number): CameraLivePose {
  const total = shots.reduce((sum, shot) => sum + Math.max(shot.duration, 0), 0);
  const notices = clipNotices(shots);
  let state: ChannelState = { pitch: 0, yaw: 0, distance: 0, roll: 0, fieldOfView: HANDOVER_FIELD_OF_VIEW };
  let offset: CameraVec3 = { x: 0, y: 0, z: 0 };
  let lookAt: CameraVec3 = { x: 0, y: 0, z: 0 };
  let eye = HANDOVER_EYE;
  let remaining = Math.max(0, clock);
  const pose = (
    shotIndex: number,
    shotClock: number,
    done: boolean,
    unsupported: CameraUnsupportedField | null,
  ): CameraLivePose => ({
    ...state,
    shotIndex,
    shotClock,
    clock: done ? total : clock,
    total,
    done,
    offset,
    lookAt,
    eye,
    notices,
    unsupported,
  });
  if (shots.length === 0) return pose(0, 0, true, null);

  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i];
    const unsupported = unsupportedField(shot, i);
    if (unsupported) return pose(i, 0, false, unsupported);
    const origin = targetOrigin(shot.positionTarget);
    const start = resolveShotStart(shot, i, state, eye, add(origin, shot.offsetStart));
    const duration = Math.max(shot.duration, 0);
    const span = duration === 0 ? Number.POSITIVE_INFINITY : duration;
    const atEnd = remaining >= span && Number.isFinite(span);
    const shotClock = atEnd ? span : remaining;
    const live = shotPose(shot, start, origin, shotClock, duration || 1);
    state = {
      pitch: live.pitch,
      yaw: live.yaw,
      distance: live.distance,
      roll: live.roll,
      fieldOfView: live.fieldOfView,
    };
    offset = live.offset;
    lookAt = live.lookAt;
    eye = live.eye;
    if (!atEnd) return pose(i, shotClock, false, null);
    remaining -= span;
  }
  const last = shots.length - 1;
  return pose(last, Math.max(shots[last].duration, 0), true, null);
}
