import { describe, expect, it } from "vitest";
import { parseCommittedScaleFactor } from "./HktCollisionTransformFields";

describe("parseCommittedScaleFactor", () => {
  it("allows empty and partial input while editing", () => {
    expect(parseCommittedScaleFactor("")).toBeNull();
    expect(parseCommittedScaleFactor("0.")).toBeNull();
    expect(parseCommittedScaleFactor(".")).toBeNull();
  });

  it("commits complete positive numbers", () => {
    expect(parseCommittedScaleFactor("0.1")).toBe(0.1);
    expect(parseCommittedScaleFactor("1")).toBe(1);
    expect(parseCommittedScaleFactor("  2.5  ")).toBe(2.5);
  });

  it("rejects zero and non-numeric values", () => {
    expect(parseCommittedScaleFactor("0")).toBeNull();
    expect(parseCommittedScaleFactor("abc")).toBeNull();
  });
});
