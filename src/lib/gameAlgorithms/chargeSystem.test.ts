import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";
import {
  describeChargeInputFlags,
  getArmsChargeProfile,
  getChargeDurationForSelector,
  getChargeFullDurationForSelector,
} from "./chargeSystem";

function dynamesEntry(): TypedParamEntry {
  return {
    chargeInputFlags: 1,
    chargeStageCount: 2,
    chargeAccumulateDurationDefaultFrame: 180,
    chargeAccumulateDurationBaseFrame: 120,
    chargeAccumulateDurationMode1Scale: 0.75,
    chargeAccumulateDurationMode2Scale: 1,
    chargeAccumulateDurationMode3Scale: 1.25,
    chargeAccumulateDurationMode4Scale: 1.5,
    chargeAccumulateDurationMode5Scale: 2,
    chargeDecayDurationDefaultFrame: 60,
    chargeDecayDurationBaseFrame: 40,
    chargeDecayDurationMode1Scale: 0.5,
    chargeDecayDurationMode2Scale: 1,
    chargeDecayDurationMode3Scale: 1.5,
    chargeDecayDurationMode4Scale: 2,
    chargeDecayDurationMode5Scale: 2.5,
  };
}

describe("chargeSystem", () => {
  it("reads CSA, stage count, and both native duration families", () => {
    const profile = getArmsChargeProfile(dynamesEntry());

    expect(profile.inputFlags).toBe(1);
    expect(profile.stageCount).toBe(2);
    expect(getChargeDurationForSelector(profile.accumulate, 0)).toBe(180);
    expect(getChargeDurationForSelector(profile.accumulate, 1)).toBe(90);
    expect(getChargeDurationForSelector(profile.decay, 5)).toBe(100);
    expect(getChargeFullDurationForSelector(profile, 0)).toBe(360);
  });

  it("uses native half-up rounding for runtime selector modes", () => {
    const profile = getArmsChargeProfile({
      ...dynamesEntry(),
      chargeAccumulateDurationBaseFrame: 3,
      chargeAccumulateDurationMode1Scale: 0.5,
    });

    expect(getChargeDurationForSelector(profile.accumulate, 1)).toBe(2);
  });

  it("labels corpus-proven CSA and CSB flags without hiding native bit combinations", () => {
    expect(describeChargeInputFlags(1)).toBe("CSA (shooting CS)");
    expect(describeChargeInputFlags(2)).toBe("CSB (melee CS)");
    expect(describeChargeInputFlags(3)).toBe(
      "CSA (shooting CS) + CSB (melee CS)",
    );
  });
});
