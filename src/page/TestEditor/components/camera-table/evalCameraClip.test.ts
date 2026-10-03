import { describe, expect, it } from "vitest";
import type { CameraVec3, CompiledChannel, CompiledShot } from "./compileCameraClip";
import { easeKernel, evalClip, framingDistance } from "./evalCameraClip";

const DEG = Math.PI / 180;

function channel(partial: Partial<CompiledChannel> & Pick<CompiledChannel, "v0">): CompiledChannel {
  return {
    v1Authored: 0,
    v1: partial.v0,
    v2: 0,
    v3: 0,
    ease: 0,
    nanV0: 0,
    ...partial,
  };
}

function shot(partial: Partial<CompiledShot> & Pick<CompiledShot, "duration">): CompiledShot {
  const zero: CameraVec3 = { x: 0, y: 0, z: 0 };
  return {
    entryIndex: 0,
    firstShot: 0,
    nuanmb: 0,
    positionTarget: 2,
    orientationTarget: 3,
    frameMode: 0,
    distanceScale: 0,
    offsetStart: zero,
    offsetEnd: zero,
    offsetEase: 0,
    pitch: channel({ v0: 0 }),
    yaw: channel({ v0: 0 }),
    distance: channel({ v0: 40 }),
    roll: channel({ v0: 0 }),
    fieldOfView: channel({ v0: 45 }),
    ...partial,
  };
}

/** Frozen 0x0291C2B9 4-shot compile (POC dump 2026-09-05). */
function fixture0291c2b9(): CompiledShot[] {
  return [
    shot({
      entryIndex: 0,
      duration: 40,
      firstShot: 3,
      offsetStart: { x: 0, y: 1, z: 0 },
      offsetEnd: { x: 0, y: 1, z: 0 },
      pitch: channel({ v0: -0.3490658700466156 }),
      yaw: channel({ v0: -1.0471975803375244 }),
      distance: channel({ v0: 40 }),
      roll: channel({ v0: 0, nanV0: 1 }),
      fieldOfView: channel({ v0: 60, v1: 30, v1Authored: 1, ease: 2 }),
    }),
    shot({
      entryIndex: 1,
      duration: 40,
      pitch: channel({ v0: -0.1745329350233078 }),
      yaw: channel({ v0: 0.5235987901687622, v1: 0.6981317400932312, v1Authored: 1, ease: 2 }),
      distance: channel({ v0: 40 }),
      roll: channel({ v0: 0, nanV0: 1 }),
      fieldOfView: channel({ v0: 40, v1: 30, v1Authored: 1, ease: 2 }),
    }),
    shot({
      entryIndex: 2,
      duration: 50,
      pitch: channel({ v0: -1.0471975803375244, v1: 0, v1Authored: 1, ease: 2 }),
      yaw: channel({ v0: 0, ease: 2 }),
      distance: channel({ v0: 40, ease: 2 }),
      roll: channel({ v0: 0, nanV0: 1 }),
      fieldOfView: channel({ v0: 80, v1: 40, v1Authored: 1, ease: 2 }),
    }),
    shot({
      entryIndex: 3,
      duration: 570,
      pitch: channel({ v0: 0, v1: 0.1745329350233078, v1Authored: 1, ease: 2, nanV0: 1 }),
      yaw: channel({ v0: 0, v1: -0.40142571926116943, v1Authored: 1, ease: 2, nanV0: 1 }),
      distance: channel({ v0: 40, ease: 2 }),
      roll: channel({ v0: 0, nanV0: 1 }),
      fieldOfView: channel({ v0: 43.5, v1: 30, v1Authored: 1, ease: 2, nanV0: 1 }),
    }),
  ];
}

/** 0.5 - 0.5 cos(pi b): the cosine ease sub_14030BC60 / BBA0 / BAF0 apply to their Bezier value b. */
const cosineEase = (b: number) => 0.5 - 0.5 * Math.cos(Math.PI * b);

describe("easeKernel", () => {
  it("matches sub_14030B900 kernels 0-8 at mid-span", () => {
    expect(easeKernel(0, 20, 40)).toBeCloseTo(0.5, 6);
    expect(easeKernel(1, 20, 40)).toBeCloseTo(1 - Math.cos(Math.PI / 4), 6);
    expect(easeKernel(2, 20, 40)).toBeCloseTo(Math.sin(Math.PI / 4), 6);
    expect(easeKernel(3, 20, 40)).toBeCloseTo(0.5, 6);
    expect(easeKernel(4, 20, 40)).toBeCloseTo(Math.cos(Math.PI / 4), 6);
    expect(easeKernel(5, 20, 40)).toBeCloseTo(1 - Math.sin(Math.PI / 4), 6);
    expect(easeKernel(6, 20, 40)).toBeCloseTo(0.5, 6);
    // Bezier (0, 0, 0.2, 1) at 0.5 = 0.2; Bezier (0, 0.8, 1, 1) at 0.5 = 0.8.
    expect(easeKernel(7, 20, 40)).toBeCloseTo(cosineEase(0.2), 6);
    expect(easeKernel(8, 20, 40)).toBeCloseTo(cosineEase(0.8), 6);
  });

  it("finishes kernel 8 (authored 6) by 70% of the span, so a long shot holds still at its end", () => {
    expect(easeKernel(8, 70, 100)).toBeGreaterThan(0.98);
    expect(easeKernel(6, 70, 100)).toBeLessThan(0.9);
  });
});

describe("evalClip 0x0291C2B9", () => {
  const shots = fixture0291c2b9();

  it("holds shot 0 pitch / yaw / distance and lerps the field of view", () => {
    const start = evalClip(shots, 0);
    expect(start.shotIndex).toBe(0);
    expect(start.pitch).toBeCloseTo(-0.34906587, 5);
    expect(start.yaw).toBeCloseTo(-1.04719758, 5);
    expect(start.distance).toBe(40);
    expect(start.offset.y).toBe(1);
    expect(start.fieldOfView).toBe(60);

    const mid = evalClip(shots, 20);
    expect(mid.shotIndex).toBe(0);
    expect(mid.pitch).toBeCloseTo(-0.34906587, 5);
    expect(mid.fieldOfView).toBeCloseTo(60 + (30 - 60) * Math.sin(Math.PI / 4), 5);
  });

  it("uses shot 1's own offset 0 and starts it at clock 40", () => {
    const pose = evalClip(shots, 40);
    expect(pose.shotIndex).toBe(1);
    expect(pose.shotClock).toBe(0);
    expect(pose.offset.y).toBe(0);
    expect(pose.pitch).toBeCloseTo(-0.174532935, 5);
    expect(pose.yaw).toBeCloseTo(0.52359879, 5);
  });

  it("angle-lerps shot 1 yaw with ease 2", () => {
    const pose = evalClip(shots, 60);
    expect(pose.shotIndex).toBe(1);
    const t = Math.sin(Math.PI / 4);
    expect(pose.yaw).toBeCloseTo(0.52359879 + (0.69813174 - 0.52359879) * t, 5);
  });

  it("continues NaN starts on shot 3 from where shot 2 ends", () => {
    const endShot2 = evalClip(shots, 130);
    expect(endShot2.shotIndex).toBe(3);
    expect(endShot2.shotClock).toBe(0);
    expect(endShot2.pitch).toBeCloseTo(0, 5);
    expect(endShot2.yaw).toBeCloseTo(0, 5);
    expect(endShot2.fieldOfView).toBeCloseTo(40, 5);

    const midShot3 = evalClip(shots, 130 + 285);
    expect(midShot3.shotIndex).toBe(3);
    const t = Math.sin(Math.PI / 4);
    expect(midShot3.pitch).toBeCloseTo(0.174532935 * t, 5);
    expect(midShot3.fieldOfView).toBeCloseTo(40 + (30 - 40) * t, 5);
  });

  it("reports clip total 700", () => {
    const pose = evalClip(shots, 700);
    expect(pose.done).toBe(true);
    expect(pose.total).toBe(700);
    expect(pose.shotIndex).toBe(3);
  });
});

describe("evalClip pose (sub_140645240)", () => {
  it("puts the eye at distance along (sin yaw cos pitch, -sin pitch, cos yaw cos pitch) from the look-at", () => {
    const banshee = { x: 0, y: 10, z: -300 };
    const pose = evalClip(
      [shot({ duration: 60, offsetStart: banshee, offsetEnd: banshee, pitch: channel({ v0: -5 * DEG }) })],
      0,
    );
    expect(pose.lookAt).toEqual(banshee);
    expect(pose.eye.x).toBeCloseTo(0, 6);
    expect(pose.eye.y).toBeCloseTo(10 + 40 * Math.sin(5 * DEG), 6);
    expect(pose.eye.z).toBeCloseTo(-300 + 40 * Math.cos(5 * DEG), 6);
  });

  it("puts a positive yaw on the unit's right (+X)", () => {
    const pose = evalClip([shot({ duration: 60, yaw: channel({ v0: 70 * DEG }) })], 0);
    expect(pose.eye.x).toBeGreaterThan(pose.lookAt.x);
  });

  it("eases the look-at offset from start to end", () => {
    const pose = evalClip(
      [
        shot({
          duration: 100,
          offsetStart: { x: 0, y: 10, z: -300 },
          offsetEnd: { x: 0, y: 14, z: 325 },
          offsetEase: 8,
        }),
      ],
      50,
    );
    const weight = cosineEase(0.8);
    expect(pose.offset.y).toBeCloseTo(10 + 4 * weight, 5);
    expect(pose.offset.z).toBeCloseTo(-300 + 625 * weight, 4);
  });

  it("keeps the eye still across a cut whose pitch / yaw / distance start NaN", () => {
    const shots = [
      shot({
        duration: 100,
        offsetStart: { x: 0, y: 10, z: -300 },
        offsetEnd: { x: 0, y: 10, z: -300 },
        pitch: channel({ v0: -2 * DEG }),
        distance: channel({ v0: 55, v1: 760, v1Authored: 1, ease: 8 }),
      }),
      shot({
        duration: 150,
        offsetStart: { x: 0, y: 14, z: 325 },
        offsetEnd: { x: 0, y: 14, z: 325 },
        pitch: channel({ v0: 0, v1: -12 * DEG, v1Authored: 1, nanV0: 1 }),
        yaw: channel({ v0: 0, v1: -70 * DEG, v1Authored: 1, nanV0: 1 }),
        distance: channel({ v0: 0, v1: 160, v1Authored: 1, nanV0: 1 }),
      }),
    ];
    const before = evalClip(shots, 99.999);
    const after = evalClip(shots, 100);
    expect(after.shotIndex).toBe(1);
    expect(after.eye.x).toBeCloseTo(before.eye.x, 1);
    expect(after.eye.y).toBeCloseTo(before.eye.y, 1);
    expect(after.eye.z).toBeCloseTo(before.eye.z, 1);
  });

  it("multiplies the distance by the framing distance when 0xF7CB1B33 is 1", () => {
    const pose = evalClip(
      [shot({ duration: 60, distanceScale: 1, distance: channel({ v0: 1.1 }), fieldOfView: channel({ v0: 40 }) })],
      0,
    );
    expect(pose.eye.z - pose.lookAt.z).toBeCloseTo(1.1 * framingDistance(40), 6);
    expect(framingDistance(40)).toBeCloseTo(28 / 3 / Math.tan(20 * DEG), 6);
  });
});

describe("evalClip notices", () => {
  it("reports an origin the preview does not model instead of guessing a pose", () => {
    const pose = evalClip([shot({ duration: 60, positionTarget: 9 })], 0);
    expect(pose.unsupported).toEqual({ field: "positionTarget", value: 9, shotIndex: 0 });
  });

  it("flags clip kinds 1 / 2 (stage ray checks) and first-shot NaN starts", () => {
    const pose = evalClip([shot({ duration: 60, firstShot: 1, fieldOfView: channel({ v0: 0, nanV0: 1 }) })], 0);
    expect(pose.notices).toEqual(["handoverStart", "stageChecks"]);
    expect(pose.fieldOfView).toBe(45);
  });
});
