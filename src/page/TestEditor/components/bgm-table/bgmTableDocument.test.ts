import { describe, expect, it } from "vitest";
import { bgmEntryLabel, emptyBgmTableEntry, emptyBgmTableFields } from "./bgmTableDocument";

describe("bgmTableDocument", () => {
  it("treats a new row as empty until cue name and hashes exist", () => {
    expect(emptyBgmTableFields(emptyBgmTableEntry())).toEqual(["cueName", "cueHash", "cueLabelCrc"]);
  });

  it("labels rows by cue name when present", () => {
    expect(bgmEntryLabel({ ...emptyBgmTableEntry(), cueName: "vstg_battle_9004" })).toBe(
      "vstg_battle_9004",
    );
    expect(bgmEntryLabel({ ...emptyBgmTableEntry(), entryId: 0xBBF2FFFB })).toBe("0xBBF2FFFB");
  });
});
