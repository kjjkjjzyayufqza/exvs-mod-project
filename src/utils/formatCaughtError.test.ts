import { describe, expect, it } from "vitest";
import { formatCaughtError } from "./formatCaughtError";

describe("formatCaughtError", () => {
  it("returns Error.message", () => {
    expect(formatCaughtError(new Error("disk full"))).toBe("disk full");
  });

  it("returns Tauri Result Err strings instead of Unknown error", () => {
    expect(formatCaughtError("Motion name suffix invalid: idle.bin")).toBe(
      "Motion name suffix invalid: idle.bin",
    );
  });

  it("JSON-stringifies structured Tauri payloads", () => {
    expect(formatCaughtError({ message: "Access denied", path: "E:/x" })).toBe(
      '{"message":"Access denied","path":"E:/x"}',
    );
  });
});
