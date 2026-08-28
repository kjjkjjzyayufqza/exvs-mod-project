import { describe, expect, it } from "vitest";
import {
  filterRawEntries,
  formatSettingValue,
  isMultilineSettingValue,
  parseSettingValue,
  settingValueKind,
  toSortedRawEntries,
  validateSettingKey,
} from "./rawSettings";

describe("settingValueKind", () => {
  it("classifies JSON value shapes", () => {
    expect(settingValueKind("a")).toBe("string");
    expect(settingValueKind(1)).toBe("number");
    expect(settingValueKind(true)).toBe("boolean");
    expect(settingValueKind(null)).toBe("null");
    expect(settingValueKind([1])).toBe("array");
    expect(settingValueKind({ a: 1 })).toBe("object");
  });

  it("throws on values the store cannot hold", () => {
    expect(() => settingValueKind(undefined)).toThrow(/Unsupported setting value type/);
  });
});

describe("formatSettingValue", () => {
  it("keeps scalars on one line and indents containers", () => {
    expect(formatSettingValue("E:\\XB\\mod")).toBe('"E:\\\\XB\\\\mod"');
    expect(formatSettingValue(12)).toBe("12");
    expect(formatSettingValue(false)).toBe("false");
    expect(formatSettingValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe("parseSettingValue", () => {
  it("round-trips formatted values", () => {
    const value = { nested: ["a", 2, null] };
    expect(parseSettingValue(formatSettingValue(value))).toEqual(value);
  });

  it("rejects empty text", () => {
    expect(() => parseSettingValue("   ")).toThrow(/Value is empty/);
  });

  it("rejects unquoted strings instead of coercing them", () => {
    expect(() => parseSettingValue("E:\\XB\\mod")).toThrow(/Not valid JSON/);
  });
});

describe("isMultilineSettingValue", () => {
  it("is true only for containers", () => {
    expect(isMultilineSettingValue({ a: 1 })).toBe(true);
    expect(isMultilineSettingValue([1])).toBe(true);
    expect(isMultilineSettingValue("a")).toBe(false);
  });
});

describe("validateSettingKey", () => {
  it("trims and returns a new key", () => {
    expect(validateSettingKey("  newKey ", ["other"])).toBe("newKey");
  });

  it("rejects blank and duplicate keys", () => {
    expect(() => validateSettingKey("  ", [])).toThrow(/Key is required/);
    expect(() => validateSettingKey("dup", ["dup"])).toThrow(/already exists/);
  });
});

describe("toSortedRawEntries / filterRawEntries", () => {
  it("sorts by key and formats values", () => {
    const rows = toSortedRawEntries([
      ["zeta", 1],
      ["alpha", "x"],
    ]);
    expect(rows.map((r) => r.key)).toEqual(["alpha", "zeta"]);
    expect(rows[0].text).toBe('"x"');
  });

  it("filters on key and value text", () => {
    const rows = toSortedRawEntries([
      ["obModPath", "E:/mod"],
      ["gizmoSize", 4],
    ]);
    expect(filterRawEntries(rows, "mod").map((r) => r.key)).toEqual(["obModPath"]);
    expect(filterRawEntries(rows, "4").map((r) => r.key)).toEqual(["gizmoSize"]);
    expect(filterRawEntries(rows, "  ")).toHaveLength(2);
  });
});
