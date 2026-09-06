import { describe, expect, it } from "vitest";
import {
  NUMATB_SHADER_LABEL_PRESETS,
  numatbShaderLabelOptions,
} from "./numatbShaderLabelPresets";

describe("numatbShaderLabelOptions", () => {
  it("defaults to vsngCharaBasic and FeStandard", () => {
    expect([...NUMATB_SHADER_LABEL_PRESETS]).toEqual(["vsngCharaBasic", "FeStandard"]);
    expect(numatbShaderLabelOptions()).toEqual(["vsngCharaBasic", "FeStandard"]);
    expect(numatbShaderLabelOptions("")).toEqual(["vsngCharaBasic", "FeStandard"]);
  });

  it("keeps a current custom value as an extra option", () => {
    expect(numatbShaderLabelOptions("vstgStandard_VertexColor")).toEqual([
      "vsngCharaBasic",
      "FeStandard",
      "vstgStandard_VertexColor",
    ]);
  });

  it("does not duplicate a preset that is already the current value", () => {
    expect(numatbShaderLabelOptions("FeStandard")).toEqual(["vsngCharaBasic", "FeStandard"]);
  });
});
