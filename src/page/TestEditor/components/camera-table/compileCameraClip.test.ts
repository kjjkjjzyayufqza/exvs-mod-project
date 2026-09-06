import { describe, expect, it } from "vitest";
import { remapEase, compileShot } from "./compileCameraClip";
import type { CameraFieldSpec, CameraTableEntry } from "./cameraTableDocument";
import { CAM_CMD } from "./cameraCommandHashes";
import { writeCameraFieldFloat, writeCameraFieldUint } from "./cameraTableDocument";

function spec(hash: number, entryOffset: number, kind: number): CameraFieldSpec {
  return { hash, entryOffset, flags: 0, kind };
}

describe("remapEase", () => {
  it("matches sub_1405DDA50", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(remapEase)).toEqual([0, 0, 1, 2, 6, 7, 8, 0]);
  });
});

describe("compileShot", () => {
  it("converts pitch degrees to radians and copies NaN v1 from v0", () => {
    const specs: CameraFieldSpec[] = [
      spec(CAM_CMD.duration, 0x28, 5),
      spec(CAM_CMD.offset, 0xa0, 5),
      spec(CAM_CMD.nuanmb, 0x90, 1),
      spec(CAM_CMD.pitchMode, 0xd8, 1),
      spec(CAM_CMD.pitchV0, 0x14, 5),
      spec(CAM_CMD.pitchV1, 0xc8, 5),
      spec(CAM_CMD.pitchV2, 0x70, 5),
      spec(CAM_CMD.pitchV3, 0x58, 5),
      spec(CAM_CMD.yawMode, 0x88, 1),
      spec(CAM_CMD.yawV0, 0x10, 5),
      spec(CAM_CMD.yawV1, 0x9c, 5),
      spec(CAM_CMD.yawV2, 0x74, 5),
      spec(CAM_CMD.yawV3, 0x84, 5),
      spec(CAM_CMD.fovMode, 0xcc, 1),
      spec(CAM_CMD.fovV0, 0x40, 5),
      spec(CAM_CMD.fovV1, 0x7c, 5),
      spec(CAM_CMD.fovV2, 0xb8, 5),
      spec(CAM_CMD.fovV3, 0xc4, 5),
      spec(CAM_CMD.ch3Mode, 0x50, 1),
      spec(CAM_CMD.ch3V0, 0x38, 5),
      spec(CAM_CMD.ch3V1, 0x60, 5),
      spec(CAM_CMD.ch3V2, 0xb4, 5),
      spec(CAM_CMD.ch3V3, 0xbc, 5),
      spec(CAM_CMD.ch4Mode, 0xc0, 1),
      spec(CAM_CMD.ch4V0, 0x00, 5),
      spec(CAM_CMD.ch4V1, 0x04, 5),
      spec(CAM_CMD.ch4V2, 0x48, 5),
      spec(CAM_CMD.ch4V3, 0x80, 5),
    ];
    let raw = new Array(220).fill(0);
    raw = writeCameraFieldFloat(raw, 0x28, 40);
    raw = writeCameraFieldFloat(raw, 0xa0, 1);
    raw = writeCameraFieldFloat(raw, 0x14, -20);
    raw = writeCameraFieldFloat(raw, 0xc8, Number.NaN);
    raw = writeCameraFieldFloat(raw, 0x70, Number.NaN);
    raw = writeCameraFieldFloat(raw, 0x58, Number.NaN);
    raw = writeCameraFieldUint(raw, 0xd8, 3);
    raw = writeCameraFieldFloat(raw, 0x40, 40);
    raw = writeCameraFieldFloat(raw, 0x7c, Number.NaN);
    const entry: CameraTableEntry = {
      entryId: 1,
      entryIndex: 0,
      clipHash: 0x0291c2b9,
      sortKey: 781,
      fov: 40,
      offset: 1,
      firstShot: 3,
    };
    const shot = compileShot(raw, specs, entry);
    expect(shot.duration).toBe(40);
    expect(shot.pitch.v1Authored).toBe(0);
    expect(shot.pitch.nanV0).toBe(0);
    expect(shot.pitch.v0).toBeCloseTo((-20 * Math.PI) / 180, 5);
    expect(shot.pitch.v1).toBeCloseTo(shot.pitch.v0, 5);
    expect(shot.pitch.v2).toBe(0);
    expect(shot.pitch.ease).toBe(2);
    expect(shot.fov.v0).toBe(40);
    expect(shot.fov.v1).toBe(40);
  });
});
