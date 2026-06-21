import { describe, expect, it } from "vitest";
import type { NumdlbMappingRow } from "./daeSsbhTypes";
import { applyMeshNameAsMaterialLabel, stripPartSuffix } from "./numdlbEditorUtils";

describe("stripPartSuffix", () => {
  it("strips a single-digit __part suffix", () => {
    expect(stripPartSuffix("body__part0")).toBe("body");
  });

  it("strips a multi-digit __part suffix", () => {
    expect(stripPartSuffix("body__part12")).toBe("body");
  });

  it("is case-insensitive on the part token", () => {
    expect(stripPartSuffix("Wing__PART3")).toBe("Wing");
  });

  it("leaves names without a part suffix untouched", () => {
    expect(stripPartSuffix("body")).toBe("body");
  });

  it("only strips the trailing part run", () => {
    expect(stripPartSuffix("wing__part0__part1")).toBe("wing__part0");
  });

  it("does not strip a non-anchored part token", () => {
    expect(stripPartSuffix("body__part0_extra")).toBe("body__part0_extra");
  });
});

describe("applyMeshNameAsMaterialLabel", () => {
  const row = (meshObjectName: string, materialLabel: string): NumdlbMappingRow => ({
    meshObjectName,
    meshObjectSubindex: 0,
    materialLabel,
  });

  it("sets every row's material label to its stripped mesh name", () => {
    const result = applyMeshNameAsMaterialLabel([
      row("body__part0", "wrong"),
      row("wing__part2", "stale"),
    ]);
    expect(result.map((r) => r.materialLabel)).toEqual(["body", "wing"]);
  });

  it("overwrites already-set labels unconditionally", () => {
    const result = applyMeshNameAsMaterialLabel([row("head__part0", "head_custom")]);
    expect(result[0].materialLabel).toBe("head");
  });

  it("returns unchanged rows by reference (immutable, render-stable)", () => {
    const stable = row("body", "body");
    const result = applyMeshNameAsMaterialLabel([stable]);
    expect(result[0]).toBe(stable);
  });

  it("produces a new row object only when the label changes", () => {
    const changing = row("body__part0", "body__part0");
    const result = applyMeshNameAsMaterialLabel([changing]);
    expect(result[0]).not.toBe(changing);
    expect(result[0].materialLabel).toBe("body");
  });

  it("does not mutate the input array or rows", () => {
    const input = [row("body__part0", "x")];
    const snapshot = input[0].materialLabel;
    applyMeshNameAsMaterialLabel(input);
    expect(input[0].materialLabel).toBe(snapshot);
  });
});
