import { describe, expect, it } from "vitest";
import { DEFAULT_HKT_SIMPLIFY } from "../../utils/hktSimplifyUtils";
import { buildImportConfigForHktPreview } from "../../utils/hktSimplifyUtils";
import {
  buildHktFromModelConfigKey,
  isCachedHktFromModelValid,
  type CachedHktFromModelGeneration,
} from "./generateHktFromModelCache";

describe("generateHktFromModelCache", () => {
  const importConfig = buildImportConfigForHktPreview({
    generateHkt: true,
    convertToSsbh: false,
    ssbhConfig: null,
    hktSimplify: DEFAULT_HKT_SIMPLIFY,
  });

  it("validates cache when path and config key match", () => {
    const configKey = buildHktFromModelConfigKey(importConfig, DEFAULT_HKT_SIMPLIFY);
    const cached: CachedHktFromModelGeneration = {
      sourcePath: "E:/models/stage.dae",
      configKey,
      hktBytes: [1, 2, 3],
      triangleCount: 42,
    };
    expect(isCachedHktFromModelValid(cached, "E:/models/stage.dae", configKey)).toBe(true);
  });

  it("rejects cache when simplify config changed", () => {
    const cached: CachedHktFromModelGeneration = {
      sourcePath: "E:/models/stage.dae",
      configKey: "old-key",
      hktBytes: [1, 2, 3],
      triangleCount: 42,
    };
    const nextKey = buildHktFromModelConfigKey(importConfig, {
      ...DEFAULT_HKT_SIMPLIFY,
      preset: "coarse",
    });
    expect(isCachedHktFromModelValid(cached, "E:/models/stage.dae", nextKey)).toBe(false);
  });
});
