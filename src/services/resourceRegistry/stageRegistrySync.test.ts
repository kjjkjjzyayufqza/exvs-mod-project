import { describe, expect, it } from "vitest";
import {
  buildStageRegistryEntries,
  buildRegistryEntryFromStageHash,
  defaultStageSlotSeed,
  findStageRegistryEntriesByEntryId,
  formatStageEntryIdNote,
  lookupSeedByHashLoose,
  resolveStageSlotSeeds,
  sanitizeStageSeedBase,
} from "./stageRegistrySync";
import type { MergedRegistryEntry } from "./types";
import { buildRegistryEntryFromSeed } from "./types";

describe("stageRegistrySync", () => {
  it("formats and finds entries by stage entryId note", () => {
    const entryId = 2111950096;
    const note = formatStageEntryIdNote(entryId);
    const row: MergedRegistryEntry = {
      ...buildRegistryEntryFromSeed({
        category: "stage",
        slot: "fileName",
        seed: "minecraft_world_1",
        notes: note,
      }),
      sourceLayer: "workspace",
    };
    const other: MergedRegistryEntry = {
      ...buildRegistryEntryFromSeed({
        category: "stage",
        slot: "fileName",
        seed: "other",
        notes: "stage entryId=1",
      }),
      sourceLayer: "global",
    };
    const hits = findStageRegistryEntriesByEntryId([row, other], entryId);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.seed).toBe("minecraft_world_1");
  });

  it("builds one registry row per resolved slot", () => {
    const entries = buildStageRegistryEntries(
      {
        entryId: 74,
        name: "Minecraft World 1",
        recordLookupId: 0,
        randomSelectWeightDefault: 0,
        randomSelectWeightAlt: 0,
        unk0x0c: 0,
        seriesAltGroupId: 0,
        unk0x14: 0,
        vsSD: 100,
        fileName: 200,
        selectOrderAlt: 0,
        vsSL: 300,
        seriesDefaultGroupId: 0,
        unk0x34: 0,
        unk0x38: 0,
        selectOrderDefault: 0,
        vsSn: 400,
        iconIndex: 0,
      },
      [
        {
          slot: "fileName",
          seed: "stage_a",
          hashInt32: 200,
          seedVerified: false,
        },
        {
          slot: "vsSD",
          seed: "stage_b",
          hashInt32: 100,
          seedVerified: false,
        },
      ],
    );
    expect(entries).toHaveLength(2);
    expect(entries.every((row) => row.notes === formatStageEntryIdNote(74))).toBe(true);
    expect(entries[0]?.displayName).toContain("Minecraft World 1");
  });

  it("falls back to generated seeds when registry has no match", () => {
    const stage = {
      entryId: 2111950096,
      name: "Minecraft World 1",
      recordLookupId: 0,
      randomSelectWeightDefault: 0,
      randomSelectWeightAlt: 0,
      unk0x0c: 0,
      seriesAltGroupId: 0,
      unk0x14: 0,
      vsSD: 100,
      fileName: 200,
      selectOrderAlt: 0,
      vsSL: 300,
      seriesDefaultGroupId: 0,
      unk0x34: 0,
      unk0x38: 0,
      selectOrderDefault: 0,
      vsSn: 400,
      iconIndex: 0,
    };
    const slots = resolveStageSlotSeeds(stage, [], {});
    expect(slots).toHaveLength(4);
    expect(slots[0]?.seed).toBe(defaultStageSlotSeed(stage, "fileName"));
    expect(slots.every((row) => row.hashInt32 > 0)).toBe(true);
    expect(slots.every((row) => !row.seedVerified)).toBe(true);
  });

  it("reuses registry seed from another stage slot with same hash", () => {
    const sharedHash = 200;
    const known: MergedRegistryEntry = {
      ...buildRegistryEntryFromStageHash({
        category: "stage",
        slot: "vsSD",
        hashInt32: sharedHash,
        seed: "shared_stage_seed",
      }),
      sourceLayer: "global",
    };
    const slots = resolveStageSlotSeeds(
      {
        entryId: 1,
        name: "Test",
        recordLookupId: 0,
        randomSelectWeightDefault: 0,
        randomSelectWeightAlt: 0,
        unk0x0c: 0,
        seriesAltGroupId: 0,
        unk0x14: 0,
        vsSD: 0,
        fileName: sharedHash,
        selectOrderAlt: 0,
        vsSL: 0,
        seriesDefaultGroupId: 0,
        unk0x34: 0,
        unk0x38: 0,
        selectOrderDefault: 0,
        vsSn: 0,
        iconIndex: 0,
      },
      [known],
      {},
    );
    expect(slots).toHaveLength(1);
    expect(slots[0]?.seed).toBe("shared_stage_seed");
    expect(slots[0]?.seedVerified).toBe(false);
  });

  it("sanitizes stage names for default seed labels", () => {
    expect(sanitizeStageSeedBase("Minecraft World 1")).toBe("minecraft_world_1");
    expect(lookupSeedByHashLoose([], 1, "fileName")).toBeUndefined();
  });
});
