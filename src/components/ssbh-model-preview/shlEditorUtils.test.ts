import { describe, expect, it } from "vitest";

import type { ShlFileData, ShlRecord } from "./shlIoService";
import {
  assertShlValidForSave,
  buildFolderModelIdMap,
  cloneShlFileData,
  formatModelIdLe,
  isShlDraftDirty,
  parseModelIdLe,
  shlModelTypeLabel,
} from "./shlEditorUtils";

function record(over: Partial<ShlRecord> = {}): ShlRecord {
  return { modelId: 0, modelType: 0, folderIndex: 0, unk1: 0, slotIndex: 0, ...over };
}

function file(records: ShlRecord[]): ShlFileData {
  return { version: 100, reserved08: 0, records, trailingData: [] };
}

describe("formatModelIdLe / parseModelIdLe", () => {
  it("formats a u32 as little-endian byte order (as stored on disk)", () => {
    // Real sample: model_id value 0x90BDF6A5 is stored as bytes A5 F6 BD 90.
    expect(formatModelIdLe(0x90bdf6a5)).toBe("A5F6BD90");
  });

  it("round-trips through parse", () => {
    for (const v of [0, 1, 0x90bdf6a5, 0xffffffff, 0x12345678]) {
      expect(parseModelIdLe(formatModelIdLe(v))).toBe(v >>> 0);
    }
  });

  it("rejects non-hex and empty input", () => {
    expect(() => parseModelIdLe("")).toThrow();
    expect(() => parseModelIdLe("xyz")).toThrow();
  });
});

describe("shlModelTypeLabel", () => {
  it("labels known types and flags unknown ones", () => {
    expect(shlModelTypeLabel(0)).toContain("Body");
    expect(shlModelTypeLabel(2)).toContain("Assist");
    expect(shlModelTypeLabel(3)).toContain("Part");
    expect(shlModelTypeLabel(9)).toContain("Unknown (9)");
  });
});

describe("isShlDraftDirty", () => {
  it("is false for equal documents and true after a field change", () => {
    const base = file([record({ modelId: 0x90bdf6a5, modelType: 0 })]);
    expect(isShlDraftDirty(base, cloneShlFileData(base))).toBe(false);

    const draft = cloneShlFileData(base);
    draft.records[0].modelType = 3;
    expect(isShlDraftDirty(base, draft)).toBe(true);
  });

  it("detects record add/remove and version changes", () => {
    const base = file([record({ modelType: 0 })]);
    const added = cloneShlFileData(base);
    added.records.push(record({ modelType: 3, folderIndex: 1 }));
    expect(isShlDraftDirty(base, added)).toBe(true);

    const versioned = cloneShlFileData(base);
    versioned.version = 101;
    expect(isShlDraftDirty(base, versioned)).toBe(true);
  });
});

describe("buildFolderModelIdMap", () => {
  it("maps folder index to first-seen model id", () => {
    const map = buildFolderModelIdMap([
      record({ folderIndex: 0, modelId: 0xaaaa }),
      record({ folderIndex: 1, modelId: 0xbbbb }),
      record({ folderIndex: 1, modelId: 0xcccc }),
    ]);
    expect(map.get(0)).toBe(0xaaaa);
    expect(map.get(1)).toBe(0xbbbb);
  });
});

describe("assertShlValidForSave", () => {
  it("accepts a file with at least one body slot", () => {
    expect(() => assertShlValidForSave(file([record({ modelType: 0 })]))).not.toThrow();
  });

  it("rejects an empty file", () => {
    expect(() => assertShlValidForSave(file([]))).toThrow(/at least one model slot/);
  });

  it("rejects a file with no body (type 0) slot", () => {
    expect(() =>
      assertShlValidForSave(file([record({ modelType: 3, folderIndex: 1 })])),
    ).toThrow(/Body \(type 0\)/);
  });
});
