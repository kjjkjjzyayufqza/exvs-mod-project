import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import {
  ARMS_FIELD_HASH_BY_KEY,
  ARMS_CHARGE_SCHEMA_KEYS,
  ARMS_RELOAD_SCHEMA_KEYS,
  buildArmsComputedSections,
  buildArmsOverviewStats,
  buildArmsPropertyGroups,
  buildArmsSchemaFieldRows,
  formatFrames,
  getArmsFlagChips,
  numField,
} from "./armsFieldModel";

const sampleEntry = {
  entryId: 0x4961274c,
  ammoCount: 8,
  initialAmmoCount: 0,
  slotIndex: 2,
  behaviorFlags: 6,
  reloadBehaviorType: 2,
  reloadGroupBEnabled: 1,
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
  chargeDecayDurationBaseFrame: 60,
  chargeDecayDurationMode1Scale: 0.5,
  chargeDecayDurationMode2Scale: 1,
  chargeDecayDurationMode3Scale: 1.5,
  chargeDecayDurationMode4Scale: 2,
  chargeDecayDurationMode5Scale: 2.5,
  reloadAuxGroupA: 0,
  reloadDurationGroupADefault: 180,
  reloadDurationGroupAMode1: 120,
  reloadDurationGroupAMode2: 180,
  reloadDurationGroupAMode3: 180,
  reloadDurationGroupAMode4: 180,
  reloadDurationGroupAMode5: 180,
  reloadAuxGroupB: 0,
  reloadDurationGroupBDefault: 270,
  reloadDurationGroupBMode1: 180,
  reloadDurationGroupBMode2: 60,
  reloadDurationGroupBMode3: 180,
  reloadDurationGroupBMode4: 180,
  reloadDurationGroupBMode5: 180,
  actionLabelOffset: 0x1000,
} as TypedParamEntry;

describe("armsFieldModel", () => {
  it("covers all native charge and reload keys with their hashes", () => {
    for (const key of [...ARMS_RELOAD_SCHEMA_KEYS, ...ARMS_CHARGE_SCHEMA_KEYS]) {
      expect(ARMS_FIELD_HASH_BY_KEY[key]).toBeTypeOf("number");
    }
    expect(ARMS_FIELD_HASH_BY_KEY.ammoCount).toBe(0x4961274c);
    expect(ARMS_FIELD_HASH_BY_KEY.initialAmmoCount).toBe(0x4e692acd);
    expect(ARMS_FIELD_HASH_BY_KEY.slotIndex).toBe(0xab9aef6c);
    expect(ARMS_FIELD_HASH_BY_KEY.reloadBehaviorType).toBe(0xac243293);
    expect(ARMS_FIELD_HASH_BY_KEY.chargeInputFlags).toBe(0x596fc1c3);
    expect(ARMS_FIELD_HASH_BY_KEY.chargeStageCount).toBe(0x4c527468);
  });

  it("builds property groups using canonical pool keys only", () => {
    const groups = buildArmsPropertyGroups();
    const keys = groups.flatMap((group) => group.fields.map((item) => item.key));
    expect(keys).toContain("ammoCount");
    expect(keys).toContain("initialAmmoCount");
    expect(keys).toContain("slotIndex");
    expect(keys).toContain("reloadDurationGroupADefault");
    expect(keys).toContain("chargeInputFlags");
    expect(keys).toContain("chargeStageCount");
    expect(keys).toContain("chargeAccumulateDurationDefaultFrame");
    expect(keys).toContain("chargeDecayDurationDefaultFrame");
    expect(keys).toContain("field11dee0c8");
    expect(keys).not.toContain("downValue");
    expect(keys).not.toContain("damage");
    expect(keys).not.toContain("overheatFrame");
    expect(keys).not.toContain("selectorValueADefault");
    expect(keys).toContain("actionLabel");
    expect(keys).toContain("resourceLabel");
    for (const key of keys) {
      expect(ARMS_FIELD_HASH_BY_KEY[key], key).toBeTypeOf("number");
    }
  });

  it("formats frames at 60 fps", () => {
    expect(formatFrames(180)).toBe("180f (3.00s)");
    expect(formatFrames(0)).toBe("0f");
  });

  it("builds native overview stats and raw flag chips", () => {
    const stats = buildArmsOverviewStats(sampleEntry);
    expect(stats.find((item) => item.key === "capacity")?.value).toBe(8);
    expect(stats.find((item) => item.key === "initial")?.value).toBe(0);
    expect(stats.find((item) => item.key === "group-b-default")?.value).toBe(270);
    expect(stats.find((item) => item.key === "charge-full")?.value).toBe(360);

    const flags = getArmsFlagChips(sampleEntry);
    expect(flags.find((item) => item.key === "behaviorBit0")?.active).toBe(false);
    expect(flags.find((item) => item.key === "behaviorBit1")?.active).toBe(true);
    expect(flags.find((item) => item.key === "behaviorBit2")?.active).toBe(true);
    expect(flags.find((item) => item.key === "reloadGroupBEnabled")?.active).toBe(true);
  });

  it("builds evidence sections and canonical schema rows", () => {
    const sections = buildArmsComputedSections(sampleEntry);
    const evidence = sections.find((section) => section.label === "Native evidence");
    expect(evidence?.values.some((item) => String(item.value).includes("180f"))).toBe(true);
    expect(evidence?.values.some((item) => String(item.value).includes("CSA"))).toBe(true);

    const rows = buildArmsSchemaFieldRows(sampleEntry, [
      "ammoCount",
      "reloadDurationGroupADefault",
      "chargeAccumulateDurationMode1Scale",
    ]);
    expect(rows[0]).toMatchObject({
      hash: "0x4961274C",
      key: "ammoCount",
      value: "8",
    });
    expect(rows[1]).toMatchObject({
      hash: "0xA502BCF2",
      key: "reloadDurationGroupADefault",
    });
    expect(rows[1]?.value).toContain("180f");
    expect(rows[2]).toMatchObject({
      hash: "0x3BC65821",
      key: "chargeAccumulateDurationMode1Scale",
      value: "0.7500",
    });
  });

  it("reads numeric fields safely", () => {
    expect(numField(sampleEntry, "ammoCount")).toBe(8);
    expect(numField(sampleEntry, "missing")).toBe(0);
  });
});
