import { describe, expect, it } from "vitest";
import type { CameraTableEntry } from "./cameraTableDocument";
import { groupCameraPacks } from "./groupCameraPacks";

function shot(partial: Partial<CameraTableEntry> & Pick<CameraTableEntry, "entryIndex" | "entryId" | "clipHash" | "sortKey">): CameraTableEntry {
  return {
    fov: 65,
    offset: 0,
    firstShot: 3,
    ...partial,
  };
}

describe("groupCameraPacks", () => {
  it("groups consecutive sort keys with the same clip hash into one pack", () => {
    const packs = groupCameraPacks([
      shot({ entryIndex: 0, entryId: 0x43e2cf6e, clipHash: 0x8ca6cc45, sortKey: 2, fov: 65, firstShot: 3 }),
      shot({ entryIndex: 1, entryId: 0x11111111, clipHash: 0x8ca6cc45, sortKey: 3, fov: null, firstShot: 0 }),
      shot({ entryIndex: 2, entryId: 0x22222222, clipHash: 0xfd5fd16a, sortKey: 1412, fov: 11, offset: -5.5 }),
      shot({ entryIndex: 3, entryId: 0x33333333, clipHash: 0xfd5fd16a, sortKey: 1413, fov: null, offset: 1 }),
    ]);

    expect(packs).toHaveLength(2);
    expect(packs[0]).toMatchObject({
      clipHash: 0x8ca6cc45,
      sortKeyStart: 2,
      sortKeyEnd: 3,
      consecutive: true,
    });
    expect(packs[0].shots).toHaveLength(2);
    expect(packs[1]).toMatchObject({
      clipHash: 0xfd5fd16a,
      sortKeyStart: 1412,
      sortKeyEnd: 1413,
      consecutive: true,
    });
    expect(packs[0].clipHash).not.toBe(packs[0].shots[0].entryId);
    expect(packs[1].clipHash).not.toBe(packs[1].shots[0].entryId);
  });

  it("marks a pack non-consecutive when sort keys skip", () => {
    const packs = groupCameraPacks([
      shot({ entryIndex: 0, entryId: 1, clipHash: 0xabc, sortKey: 10 }),
      shot({ entryIndex: 1, entryId: 2, clipHash: 0xabc, sortKey: 12 }),
    ]);
    expect(packs).toHaveLength(1);
    expect(packs[0].consecutive).toBe(false);
    expect(packs[0].sortKeyStart).toBe(10);
    expect(packs[0].sortKeyEnd).toBe(12);
  });
});
