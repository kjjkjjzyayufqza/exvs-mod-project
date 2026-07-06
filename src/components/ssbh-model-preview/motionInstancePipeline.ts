export type MotionInstanceRenderInput = {
  isActive: boolean;
  hasRuntime: boolean;
  poseEnabled: boolean;
  playing: boolean;
  hasMotionSample: boolean;
  skeletonBoneCount: number;
  sampledBoneCount: number;
};

export type MotionInstanceRenderState = {
  motionPoseActive: boolean;
  gpuSkinningActive: boolean;
  boneEditingEnabled: boolean;
};

export type MotionPlaybackFrameObservation = {
  frame: number;
  clip: object | null;
  poseEnabled: boolean;
};

export function shouldSyncPlaybackFrame(
  previous: MotionPlaybackFrameObservation | null,
  next: MotionPlaybackFrameObservation,
): boolean {
  return (
    previous === null ||
    previous.clip !== next.clip ||
    Math.abs(previous.frame - next.frame) >= 1e-6 ||
    (previous.poseEnabled && !next.poseEnabled)
  );
}

export function resolveMotionInstanceRenderState(
  input: MotionInstanceRenderInput,
): MotionInstanceRenderState {
  const compatibleSample =
    input.hasMotionSample &&
    input.skeletonBoneCount > 0 &&
    input.sampledBoneCount === input.skeletonBoneCount;
  const motionPoseActive = input.poseEnabled && (input.playing || compatibleSample);

  return {
    motionPoseActive,
    gpuSkinningActive: input.hasRuntime && motionPoseActive,
    boneEditingEnabled: input.isActive && !motionPoseActive,
  };
}
