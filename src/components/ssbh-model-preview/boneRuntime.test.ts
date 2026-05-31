import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  applyLocalPoseToObjects,
  createGpuSkeletonRuntime,
  updateGpuSkeletonWorld,
} from "./boneRuntime";
import type { SkelDataJson } from "./types";

describe("createGpuSkeletonRuntime", () => {
  it("builds skeleton and inverses from a simple hierarchy", () => {
    const skel: SkelDataJson = {
      bones: [
        {
          name: "Root",
          transform: [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
          ],
          parent_index: null,
          billboard_type: null,
        },
        {
          name: "Child",
          transform: [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [1, 0, 0, 1],
          ],
          parent_index: 0,
          billboard_type: null,
        },
      ],
    };

    const runtime = createGpuSkeletonRuntime(skel);
    expect(runtime.bones.length).toBe(2);
    expect(runtime.skeleton.bones.length).toBe(2);
    expect(runtime.skeleton.boneInverses.length).toBe(2);
    expect(runtime.restLocals.length).toBe(2);
  });

  it("treats negative parent index as root and keeps child attached during motion", () => {
    const skel: SkelDataJson = {
      bones: [
        {
          name: "Root",
          transform: [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
          ],
          parent_index: -1,
          billboard_type: null,
        },
        {
          name: "Child",
          transform: [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [1, 0, 0, 1],
          ],
          parent_index: 0,
          billboard_type: null,
        },
      ],
    };

    const runtime = createGpuSkeletonRuntime(skel);
    applyLocalPoseToObjects(runtime.bones, [
      {
        translation: [5, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      {
        translation: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    ]);
    updateGpuSkeletonWorld(runtime);

    const childWorld = new Vector3();
    runtime.bones[1]?.getWorldPosition(childWorld);
    expect(childWorld.x).toBeCloseTo(5, 6);
    expect(runtime.rootBones).toContain(runtime.bones[0]!);
  });
});

