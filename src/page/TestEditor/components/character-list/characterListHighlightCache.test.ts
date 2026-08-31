import { beforeEach, describe, expect, it } from "vitest";
import {
  loadCharacterListHighlights,
  normalizeCharacterHighlightFilePath,
  saveCharacterListHighlights,
} from "./characterListHighlightCache";

describe("characterListHighlightCache", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("normalizes windows and unix paths for the same file key", () => {
    expect(normalizeCharacterHighlightFilePath("E:\\XB\\mod\\character_list.bin")).toBe(
      "e:/xb/mod/character_list.bin",
    );
    expect(normalizeCharacterHighlightFilePath("E:/XB/mod/character_list.bin")).toBe(
      "e:/xb/mod/character_list.bin",
    );
  });

  it("persists character ids per file path across load/save", () => {
    const path = "E:/workspace/012list/character_list.bin";
    saveCharacterListHighlights(path, [1001001, 16001001]);
    expect(loadCharacterListHighlights(path)).toEqual([1001001, 16001001]);
    expect(loadCharacterListHighlights("E:\\workspace\\012list\\character_list.bin")).toEqual([
      1001001, 16001001,
    ]);
  });

  it("removes storage when the highlight set is empty", () => {
    const path = "E:/workspace/character_list.bin";
    saveCharacterListHighlights(path, [1001001]);
    saveCharacterListHighlights(path, []);
    expect(loadCharacterListHighlights(path)).toEqual([]);
    expect(
      window.localStorage.getItem("exvs2.characterList.entryHighlights:e:/workspace/character_list.bin"),
    ).toBeNull();
  });
});
