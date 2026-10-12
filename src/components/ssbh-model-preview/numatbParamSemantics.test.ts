import { describe, expect, it } from "vitest";
import { colorChannelToByte, readNumatbColor4, rgbToHex } from "./components/NumatbColor4Field";
import { numatbParamSemantic } from "./numatbParamSemantics";

describe("numatbParamSemantic", () => {
  it("maps the character color slots registered in the OB uniform table", () => {
    expect(numatbParamSemantic("CustomColor0")).toMatchObject({
      uniform: "GBufferDiffuseMultiply",
      editor: "color",
    });
    expect(numatbParamSemantic("CustomColor1")?.uniform).toBe("GBufferEmissiveColorMultiply");
    expect(numatbParamSemantic("CustomColor2")?.uniform).toBe("GBufferDamage");
    expect(numatbParamSemantic("CustomVector0")).toMatchObject({
      uniform: "RimlightColor",
      editor: "color",
    });
    expect(numatbParamSemantic("CustomFloat0")?.uniform).toBe("FresnelBias");
    expect(numatbParamSemantic("CustomInteger0")?.uniform).toBe("EnableAwakening");
  });
});

describe("readNumatbColor4", () => {
  it("reads the RGBA sequence MatlData stores on disk", () => {
    expect(readNumatbColor4([0.2, 0.4, 0.6, 1])).toEqual({
      r: 0.2,
      g: 0.4,
      b: 0.6,
      a: 1,
    });
  });

  it("reads named RGBA and XYZW objects", () => {
    expect(readNumatbColor4({ r: 1, g: 0, b: 0, a: 1 })).toEqual({
      r: 1,
      g: 0,
      b: 0,
      a: 1,
    });
    expect(readNumatbColor4({ x: 0, y: 1, z: 0, w: 0.5 })).toEqual({
      r: 0,
      g: 1,
      b: 0,
      a: 0.5,
    });
  });
});

describe("rgbToHex", () => {
  it("clamps the swatch into 8-bit sRGB", () => {
    expect(rgbToHex(1, 1, 1)).toBe("#ffffff");
    expect(rgbToHex(0, 0, 0)).toBe("#000000");
    expect(colorChannelToByte(2)).toBe(255);
    expect(colorChannelToByte(-1)).toBe(0);
  });
});
