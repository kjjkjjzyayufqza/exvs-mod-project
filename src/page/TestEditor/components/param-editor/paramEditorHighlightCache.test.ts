import { beforeEach, describe, expect, it } from "vitest";
import {
  loadParamEntryHighlights,
  normalizeParamHighlightFilePath,
  saveParamEntryHighlights,
} from "./paramEditorHighlightCache";

describe("paramEditorHighlightCache", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("normalizes windows and unix paths for the same file key", () => {
    expect(normalizeParamHighlightFilePath("E:\\XB\\mod\\speedparam.bin")).toBe(
      "e:/xb/mod/speedparam.bin",
    );
    expect(normalizeParamHighlightFilePath("E:/XB/mod/speedparam.bin")).toBe(
      "e:/xb/mod/speedparam.bin",
    );
  });

  it("persists entry ids per file path across load/save", () => {
    const path = "E:/workspace/040msc/unit/speedparam.bin";
    saveParamEntryHighlights(path, [0x7cd11119, 0x12345678]);
    expect(loadParamEntryHighlights(path)).toEqual([0x7cd11119, 0x12345678]);
    expect(loadParamEntryHighlights("E:\\workspace\\040msc\\unit\\speedparam.bin")).toEqual([
      0x7cd11119, 0x12345678,
    ]);
  });

  it("keeps highlights for different files isolated", () => {
    saveParamEntryHighlights("E:/a/speedparam.bin", [1]);
    saveParamEntryHighlights("E:/b/speedparam.bin", [2, 3]);
    expect(loadParamEntryHighlights("E:/a/speedparam.bin")).toEqual([1]);
    expect(loadParamEntryHighlights("E:/b/speedparam.bin")).toEqual([2, 3]);
  });

  it("removes storage when the highlight set is empty", () => {
    const path = "E:/workspace/characterparam.bin";
    saveParamEntryHighlights(path, [42]);
    saveParamEntryHighlights(path, []);
    expect(loadParamEntryHighlights(path)).toEqual([]);
    expect(
      window.localStorage.getItem("exvs2.paramEditor.entryHighlights:e:/workspace/characterparam.bin"),
    ).toBeNull();
  });

  it("returns empty for blank path or corrupt storage", () => {
    expect(loadParamEntryHighlights("")).toEqual([]);
    window.localStorage.setItem(
      "exvs2.paramEditor.entryHighlights:e:/bad.bin",
      "{not-json",
    );
    expect(loadParamEntryHighlights("E:/bad.bin")).toEqual([]);
  });
});
