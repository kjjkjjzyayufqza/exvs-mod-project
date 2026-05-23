import { describe, expect, it } from "vitest";
import { createDefaultDaeImportConfig, isHktGenerationAvailable } from "./daeImportDefaults";

describe("daeImportDefaults", () => {
  it("creates config without manual HKT settings", () => {
    const config = createDefaultDaeImportConfig("model_a");
    expect(config.generateHkt).toBe(false);
    expect(config.ssbhConfig.baseFilename).toBe("model_a");
    expect("hktConfig" in config).toBe(false);
  });

  it("enables HKT only when filter manager is available", () => {
    expect(isHktGenerationAvailable(null)).toBe(false);
    expect(
      isHktGenerationAvailable({
        filterManagerAvailable: false,
      }),
    ).toBe(false);
    expect(
      isHktGenerationAvailable({
        filterManagerAvailable: true,
      }),
    ).toBe(true);
  });
});
