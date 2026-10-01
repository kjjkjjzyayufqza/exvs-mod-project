import { describe, expect, test } from "vitest";

import { copyVerticalCubeFaces, isVerticalCubeFaceStrip } from "./ssbhTextureUpload";

describe("barispecular cube strip", () => {
  test("a six-face vertical strip is the cubemap layout", () => {
    expect(isVerticalCubeFaceStrip(512, 512 * 6, 512 * 512 * 4 * 6)).toBe(true);
    expect(isVerticalCubeFaceStrip(512, 512, 512 * 512 * 4)).toBe(false);
    expect(isVerticalCubeFaceStrip(2, 12, 2 * 2 * 4 * 6 - 1)).toBe(false);
  });

  test("faces are copied in strip order, top face first", () => {
    const width = 1;
    const rgba = new Uint8Array(24);
    for (let i = 0; i < 6; i += 1) {
      rgba[i * 4] = i + 1;
    }

    const faces = copyVerticalCubeFaces(rgba, width, width * 6);

    expect(faces).not.toBeNull();
    expect(faces).toHaveLength(6);
    expect(faces!.map((face) => face[0])).toEqual([1, 2, 3, 4, 5, 6]);
    rgba[0] = 99;
    expect(faces![0][0]).toBe(1);
  });
});
