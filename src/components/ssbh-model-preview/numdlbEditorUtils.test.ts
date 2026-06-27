import { describe, expect, it } from "vitest";
import type { NumdlbMappingRow } from "./daeSsbhTypes";
import {
  applyMeshNameAsMaterialLabel,
  numatbPathForNumdlb,
  removeMappingRow,
  stripPartSuffix,
} from "./numdlbEditorUtils";

describe("numatbPathForNumdlb", () => {
  it("joins the referenced numatb name to the numdlb directory (windows path)", () => {
    expect(numatbPathForNumdlb("C:\\models\\unit\\model.numdlb", ["model.numatb"])).toBe(
      "C:/models/unit/model.numatb",
    );
  });

  it("picks the first .numatb entry among the material file names", () => {
    expect(
      numatbPathForNumdlb("/m/model.numdlb", ["ignore.txt", "mat.numatb", "other.numatb"]),
    ).toBe("/m/mat.numatb");
  });

  it("returns null when there is no referenced numatb", () => {
    expect(numatbPathForNumdlb("/m/model.numdlb", [])).toBeNull();
    expect(numatbPathForNumdlb("/m/model.numdlb", ["foo.bin"])).toBeNull();
  });
});

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

describe("removeMappingRow", () => {
  const row = (meshObjectName: string, materialLabel: string): NumdlbMappingRow => ({
    meshObjectName,
    meshObjectSubindex: 0,
    materialLabel,
  });

  it("removes the row at the given index", () => {
    const input = [row("a", "ma"), row("b", "mb"), row("c", "mc")];
    expect(removeMappingRow(input, 1)).toEqual([row("a", "ma"), row("c", "mc")]);
  });

  it("does not mutate the input array", () => {
    const input = [row("a", "ma"), row("b", "mb")];
    removeMappingRow(input, 0);
    expect(input).toHaveLength(2);
  });

  it("throws when rowIndex is out of range", () => {
    expect(() => removeMappingRow([row("a", "ma")], 1)).toThrow(/out of range/i);
    expect(() => removeMappingRow([], 0)).toThrow(/out of range/i);
  });
});
