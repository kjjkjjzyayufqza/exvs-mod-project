import { describe, expect, it } from "vitest";
import {
  resolveMotionInstanceRenderState,
  shouldSyncPlaybackFrame,
} from "./motionInstancePipeline";

describe("resolveMotionInstanceRenderState", () => {
  it("keeps GPU motion skinning active for a playing non-active instance", () => {
    expect(
      resolveMotionInstanceRenderState({
        isActive: false,
        hasRuntime: true,
        poseEnabled: true,
        playing: true,
        hasMotionSample: true,
        skeletonBoneCount: 48,
        sampledBoneCount: 48,
      }),
    ).toEqual({
      motionPoseActive: true,
      gpuSkinningActive: true,
      boneEditingEnabled: false,
    });
  });

  it("returns the instance to rest pose when its motion pose is disabled", () => {
    expect(
      resolveMotionInstanceRenderState({
        isActive: true,
        hasRuntime: true,
        poseEnabled: false,
        playing: false,
        hasMotionSample: true,
        skeletonBoneCount: 48,
        sampledBoneCount: 48,
      }),
    ).toEqual({
      motionPoseActive: false,
      gpuSkinningActive: false,
      boneEditingEnabled: true,
    });
  });
});

describe("shouldSyncPlaybackFrame", () => {
  it("does not reset a playing model when only the active model selection changes", () => {
    const clip = {};
    expect(
      shouldSyncPlaybackFrame(
        { frame: 0, clip, poseEnabled: true },
        { frame: 0, clip, poseEnabled: true },
      ),
    ).toBe(false);
  });

  it("resets the playback cursor when returning to the skeleton rest pose", () => {
    const clip = {};
    expect(
      shouldSyncPlaybackFrame(
        { frame: 0, clip, poseEnabled: true },
        { frame: 0, clip, poseEnabled: false },
      ),
    ).toBe(true);
  });

  it("syncs explicit frame edits and clip changes", () => {
    const clip = {};
    expect(
      shouldSyncPlaybackFrame(
        { frame: 0, clip, poseEnabled: true },
        { frame: 12, clip, poseEnabled: true },
      ),
    ).toBe(true);
    expect(
      shouldSyncPlaybackFrame(
        { frame: 12, clip, poseEnabled: true },
        { frame: 12, clip: {}, poseEnabled: true },
      ),
    ).toBe(true);
  });
});
