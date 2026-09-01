import { describe, expect, it } from "vitest";
import { bgmEntryLabel, emptyBgmTableEntry, emptyBgmTableFields } from "./bgmTableDocument";

describe("bgmTableDocument", () => {
  it("treats a new row as empty until cueHash and cueLabelCrc exist", () => {
    expect(emptyBgmTableFields(emptyBgmTableEntry())).toEqual(["cueHash", "cueLabelCrc"]);
    expect(
      emptyBgmTableFields({
        ...emptyBgmTableEntry(),
        entryId: 0xBBF2FFFB,
        cueLabelCrc: 0x5E89B634,
      }),
    ).toEqual([]);
  });

  it("labels rows by cue name when present", () => {
    expect(bgmEntryLabel({ ...emptyBgmTableEntry(), cueName: "vstg_battle_9004" })).toBe(
      "vstg_battle_9004",
    );
    expect(bgmEntryLabel({ ...emptyBgmTableEntry(), entryId: 0xBBF2FFFB })).toBe("0xBBF2FFFB");
  });
});
