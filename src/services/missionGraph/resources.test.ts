import { describe, expect, it } from "vitest";

import { bgmEntriesToOptions, characterEntriesToUnitOptions, mergeMissionMapOptions, stageEntriesToMapOptions } from "./resources";

describe("character list names in the mission unit picker", () => {
  it("commits Character ID and keeps the suit name", () => {
    const [option] = characterEntriesToUnitOptions([
      { entryId: 1001001, characterName: "ガンダム", pilotNameShort: "アムロ", variantDisplayNameDefault: "" },
      { entryId: 0, characterName: "empty" },
    ]);
    expect(option.value).toBe(1001001);
    expect(option.label).toBe("ガンダム");
    expect(option.kind).toBe("unit");
    expect(option.keywords).toContain("アムロ");
    expect(option.keywords).toContain("1001001");
  });

  it("sorts unit ids from small to large", () => {
    const options = characterEntriesToUnitOptions([
      { entryId: 15001001, characterName: "ユニコーンガンダム" },
      { entryId: 1001001, characterName: "ガンダム" },
      { entryId: 2001001, characterName: "ザク" },
    ]);
    expect(options.map((option) => option.value)).toEqual([1001001, 2001001, 15001001]);
  });
});

describe("bgm list titles in the mission BGM picker", () => {
  it("commits cueHash and keeps musicId searchable", () => {
    const [option] = bgmEntriesToOptions([
      { cueHash: 0xa84a15f4, musicId: 12, title: "COLORS", titleWithNotePrefix: "\u266ACOLORS" },
      { cueHash: 0, musicId: 99, title: "empty" },
    ]);
    expect(option.value).toBe(0xa84a15f4);
    expect(option.label).toBe("COLORS");
    expect(option.keywords).toContain("12");
    expect(option.keywords?.toLowerCase()).toContain("0xa84a15f4");
  });
});

describe("stage list names in the mission map picker", () => {
  it("finds a stage-list display name and its pack hash without changing the mission hash", () => {
    const [option] = stageEntriesToMapOptions([
      { entryId: 0x7de1ccfe, recordLookupId: 0x1, name: "GVSチュートリアル", fileName: 0xfe67f4f9 },
    ]);
    expect(option.value).toBe(0x7de1ccfe);
    expect(option.label).toBe("GVSチュートリアル");
    expect(option.keywords?.toLowerCase()).toContain("gvsチュートリアル");
    expect(option.keywords?.toLowerCase()).toContain("0xfe67f4f9");
  });

  it("keeps Side 7's built-in label and still matches the stage-list name", () => {
    const merged = mergeMissionMapOptions(
      [{ kind: "map", value: 0xfe67f4f9, label: "Side 7 / サイド7", source: "builtin", evidence: "named" }],
      stageEntriesToMapOptions([
        { entryId: 0xfe67f4f9, recordLookupId: 0x1, name: "サイド7", fileName: 0x1111 },
        { entryId: 0x3e9fbd53, recordLookupId: 0x21, name: "ミンスリー", fileName: 0x8de71892 },
        { entryId: 0x7de1ccfe, recordLookupId: 0x1, name: "GVSチュートリアル", fileName: 0x2222 },
      ]),
    );
    const side7 = merged.find((option) => option.value === 0xfe67f4f9);
    const minsry = merged.find((option) => option.value === 0x3e9fbd53);
    const tutorial = merged.find((option) => option.label === "GVSチュートリアル");
    expect(side7?.label).toBe("Side 7 / サイド7");
    expect(minsry?.value).toBe(0x3e9fbd53);
    expect(merged.some((option) => option.value === 0x21)).toBe(false);
    expect(tutorial?.value).toBe(0x7de1ccfe);
  });
});
