import { describe, test, expect } from "vitest";
import {
  getHitVolume,
  boundingSphereRadius,
  describeSweepCoverage,
  verticalHitReach,
  groupVolumesByInteraction,
} from "./collisionGeometry";
import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

// A class-0 attack sphere: radius 6, center 10 forward, swept capsule, bone 3.
const SWEPT_ROW: TypedParamEntry = {
  entryId: 1,
  sphereRadius: 6,
  centerX: 0,
  centerY: 0,
  centerZ: 10,
  shapeMode: 1,
  interactionId: 0x3971b286,
  boneId: 3,
  modelHash: 0,
  collisionFlags: 0,
  hitType: 0,
};

const STATIC_ROW: TypedParamEntry = {
  ...SWEPT_ROW,
  entryId: 2,
  sphereRadius: 8,
  centerZ: 0,
  shapeMode: 0,
};

describe("getHitVolume", () => {
  test("maps the proven schema keys into a sphere", () => {
    const v = getHitVolume(SWEPT_ROW);
    expect(v.center).toEqual([0, 0, 10]);
    expect(v.sphereRadius).toBe(6);
    expect(v.shapeMode).toBe(1);
    expect(v.interactionId).toBe(0x3971b286);
    expect(v.boneId).toBe(3);
  });
});

describe("boundingSphereRadius", () => {
  test("is |center| + radius", () => {
    const v = getHitVolume(SWEPT_ROW);
    expect(boundingSphereRadius(v)).toBeCloseTo(16); // sqrt(0+0+100)+6
  });
});

describe("describeSweepCoverage", () => {
  test("swept row is flagged and names the off-sweep limit", () => {
    const c = describeSweepCoverage(getHitVolume(SWEPT_ROW));
    expect(c.isSwept).toBe(true);
    expect(c.diameter).toBe(12);
    expect(c.forwardReach).toBe(16);
    expect(c.summary).toMatch(/off-sweep|r_att \+ r_def/);
  });

  test("static row reports diameter and forward reach", () => {
    const c = describeSweepCoverage(getHitVolume(STATIC_ROW));
    expect(c.isSwept).toBe(false);
    expect(c.diameter).toBe(16);
    expect(c.forwardReach).toBe(8);
    expect(c.summary).toMatch(/Static sphere/);
  });
});

describe("verticalHitReach", () => {
  test("is r_att + r_def regardless of sweep", () => {
    expect(verticalHitReach(getHitVolume(SWEPT_ROW), 7)).toBe(13); // 6 + 7
    expect(verticalHitReach(getHitVolume(STATIC_ROW), 7)).toBe(15); // 8 + 7
  });
});

describe("groupVolumesByInteraction", () => {
  test("groups rows sharing an interaction FK", () => {
    const groups = groupVolumesByInteraction([SWEPT_ROW, STATIC_ROW]);
    // both carry the same interactionId FK
    expect(groups.get(0x3971b286)?.volumes.length).toBe(2);
  });
});
