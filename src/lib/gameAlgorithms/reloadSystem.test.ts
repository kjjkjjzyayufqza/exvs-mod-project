import { describe, expect, it } from "vitest";
import {
  RELOAD_BEHAVIOR_TYPE_LABELS,
  getArmsReloadProfile,
  getReloadDurationForSelector,
} from "./reloadSystem";

describe("native armsparam reload model", () => {
  it("labels the six native reload state-machine branches", () => {
    expect(Object.keys(RELOAD_BEHAVIOR_TYPE_LABELS)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(RELOAD_BEHAVIOR_TYPE_LABELS[2]).toContain("step refill");
    expect(RELOAD_BEHAVIOR_TYPE_LABELS[4]).toContain("+1 on full charge");
  });

  it("reads capacity, initial count, slot, and native duration groups", () => {
    const profile = getArmsReloadProfile({
      ammoCount: 8,
      initialAmmoCount: 0,
      slotIndex: 2,
      behaviorFlags: 6,
      reloadBehaviorType: 2,
      reloadGroupBEnabled: 1,
      reloadAuxGroupA: 10,
      reloadDurationGroupADefault: 180,
      reloadDurationGroupAMode1: 181,
      reloadDurationGroupAMode2: 182,
      reloadDurationGroupAMode3: 183,
      reloadDurationGroupAMode4: 184,
      reloadDurationGroupAMode5: 185,
      reloadAuxGroupB: 20,
      reloadDurationGroupBDefault: 270,
      reloadDurationGroupBMode1: 271,
      reloadDurationGroupBMode2: 272,
      reloadDurationGroupBMode3: 273,
      reloadDurationGroupBMode4: 274,
      reloadDurationGroupBMode5: 275,
    });

    expect(profile).toMatchObject({
      ammoCount: 8,
      initialAmmoCount: 0,
      slotIndex: 2,
      behaviorFlags: 6,
      reloadBehaviorType: 2,
      reloadGroupBEnabled: true,
    });
    expect(getReloadDurationForSelector(profile.groupA, 0)).toBe(180);
    expect(getReloadDurationForSelector(profile.groupA, 3)).toBe(183);
    expect(getReloadDurationForSelector(profile.groupB, 5)).toBe(275);
  });
});
