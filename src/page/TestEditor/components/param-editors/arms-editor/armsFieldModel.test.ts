import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import {
  ARMS_FIELD_HASH_BY_KEY,
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
  isEnabled: 1,
  isContinuousFire: 0,
  isVernier: 1,
  isSuperArmor: 0,
  canMoveWhileFiring: 0,
  ammoCount: 8,
  damage: 75,
  startupFrame: 10,
  activeFrame: 20,
  recoveryFrame: 15,
  cooldownFrame: 30,
  totalDurationFrame: 80,
  reloadType: 2,
  reloadPerShotFrame: 180,
  reloadTimeTotal: 40,
  range: 120,
  actionLabelOffset: 0x1000,
} as TypedParamEntry;

describe("armsFieldModel", () => {
  it("covers all reload schema keys with known hashes", () => {
    for (const key of ARMS_RELOAD_SCHEMA_KEYS) {
      expect(ARMS_FIELD_HASH_BY_KEY[key]).toBeTypeOf("number");
    }
    expect(ARMS_FIELD_HASH_BY_KEY.ammoCount).toBe(0x4961274c);
    expect(ARMS_FIELD_HASH_BY_KEY.damageCorrectionRate).toBe(0x4a7796db);
  });

  it("builds property groups using only pool field keys", () => {
    const groups = buildArmsPropertyGroups();
    const keys = groups.flatMap((g) => g.fields.map((f) => f.key));
    expect(keys).toContain("ammoCount");
    expect(keys).toContain("damageCorrectionRate");
    expect(keys).not.toContain("damageCorrectionnRate");
    expect(keys).toContain("actionLabel");
    expect(keys).toContain("resourceLabel");
    expect(keys).not.toContain("actionLabelOffset");
    expect(keys).not.toContain("resourceLabelOffset");
    for (const key of keys) {
      expect(ARMS_FIELD_HASH_BY_KEY[key], key).toBeTypeOf("number");
    }
  });

  it("formats frames at 60 fps", () => {
    expect(formatFrames(180)).toBe("180f (3.00s)");
    expect(formatFrames(0)).toBe("0f");
  });

  it("builds overview stats and flag chips from entry", () => {
    const stats = buildArmsOverviewStats(sampleEntry);
    expect(stats.find((s) => s.key === "ammo")?.value).toBe(8);
    expect(stats.find((s) => s.key === "damage")?.value).toBe(75);

    const flags = getArmsFlagChips(sampleEntry);
    expect(flags.find((f) => f.key === "isEnabled")?.active).toBe(true);
    expect(flags.find((f) => f.key === "isVernier")?.active).toBe(true);
    expect(flags.find((f) => f.key === "isSuperArmor")?.active).toBe(false);
  });

  it("builds computed sections and schema rows", () => {
    const sections = buildArmsComputedSections(sampleEntry);
    expect(sections.find((s) => s.label === "Labels (decoded)")).toBeUndefined();
    const derived = sections.find((s) => s.label === "Derived (60 fps)");
    expect(derived?.values.some((v) => String(v.value).includes("180f"))).toBe(
      true,
    );

    const rows = buildArmsSchemaFieldRows(sampleEntry, ["ammoCount", "reloadPerShotFrame"]);
    expect(rows[0]).toMatchObject({
      hash: "0x4961274C",
      key: "ammoCount",
      value: "8",
    });
    expect(rows[1]?.value).toContain("180f");
  });

  it("reads numeric fields safely", () => {
    expect(numField(sampleEntry, "ammoCount")).toBe(8);
    expect(numField(sampleEntry, "missing")).toBe(0);
  });
});
