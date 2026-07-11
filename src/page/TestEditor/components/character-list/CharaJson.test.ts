import { describe, expect, it } from "vitest";

import { parseCharaJsonImportPreview } from "./CharaJson";

describe("parseCharaJsonImportPreview", () => {
  it("accepts Test Editor export rows that use entryId", () => {
    const text = JSON.stringify([
      {
        entryId: 1001001,
        characterName: "ガンダム",
        indexInSeries: 0,
        selectorState: 1,
      },
      {
        entryId: 1002001,
        characterName: "ザク",
        indexInSeries: 1,
        selectorState: 1,
      },
    ]);

    const preview = parseCharaJsonImportPreview(text, "character_list.json");

    expect(preview.totalCount).toBe(2);
    expect(preview.validCount).toBe(2);
    expect(preview.invalidCount).toBe(0);
    expect(preview.ids).toEqual([1001001, 1002001]);
    expect(preview.rows[0]?.id).toBe(1001001);
    expect(preview.rows[0]?.characterName).toBe("ガンダム");
    expect(preview.rows[0]?.entryId).toBe(1001001);
  });

  it("accepts legacy id and CharacterId aliases", () => {
    const text = JSON.stringify([
      { id: 10, CharacterNameOffset: "A" },
      { CharacterId: 20, CharacterNameOffset: "B" },
    ]);

    const preview = parseCharaJsonImportPreview(text);

    expect(preview.validCount).toBe(2);
    expect(preview.ids).toEqual([10, 20]);
  });

  it("prefers entryId over id when both are present", () => {
    const text = JSON.stringify([{ entryId: 1001001, id: 999, characterName: "x" }]);

    const preview = parseCharaJsonImportPreview(text);

    expect(preview.validCount).toBe(1);
    expect(preview.rows[0]?.id).toBe(1001001);
  });

  it("reports zero valid entries when no id field is present", () => {
    const text = JSON.stringify([{ characterName: "missing-id" }, { foo: 1 }]);

    const preview = parseCharaJsonImportPreview(text);

    expect(preview.totalCount).toBe(2);
    expect(preview.validCount).toBe(0);
    expect(preview.invalidCount).toBe(2);
  });

  it("throws when root is not an array", () => {
    expect(() => parseCharaJsonImportPreview(JSON.stringify({ entries: [] }))).toThrow(
      "Invalid JSON: expected an array"
    );
  });
});
