import { describe, expect, it } from "vitest";
import type { CameraTableEntry } from "./cameraTableDocument";
import { filterCameraPacks, filterCameraTableEntries, findCameraPackForEntry, groupCameraPacks, buildCameraSequenceRows } from "./groupCameraPacks";

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

  it("keeps the full clip sequence when search matches one row id", () => {
    const entries = [
      shot({ entryIndex: 0, entryId: 0x08212b41, clipHash: 0x1a9f4211, sortKey: 1499, firstShot: 0 }),
      shot({ entryIndex: 1, entryId: 0x7f261bd7, clipHash: 0x1a9f4211, sortKey: 1498, firstShot: 0 }),
      shot({ entryIndex: 2, entryId: 0xe62f4a6d, clipHash: 0x1a9f4211, sortKey: 1497, firstShot: 3 }),
      shot({ entryIndex: 3, entryId: 0x00138306, clipHash: 0xfd5fd16a, sortKey: 10 }),
    ];
    const packs = filterCameraPacks(groupCameraPacks(entries), "e62f4a6d");
    expect(packs).toHaveLength(1);
    expect(packs[0]?.shots.map((item) => item.entryId)).toEqual([0xe62f4a6d, 0x7f261bd7, 0x08212b41]);
    const rows = buildCameraSequenceRows(packs);
    expect(rows.filter((row) => row.kind === "shot").map((row) => row.kind === "shot" && row.shotIndex)).toEqual([
      0, 1, 2,
    ]);
  });

  it("fuzzy-matches clip hash without using it as the list identity", () => {
    const entries = [
      shot({ entryIndex: 0, entryId: 0x000a3958, clipHash: 0x8ca6cc45, sortKey: 2 }),
      shot({ entryIndex: 1, entryId: 0x00138306, clipHash: 0xfd5fd16a, sortKey: 3 }),
    ];
    const byClip = filterCameraTableEntries(entries, "fd5fd");
    expect(byClip.map((entry) => entry.entryId)).toEqual([0x00138306]);
    const byIdBytes = filterCameraTableEntries(entries, "58 39 0a 00");
    expect(byIdBytes.map((entry) => entry.entryId)).toEqual([0x000a3958]);
    const found = findCameraPackForEntry(groupCameraPacks(entries), 1);
    expect(found?.pack.clipHash).toBe(0xfd5fd16a);
    expect(found?.shotIndex).toBe(0);
  });
});
