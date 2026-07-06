import { describe, expect, it } from "vitest";
import { advanceMotionFrame, sampleMotionClipFrame } from "./motionPlaybackMath";
import type { MotionClip } from "./motionPreviewTypes";

describe("advanceMotionFrame", () => {
  it("advances by delta * 60 * speed", () => {
    const r = advanceMotionFrame(0, 1 / 60, 1, 100, true);
    expect(r.nextFrame).toBeCloseTo(1, 5);
    expect(r.shouldStopPlayback).toBe(false);
  });

  it("clamps to max when not looping", () => {
    const r = advanceMotionFrame(9, 1, 1, 10, false);
    expect(r.nextFrame).toBe(10);
    expect(r.shouldStopPlayback).toBe(true);
  });

  it("wraps using ssbh_wgpu finalFrameIndex semantics", () => {
    const r = advanceMotionFrame(10, 1 / 60, 1, 10, true);
    expect(r.nextFrame).toBeCloseTo(1, 5);
    expect(r.shouldStopPlayback).toBe(false);
  });

  it("does not stop before end when not looping", () => {
    const r = advanceMotionFrame(5, 1 / 60, 1, 100, false);
    expect(r.shouldStopPlayback).toBe(false);
  });
});

describe("sampleMotionClipFrame", () => {
  const clip: MotionClip = {
    finalFrameIndex: 2,
    sampledFrameCount: 3,
    compatibility: {
      skeletonBoneCount: 1,
      animationTransformNodeCount: 1,
      matchedBoneCount: 1,
    },
    frames: [
      {
        boneLocals: [{ translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }],
        visibility: [{ meshNamePrefix: "A", visible: false }],
        materialTracks: [{ materialLabel: "M", trackName: "X", kind: "float", value: 0 }],
        camera: null,
        lighting: null,
      },
      {
        boneLocals: [{ translation: [1, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }],
        visibility: [{ meshNamePrefix: "A", visible: true }],
        materialTracks: [{ materialLabel: "M", trackName: "X", kind: "float", value: 1 }],
        camera: null,
        lighting: null,
      },
      {
        boneLocals: [{ translation: [2, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }],
        visibility: [{ meshNamePrefix: "A", visible: false }],
        materialTracks: [{ materialLabel: "M", trackName: "X", kind: "float", value: 2 }],
        camera: null,
        lighting: null,
      },
    ],
  };

  it("interpolates sampled frames with fractional input", () => {
    const s = sampleMotionClipFrame(clip, 0.51, false);
    expect(s.boneLocals[0]?.translation[0]).toBeCloseTo(0.51, 5);
    expect(s.visibility[0]?.visible).toBe(false);
  });

  it("clamps when not looping", () => {
    const s = sampleMotionClipFrame(clip, 99, false);
    expect(s.boneLocals[0]?.translation[0]).toBe(2);
  });

  it("wraps when looping", () => {
    const s = sampleMotionClipFrame(clip, 3.1, true);
    expect(s.boneLocals[0]?.translation[0]).toBeCloseTo(1.1, 5);
  });

  it("interpolates bone locals between sampled frames", () => {
    const s = sampleMotionClipFrame(clip, 0.5, false);
    expect(s.boneLocals[0]?.translation[0]).toBeCloseTo(0.5, 5);
    expect(s.visibility[0]?.visible).toBe(false);
  });

  it("supports the fractional tail of a non-integer finalFrameIndex", () => {
    const loopClip: MotionClip = {
      finalFrameIndex: 1.5,
      sampledFrameCount: 3,
      compatibility: {
        skeletonBoneCount: 1,
        animationTransformNodeCount: 1,
        matchedBoneCount: 1,
      },
      frames: [
        {
          boneLocals: [{ translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] }],
          visibility: [],
          materialTracks: [],
          camera: {
            translation: [0, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [1, 1, 1],
            fovYRadians: 1,
            nearClip: 0.1,
            farClip: 100,
          },
          lighting: null,
        },
        {
          boneLocals: [{ translation: [10, 0, 0], rotation: [0, 0, 0, 1], scale: [2, 2, 2] }],
          visibility: [],
          materialTracks: [],
          camera: {
            translation: [10, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [2, 2, 2],
            fovYRadians: 2,
            nearClip: 1,
            farClip: 200,
          },
          lighting: null,
        },
        {
          boneLocals: [{ translation: [20, 0, 0], rotation: [0, 0, 0, 1], scale: [3, 3, 3] }],
          visibility: [],
          materialTracks: [],
          camera: {
            translation: [20, 0, 0],
            rotation: [0, 0, 0, 1],
            scale: [3, 3, 3],
            fovYRadians: 3,
            nearClip: 2,
            farClip: 300,
          },
          lighting: null,
        },
      ],
    };

    const s = sampleMotionClipFrame(loopClip, 1.25, true);
    expect(s.boneLocals[0]?.translation[0]).toBeCloseTo(12.5, 5);
    expect(s.boneLocals[0]?.scale[0]).toBeCloseTo(2.25, 5);
    expect(s.camera?.translation[0]).toBeCloseTo(12.5, 5);
    expect(s.camera?.fovYRadians).toBeCloseTo(2.25, 5);
  });
});
