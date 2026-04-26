import { describe, expect, it } from "vitest";

import {
  buildTypedEntryHexPreview,
  createBlankTypedParamEntry,
  createCopyAsNewTypedParamEntry,
  filterTypedParamEntryRows,
  readTypedEntryId,
} from "./paramEntryUtils";
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes";

function createData(entries: TypedParamEntry[]): TypedParamFile {
  return {
    header: {},
    fieldSpecs: [
      { kind: 1, entryOffset: 0 },
      { kind: 2, entryOffset: 4 },
      { kind: 5, entryOffset: 8 },
      { kind: 1, entryOffset: 12 },
    ],
    entryIds: entries.map((entry, index) => readTypedEntryId(entry, index)),
    entries,
    trailingData: [],
  };
}

describe("paramEntryUtils", () => {
  it("filters entries by index, id, field name, decimal value, and hex value", () => {
    const data = createData([
      { entryId: 0x100, ammoCount: 12, damage: 80, speedRate: 1.5 },
      { entryId: 0x200, ammoCount: 4, damage: 120, bulletEffectHash: 0x89abcdef },
    ]);

    expect(filterTypedParamEntryRows(data.entries, "0x00000200").map((row) => row.index)).toEqual([1]);
    expect(filterTypedParamEntryRows(data.entries, "#0").map((row) => row.index)).toEqual([0]);
    expect(filterTypedParamEntryRows(data.entries, "bullet effect").map((row) => row.index)).toEqual([1]);
    expect(filterTypedParamEntryRows(data.entries, "120").map((row) => row.index)).toEqual([1]);
    expect(filterTypedParamEntryRows(data.entries, "89 ab cd ef").map((row) => row.index)).toEqual([1]);
  });

  it("copies an entry as a new row with the next entry id", () => {
    const entries = [
      { entryId: 10, ammoCount: 12, damage: 80 },
      { entryId: 20, ammoCount: 4, damage: 120 },
    ];

    const created = createCopyAsNewTypedParamEntry(entries, 0);

    expect(created).toEqual({ entryId: 21, ammoCount: 12, damage: 80 });
    expect(created).not.toBe(entries[0]);
  });

  it("creates a blank entry that preserves the selected entry shape", () => {
    const entries = [
      { entryId: 10, name: "beam", enabled: true, unk: null, ammoCount: 12, speedRate: 1.5 },
    ];

    const created = createBlankTypedParamEntry(entries, 0);

    expect(created).toEqual({
      entryId: 11,
      name: "",
      enabled: false,
      unk: null,
      ammoCount: 0,
      speedRate: 0,
    });
  });

  it("builds a little-endian hex preview with offsets and ascii text", () => {
    const data = createData([
      { entryId: 0x10, ammoCount: 0x12345678, damage: -2, speedRate: 1, bulletEffectHash: 0x41424344 },
    ]);

    const preview = buildTypedEntryHexPreview(data, 0);

    expect(preview).not.toBeNull();
    if (!preview) return;
    expect(preview.bytes).toEqual([
      0x78, 0x56, 0x34, 0x12,
      0xfe, 0xff, 0xff, 0xff,
      0x00, 0x00, 0x80, 0x3f,
      0x44, 0x43, 0x42, 0x41,
    ]);
    expect(preview.rows).toEqual([
      {
        offset: "00000000",
        hex: "78 56 34 12 FE FF FF FF 00 00 80 3F 44 43 42 41",
        ascii: "xV4........?DCBA",
      },
    ]);
  });
});
