import { describe, expect, it } from "vitest";

import {
  appendEntryEditorMeta,
  applyHexBytesToTypedEntry,
  buildTypedEntryFieldLayout,
  buildTypedEntryHexPreview,
  createBlankTypedParamEntry,
  createCopyAsNewTypedParamEntry,
  createInitialEntryEditorMeta,
  filterTypedParamEntryRows,
  formatHexPreviewEditText,
  markEntryEditorMetaDirty,
  parseHexPreviewEditText,
  readTypedEntryId,
  readTypedEntryLabels,
  sortTypedParamFileByUnsignedEntryId,
  removeEntryEditorMetaAt,
  shiftHighlightedEntryIndices,
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

describe("sortTypedParamFileByUnsignedEntryId", () => {
  it("orders entries by unsigned id so 0x75516B0D precedes 0x9ED6C1D4", () => {
    const data = createData([
      { entryId: 0x9ed6c1d4, mainEffectHash: 1 },
      { entryId: 0xe473bd36, mainEffectHash: 2 },
      { entryId: 0x75516b0d, mainEffectHash: 3 },
    ])
    const sorted = sortTypedParamFileByUnsignedEntryId(data)
    expect(sorted.entryIds).toEqual([0x75516b0d, 0x9ed6c1d4, 0xe473bd36])
    expect(sorted.entries.map((entry) => entry.mainEffectHash)).toEqual([3, 1, 2])
  })
})

describe("paramEntryUtils", () => {
  it("reads actionLabel then resourceLabel strings for list subtitles", () => {
    expect(
      readTypedEntryLabels({
        entryId: 0xb7027dbe,
        actionLabel: "SKL_MOVE",
        resourceLabel: "CHR_001GUNDAM_005GYAN00_001",
      }),
    ).toEqual({
      actionLabel: "SKL_MOVE",
      resourceLabel: "CHR_001GUNDAM_005GYAN00_001",
    });

    expect(
      readTypedEntryLabels({
        entryId: 1,
        actionLabelOffset: "  ACTION_ONLY  ",
        resourceLabelOffset: "",
      }),
    ).toEqual({
      actionLabel: "ACTION_ONLY",
      resourceLabel: null,
    });

    expect(readTypedEntryLabels({ entryId: 1, actionLabel: 0, resourceLabel: 0 })).toEqual({
      actionLabel: null,
      resourceLabel: null,
    });
  });

  it("decodes characterparam-style kind-7 offsets when file bytes are provided", async () => {
    const { obfEncodeFromUtf8String } = await import("@/utils/obfString");
    const actionEnc = obfEncodeFromUtf8String("SKL_CHAR");
    const resourceEnc = obfEncodeFromUtf8String("CHR_001GUNDAM_005GYAN00_001");
    const actionOffset = 16;
    const resourceOffset = 16 + actionEnc.length;
    const fileBytes = new Uint8Array(resourceOffset + resourceEnc.length + 4);
    fileBytes.set(actionEnc, actionOffset);
    fileBytes.set(resourceEnc, resourceOffset);

    expect(
      readTypedEntryLabels(
        {
          entryId: 0x1b12ae7d,
          actionLabelOffset: actionOffset,
          resourceLabelOffset: resourceOffset,
        },
        fileBytes,
      ),
    ).toEqual({
      actionLabel: "SKL_CHAR",
      resourceLabel: "CHR_001GUNDAM_005GYAN00_001",
    });

    // Without file bytes, numeric offsets alone do not become labels.
    expect(
      readTypedEntryLabels({
        entryId: 0x1b12ae7d,
        actionLabelOffset: actionOffset,
        resourceLabelOffset: resourceOffset,
      }),
    ).toEqual({
      actionLabel: null,
      resourceLabel: null,
    });
  });

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

  it("tracks entry editor metadata for badges and dirty state", () => {
    let meta = createInitialEntryEditorMeta(2);
    expect(meta).toEqual([
      { origin: "loaded", isDirty: false },
      { origin: "loaded", isDirty: false },
    ]);

    meta = appendEntryEditorMeta(meta, {
      origin: "copied",
      sourceEntryId: 0x100,
      sourceIndex: 0,
      isDirty: false,
    });
    expect(meta).toHaveLength(3);
    expect(meta[2]?.origin).toBe("copied");

    meta = markEntryEditorMetaDirty(meta, 0);
    expect(meta[0]?.isDirty).toBe(true);

    meta = removeEntryEditorMetaAt(meta, 1);
    expect(meta).toHaveLength(2);
    expect(meta[1]?.origin).toBe("copied");
  });

  it("reindexes highlighted entry indices after delete", () => {
    const highlighted = new Set([0, 2, 4]);
    expect(shiftHighlightedEntryIndices(highlighted, 2)).toEqual(new Set([0, 3]));
    expect(shiftHighlightedEntryIndices(highlighted, 0)).toEqual(new Set([1, 3]));
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

  it("round-trips hex edit text through field layout", () => {
    const data = createData([
      { entryId: 0x10, ammoCount: 0x12345678, damage: -2, speedRate: 1, bulletEffectHash: 0x41424344 },
    ]);
    const preview = buildTypedEntryHexPreview(data, 0);
    const layout = buildTypedEntryFieldLayout(data, 0);
    expect(preview).not.toBeNull();
    expect(layout).not.toBeNull();
    if (!preview || !layout) return;

    const editText = formatHexPreviewEditText(preview.bytes);
    expect(editText).toBe("78 56 34 12 FE FF FF FF 00 00 80 3F 44 43 42 41");

    const parsed = parseHexPreviewEditText(`${editText}\nAA BB`, preview.bytes.length + 2);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const nextEntry = applyHexBytesToTypedEntry(data.entries[0]!, layout, parsed.bytes);
    expect(nextEntry.ammoCount).toBe(0x12345678);
    expect(nextEntry.damage).toBe(-2);
    expect(nextEntry.speedRate).toBe(1);
    expect(nextEntry.bulletEffectHash).toBe(0x41424344);
  });

  it("keeps bulletSize aligned to field spec offset 0xE0", () => {
    const data: TypedParamFile = {
      header: {},
      fieldSpecs: [
        { kind: 1, entryOffset: 0xdc, hash: 0xa8987774 },
        { kind: 5, entryOffset: 0xe0, hash: 0xab606d9e },
        { kind: 5, entryOffset: 0xe4, hash: 0xabedc73a },
      ],
      entryIds: [1],
      entries: [
        {
          entryId: 1,
          ammoTypeHash: 1,
          bulletSize: 12.5,
          launchAngleHorizontal: 0,
        },
      ],
      trailingData: [],
    };

    const layout = buildTypedEntryFieldLayout(data, 0);
    expect(layout).toEqual([
      { key: "ammoTypeHash", offset: 0xdc, kind: 1 },
      { key: "bulletSize", offset: 0xe0, kind: 5 },
      { key: "launchAngleHorizontal", offset: 0xe4, kind: 5 },
    ]);
  });

  it("rejects hex edit text with the wrong byte count", () => {
    const parsed = parseHexPreviewEditText("FF 00", 4);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("Expected 4 bytes");
  });
});
