import { describe, expect, it } from "vitest";
import type { CompiledChannel, CompiledShot } from "./compileCameraClip";
import {
  cameraWorldPosition,
  easeKernel,
  evalClip,
  PREVIEW_LOOKAT_RADIUS,
  previewOrbitRadius,
} from "./evalCameraClip";

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

/** Frozen 0x0291C2B9 4-shot compile (POC dump 2026-09-05). */
function fixture0291c2b9(): CompiledShot[] {
  return [
    {
      entryIndex: 0,
      duration: 40,
      firstShot: 3,
      nuanmb: 0,
      offset: 1,
      offsetNan: false,
      pitch: channel({ v0: -0.3490658700466156 }),
      yaw: channel({ v0: -1.0471975803375244 }),
      fov: channel({ v0: 40 }),
      ch3: channel({ v0: 0, nanV0: 1 }),
      ch4: channel({ v0: 60, v1: 30, v1Authored: 1, ease: 2 }),
    },
    {
      entryIndex: 1,
      duration: 40,
      firstShot: 0,
      nuanmb: 0,
      offset: 0,
      offsetNan: false,
      pitch: channel({ v0: -0.1745329350233078 }),
      yaw: channel({
        v0: 0.5235987901687622,
        v1: 0.6981317400932312,
        v1Authored: 1,
        ease: 2,
      }),
      fov: channel({ v0: 40 }),
      ch3: channel({ v0: 0, nanV0: 1 }),
      ch4: channel({ v0: 40, v1: 30, v1Authored: 1, ease: 2 }),
    },
    {
      entryIndex: 2,
      duration: 50,
      firstShot: 0,
      nuanmb: 0,
      offset: 0,
      offsetNan: false,
      pitch: channel({
        v0: -1.0471975803375244,
        v1: 0,
        v1Authored: 1,
        ease: 2,
      }),
      yaw: channel({ v0: 0, ease: 2 }),
      fov: channel({ v0: 40, ease: 2 }),
      ch3: channel({ v0: 0, nanV0: 1 }),
      ch4: channel({ v0: 80, v1: 40, v1Authored: 1, ease: 2 }),
    },
    {
      entryIndex: 3,
      duration: 570,
      firstShot: 0,
      nuanmb: 0,
      offset: 0,
      offsetNan: false,
      pitch: channel({
        v0: 0,
        v1: 0.1745329350233078,
        v1Authored: 1,
        ease: 2,
        nanV0: 1,
      }),
      yaw: channel({
        v0: 0,
        v1: -0.40142571926116943,
        v1Authored: 1,
        ease: 2,
        nanV0: 1,
      }),
      fov: channel({ v0: 40, ease: 2 }),
      ch3: channel({ v0: 0, nanV0: 1 }),
      ch4: channel({ v0: 43.5, v1: 30, v1Authored: 1, ease: 2, nanV0: 1 }),
    },
  ];
}

describe("easeKernel", () => {
  it("matches 30B900 cases 0-3 and 6-7 at mid-span", () => {
    expect(easeKernel(0, 20, 40)).toBeCloseTo(0.5, 6);
    expect(easeKernel(1, 20, 40)).toBeCloseTo(1 - Math.cos(Math.PI / 4), 6);
    expect(easeKernel(2, 20, 40)).toBeCloseTo(Math.sin(Math.PI / 4), 6);
    expect(easeKernel(3, 20, 40)).toBeCloseTo(0.5, 6);
    expect(easeKernel(6, 20, 40)).toBeCloseTo(0.5, 6);
    expect(easeKernel(7, 20, 40)).toBeCloseTo(0.5, 6);
  });
});

describe("evalClip 0x0291C2B9", () => {
  const shots = fixture0291c2b9();

  it("holds shot 0 pitch/yaw/FOV and lerps ch4", () => {
    const start = evalClip(shots, 0);
    expect(start.shotIndex).toBe(0);
    expect(start.pitch).toBeCloseTo(-0.34906587, 5);
    expect(start.yaw).toBeCloseTo(-1.04719758, 5);
    expect(start.fov).toBe(40);
    expect(start.offset).toBe(1);
    expect(start.ch4).toBe(60);

    const mid = evalClip(shots, 20);
    expect(mid.shotIndex).toBe(0);
    expect(mid.pitch).toBeCloseTo(-0.34906587, 5);
    expect(mid.ch4).toBeCloseTo(60 + (30 - 60) * Math.sin(Math.PI / 4), 5);
  });

  it("inherits offset 0 after shot 0 and starts shot 1 at clock 40", () => {
    const pose = evalClip(shots, 40);
    expect(pose.shotIndex).toBe(1);
    expect(pose.shotClock).toBe(0);
    expect(pose.offset).toBe(1);
    expect(pose.pitch).toBeCloseTo(-0.174532935, 5);
    expect(pose.yaw).toBeCloseTo(0.52359879, 5);
  });

  it("angle-lerps shot 1 yaw with ease 2", () => {
    const pose = evalClip(shots, 60);
    expect(pose.shotIndex).toBe(1);
    const t = Math.sin(Math.PI / 4);
    expect(pose.yaw).toBeCloseTo(0.52359879 + (0.69813174 - 0.52359879) * t, 5);
  });

  it("inherits nanV0 pitch on shot 3 from shot 2 end", () => {
    const endShot2 = evalClip(shots, 130);
    expect(endShot2.shotIndex).toBe(3);
    expect(endShot2.shotClock).toBe(0);
    expect(endShot2.pitch).toBeCloseTo(0, 5);
    expect(endShot2.ch4).toBeCloseTo(40, 5);

    const midShot3 = evalClip(shots, 130 + 285);
    expect(midShot3.shotIndex).toBe(3);
    const t = Math.sin(Math.PI / 4);
    expect(midShot3.pitch).toBeCloseTo(0.174532935 * t, 5);
    expect(midShot3.ch4).toBeCloseTo(40 + (30 - 40) * t, 5);
  });

  it("reports clip total 700", () => {
    const pose = evalClip(shots, 700);
    expect(pose.done).toBe(true);
    expect(pose.total).toBe(700);
    expect(pose.shotIndex).toBe(3);
  });
});

describe("cameraWorldPosition", () => {
  const lookAt = { x: 0, y: 2, z: 0 };

  it("uses a stand-in radius so authored offset 0 is not inside the dummy", () => {
    const pose = { pitch: 0, yaw: 0, offset: 0 };
    const world = cameraWorldPosition(lookAt, pose);
    expect(world.x).toBeCloseTo(0, 6);
    expect(world.y).toBeCloseTo(2, 6);
    expect(world.z).toBeCloseTo(PREVIEW_LOOKAT_RADIUS, 6);
  });

  it("adds signed word40 as a dolly, including negative win-tick offsets", () => {
    expect(previewOrbitRadius(-5.5)).toBeCloseTo(PREVIEW_LOOKAT_RADIUS - 5.5, 6);
    const world = cameraWorldPosition(lookAt, { pitch: 0, yaw: 0, offset: -5.5 });
    expect(world.z).toBeCloseTo(PREVIEW_LOOKAT_RADIUS - 5.5, 6);
    expect(world.z).toBeGreaterThan(3.5);
  });

  it("places positive pitch below the look-at so the camera looks up", () => {
    const pitch = 0.3;
    const world = cameraWorldPosition(lookAt, { pitch, yaw: 0, offset: 0 });
    const radius = previewOrbitRadius(0);
    expect(world.y).toBeCloseTo(lookAt.y - radius * Math.sin(pitch), 6);
    expect(world.y).toBeLessThan(lookAt.y);
  });

  it("scales the stand-in orbit by preview view zoom without using offset as FOV", () => {
    expect(previewOrbitRadius(0, 2)).toBeCloseTo(PREVIEW_LOOKAT_RADIUS / 2, 6);
    expect(previewOrbitRadius(0, 0)).toBeCloseTo(PREVIEW_LOOKAT_RADIUS, 6);
    const far = cameraWorldPosition(lookAt, { pitch: 0, yaw: 0, offset: 0 }, 1);
    const near = cameraWorldPosition(lookAt, { pitch: 0, yaw: 0, offset: 0 }, 2);
    expect(near.z).toBeCloseTo(far.z / 2, 6);
  });

  it("puts 0x9AC77769 shot 0 below and left after the preview Y invert", () => {
    const origin = { x: 0, y: 2.2, z: 0 };
    const pitch = (30.6 * Math.PI) / 180;
    const yaw = (-146 * Math.PI) / 180;
    const world = cameraWorldPosition(origin, { pitch, yaw, offset: 15.2 });
    expect(world.y).toBeLessThan(origin.y);
    expect(world.x).toBeLessThan(origin.x);
  });
});
