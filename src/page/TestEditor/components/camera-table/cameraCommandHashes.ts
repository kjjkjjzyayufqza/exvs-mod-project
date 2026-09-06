/** Disk command hashes consumed by sub_1405DC540 / 5DC150 (OB vsac27). */

export const CAM_CMD = {
  duration: 0x42acfe7d,
  firstShot: 0x4af79689,
  fovV0: 0x749b8f0e,
  clipHash: 0x980abfa6,
  offset: 0xd20f0173,
  sortKey: 0xe52f114d,
  nuanmb: 0xc488848f,
  pitchMode: 0xfd0c46c8,
  pitchV0: 0x215e1f85,
  pitchV1: 0xec55ce76,
  pitchV2: 0x9dabe9ff,
  pitchV3: 0x90cae2fb,
  yawMode: 0xc06c6f78,
  yawV0: 0x1c3e3635,
  yawV1: 0xd135e7c6,
  yawV2: 0xa0cbc04f,
  yawV3: 0xadaacb4b,
  fovMode: 0xf0cf0d20,
  fovV1: 0xa84ceffb,
  fovV2: 0xe7eeefbf,
  fovV3: 0xeb8fd535,
  ch3Mode: 0x87cc15a8,
  ch3V0: 0x5b9e4ce5,
  ch3V1: 0x96959d16,
  ch3V2: 0xe76bba9f,
  ch3V3: 0xea0ab19b,
  ch4Mode: 0xea409385,
  ch4V0: 0x00836396,
  ch4V1: 0x01ee59b8,
  ch4V2: 0x7c1c4f1b,
  ch4V3: 0xab3dfdd0,
} as const;

export type CameraCommandName = keyof typeof CAM_CMD;

export function cameraCommandName(hash: number): CameraCommandName | null {
  const want = hash >>> 0;
  for (const [name, value] of Object.entries(CAM_CMD) as [CameraCommandName, number][]) {
    if ((value >>> 0) === want) return name;
  }
  return null;
}

export function cameraCommandHash(name: string): number | null {
  if (name in CAM_CMD) return CAM_CMD[name as CameraCommandName] >>> 0;
  return null;
}

export const EASE_REMAP = [0, 0, 1, 2, 6, 7, 8] as const;

export const PITCH_CLAMP_RAD = 1.48353;
export const FOV_FLOOR = 1e-4;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const TICKS_PER_SECOND = 60;
