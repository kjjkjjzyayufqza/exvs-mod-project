import { describe, expect, it } from "vitest";
import {
  createDefaultDaeImportConfig,
  detectStaticMeshImportFormat,
  isHktGenerationAvailable,
  syncDaeImportConfigUpAxisFromAnalysis,
} from "./daeImportDefaults";

describe("daeImportDefaults", () => {
  it("creates config without manual HKT settings", () => {
    const config = createDefaultDaeImportConfig("model_a");
    expect(config.generateHkt).toBe(false);
    expect(config.directToDisk).toBe(false);
    expect(config.outputDirectory).toBeNull();
    expect(config.ssbhConfig.baseFilename).toBe("model_a");
    expect((config.ssbhConfig as { flipUv?: boolean }).flipUv).toBe(false);
    expect("hktConfig" in config).toBe(false);
  });

  it("detects static mesh import formats", () => {
    expect(detectStaticMeshImportFormat("model.fbx")).toBe("fbx");
    expect(detectStaticMeshImportFormat("model.dae")).toBe("dae");
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

  it("syncs SSBH up axis from static mesh analysis", () => {
    const config = createDefaultDaeImportConfig("model_a");

    const next = syncDaeImportConfigUpAxisFromAnalysis(config, {
      upAxis: "z_up",
    });

    expect(next.ssbhConfig.upAxis).toBe("z_up");
    expect(config.ssbhConfig.upAxis).toBe("y_up");
  });
});
