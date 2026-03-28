import { describe, expect, it } from "vitest";
import { buildExtraNustNumatbDesiredFileName } from "./fhm2d_characterModelFormatFuc";

describe("buildExtraNustNumatbDesiredFileName", () => {
  it("inserts _mNNN before __nust__ from materialFileNames[1] template", () => {
    const template = "053gbftry_002trybng_001_assist_bunshin00__nust__";
    expect(buildExtraNustNumatbDesiredFileName(template, 1)).toBe(
      "053gbftry_002trybng_001_assist_bunshin00_m001__nust__.numatb",
    );
    expect(buildExtraNustNumatbDesiredFileName(template, 2)).toBe(
      "053gbftry_002trybng_001_assist_bunshin00_m002__nust__.numatb",
    );
    expect(buildExtraNustNumatbDesiredFileName(template, 999)).toBe(
      "053gbftry_002trybng_001_assist_bunshin00_m999__nust__.numatb",
    );
  });
});
