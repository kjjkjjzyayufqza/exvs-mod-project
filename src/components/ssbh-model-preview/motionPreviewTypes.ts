/** Matches Rust `ssbh_motion::MotionSample` (camelCase). */

export type MotionBoneLocal = {
  translation: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
};

export type MotionVisibilityRow = {
  meshNamePrefix: string;
  visible: boolean;
};

export type MotionMaterialTrack = {
  materialLabel: string;
  trackName: string;
  kind: string;
  value: unknown;
};

export type MotionCameraSample = {
  translation: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
  fovYRadians: number;
  nearClip: number;
  farClip: number;
};

export type MotionLightSample = {
  color: [number, number, number, number];
  direction: [number, number, number, number];
};

export type MotionLightingSample = {
  lightChr: MotionLightSample | null;
  lightStage: MotionLightSample[];
};

export type MotionSample = {
  frame: number;
  finalFrameIndex: number;
  boneLocals: MotionBoneLocal[];
  visibility: MotionVisibilityRow[];
  materialTracks: MotionMaterialTrack[];
  camera: MotionCameraSample | null;
  lighting: MotionLightingSample | null;
  elapsedMs: number;
};

export type MotionFrameSample = {
  boneLocals: MotionBoneLocal[];
  visibility: MotionVisibilityRow[];
  materialTracks: MotionMaterialTrack[];
  camera: MotionCameraSample | null;
  lighting: MotionLightingSample | null;
};

export type MotionClip = {
  finalFrameIndex: number;
  sampledFrameCount: number;
  frames: MotionFrameSample[];
};

export type NuanmbManifest = {
  filePath: string;
  majorVersion: number;
  minorVersion: number;
  finalFrameIndex: number;
  groupSummaries: {
    groupType: string;
    nodeCount: number;
    nodes: { name: string; trackNames: string[] }[];
  }[];
};
