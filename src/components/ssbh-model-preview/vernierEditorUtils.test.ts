import { describe, expect, it } from "vitest";

import type { TypedParamFile } from "@/page/TestEditor/components/param-editor/typedParamTypes";
import { cloneVernierData, isVernierDraftDirty } from "./vernierEditorUtils";

function file(): TypedParamFile {
  return {
    header: { entryCount: 1, commandsCount: 1, entrySize: 4 },
    fieldSpecs: [{ hash: 0x21ffcd00, kind: 1, entryOffset: 0 }],
    entryIds: [10],
    entries: [{ entryId: 10, is_loop: 1 }],
    trailingData: [],
  };
}

describe("cloneVernierData", () => {
  it("produces an independent deep copy", () => {
    const base = file();
    const copy = cloneVernierData(base);
    copy.entries[0].is_loop = 0;
    expect(base.entries[0].is_loop).toBe(1);
    expect(copy.entries[0].is_loop).toBe(0);
  });
});

describe("isVernierDraftDirty", () => {
  it("is false for equal data and true after an edit", () => {
    const base = file();
    expect(isVernierDraftDirty(base, cloneVernierData(base))).toBe(false);

    const draft = cloneVernierData(base);
    draft.entries[0].is_loop = 0;
    expect(isVernierDraftDirty(base, draft)).toBe(true);
  });

  it("detects entry add/remove", () => {
    const base = file();
    const added = cloneVernierData(base);
    added.entries.push({ entryId: 11, is_loop: 0 });
    added.entryIds.push(11);
    expect(isVernierDraftDirty(base, added)).toBe(true);
  });
});
