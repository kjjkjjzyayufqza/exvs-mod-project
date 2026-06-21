import { describe, expect, it } from "vitest";
import type { MatlDataJson } from "./types";
import { collectMaterialLabels } from "./numatbEditorUtils";

function matl(labels: string[]): MatlDataJson {
  return {
    major_version: 1,
    minor_version: 6,
    entries: labels.map((material_label) => ({
      material_label,
      shader_label: "shader",
      textures: [],
    })),
  };
}

describe("collectMaterialLabels", () => {
  it("returns the sorted union of labels across profiles", () => {
    const result = collectMaterialLabels(matl(["wingMtl", "bodyMtl"]), matl(["headMtl"]));
    expect(result).toEqual(["bodyMtl", "headMtl", "wingMtl"]);
  });

  it("de-duplicates case-insensitively, keeping first spelling", () => {
    const result = collectMaterialLabels(matl(["BodyMtl"]), matl(["bodymtl", "wingMtl"]));
    expect(result).toEqual(["BodyMtl", "wingMtl"]);
  });

  it("ignores null/undefined profiles and blank labels", () => {
    const result = collectMaterialLabels(null, matl(["  ", "bodyMtl"]), undefined);
    expect(result).toEqual(["bodyMtl"]);
  });

  it("returns an empty array when no profiles are given", () => {
    expect(collectMaterialLabels()).toEqual([]);
  });
});
