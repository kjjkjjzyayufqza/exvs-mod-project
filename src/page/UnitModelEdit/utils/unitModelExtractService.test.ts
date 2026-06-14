import { describe, expect, it } from "vitest";

import {
  buildUnitModelExtractOutRoot,
  inferFhm2dStem,
  resolveUnitModelOutputDirectory,
} from "./unitModelExtractService";

describe("unitModelExtractService path helpers", () => {
  it("strips .fhm2d extension from basename", () => {
    expect(inferFhm2dStem("E:\\XB\\com\\0xABE08869.fhm2d")).toBe("0xABE08869");
  });

  it("prefers unit model output path over global extract output path", () => {
    expect(resolveUnitModelOutputDirectory("E:\\unit-out", "E:\\global-out")).toBe("E:\\unit-out");
    expect(resolveUnitModelOutputDirectory("", "E:\\global-out")).toBe("E:\\global-out");
    expect(resolveUnitModelOutputDirectory("  ", "E:\\global-out")).toBe("E:\\global-out");
  });

  it("builds extract out root under the selected output directory", () => {
    expect(buildUnitModelExtractOutRoot("E:\\XB\\extract", "0xABE08869")).toBe(
      "E:\\XB\\extract\\0xABE08869",
    );
  });
});
