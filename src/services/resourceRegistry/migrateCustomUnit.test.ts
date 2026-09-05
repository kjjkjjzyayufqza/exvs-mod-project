import { describe, expect, it } from "vitest";
import { buildRegistryDocumentFromCustomUnitJson } from "./migrateCustomUnit";

const customUnitFixture = JSON.stringify([
  {
    id: 900000000,
    name: "Delta Kai",
    gameName: "026gnbelt_003delatkai_001",
    modelName: "026gnbelt_003delatkai_001",
    aleoName: "026gnbelt_003delatkai_001_eff",
    nu3bankName: "026gnbelt_003delatkai_001_sound",
    ammoName: "026gnbelt_003delatkai_001_param",
    mscName: "026gnbelt_003delatkai_001_msc",
    animeName: "026gnbelt_003delatkai_001_motion",
    Model: -1571248862,
    Effect: -193844023,
    Sound: 1414542720,
    Param: 136612493,
    Msc: -1111592982,
    Motion: -230704377,
  },
  {
    id: 900000001,
    name: "Strike Freedom",
    gameName: "900bldrpe_001strkfr_001",
    modelName: "900bldrpe_001strkfr_001_model",
    aleoName: "900bldrpe_001strkfr_001_eff",
    nu3bankName: "900bldrpe_001strkfr_001_sound",
    ammoName: "900bldrpe_001strkfr_001_param",
    mscName: "900bldrpe_001strkfr_001_msc",
    animeName: "900bldrpe_001strkfr_001_motion",
    Model: 756776000,
    Effect: -1413018815,
    Sound: 33606941,
    Param: 1584689680,
    Msc: -502577054,
    Motion: 2094466054,
  },
]);

describe("migrateCustomUnit", () => {
  it("builds twelve unit slot entries from a custom_unit array", () => {
    const { doc, warnings } = buildRegistryDocumentFromCustomUnitJson(customUnitFixture);
    expect(doc.version).toBe(1);
    expect(doc.entries).toHaveLength(12);
    expect(doc.entries.every((row) => row.category === "unit")).toBe(true);
    expect(warnings).toEqual([]);
    const deltaKaiModel = doc.entries.find(
      (row) => row.slot === "model" && row.seed === "026gnbelt_003delatkai_001",
    );
    expect(deltaKaiModel?.hashInt32).toBe(-1571248862);
  });
});
