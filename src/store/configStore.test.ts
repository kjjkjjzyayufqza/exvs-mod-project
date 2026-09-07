import { describe, expect, it } from "vitest";
import { trimmedConfigPath } from "./configStore";

describe("trimmedConfigPath", () => {
  it("treats missing and whitespace-only values as unset", () => {
    expect(trimmedConfigPath(undefined)).toBe("");
    expect(trimmedConfigPath(null)).toBe("");
    expect(trimmedConfigPath("   ")).toBe("");
    expect(trimmedConfigPath("E:\\XB\\mod")).toBe("E:\\XB\\mod");
  });
});
