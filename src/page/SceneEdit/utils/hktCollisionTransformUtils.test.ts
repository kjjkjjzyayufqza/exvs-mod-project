import { describe, expect, it } from "vitest";
import {
  createHktOnlySsbhConfig,
  DEFAULT_HKT_COLLISION_SCALE,
  mergeHktCollisionTransform,
} from "./hktCollisionTransformUtils";
import { serializeHktPreviewConfigKey } from "./hktSimplifyUtils";
import { buildImportConfigForHktPreview, DEFAULT_HKT_SIMPLIFY } from "./hktSimplifyUtils";

describe("hktCollisionTransformUtils", () => {
  it("createHktOnlySsbhConfig disables SSBH writes and keeps scale/axis", () => {
    const cfg = createHktOnlySsbhConfig({ scaleFactor: 0.01, upAxis: "z_up" });
    expect(cfg.scaleFactor).toBe(0.01);
    expect(cfg.upAxis).toBe("z_up");
    expect(cfg.writeNumshb).toBe(false);
    expect(cfg.writeNumdlb).toBe(false);
  });

  it("mergeHktCollisionTransform updates scale on an existing config", () => {
    const base = createHktOnlySsbhConfig({ baseFilename: "stage_mesh" });
    const merged = mergeHktCollisionTransform(base, 2.5, "none");
    expect(merged.baseFilename).toBe("stage_mesh");
    expect(merged.scaleFactor).toBe(2.5);
    expect(merged.upAxis).toBe("none");
  });

  it("scale changes affect HKT preview config key", () => {
    const base = buildImportConfigForHktPreview({
      generateHkt: true,
      convertToSsbh: false,
      ssbhConfig: createHktOnlySsbhConfig({ scaleFactor: DEFAULT_HKT_COLLISION_SCALE }),
      hktSimplify: DEFAULT_HKT_SIMPLIFY,
    });
    const scaled = buildImportConfigForHktPreview({
      generateHkt: true,
      convertToSsbh: false,
      ssbhConfig: createHktOnlySsbhConfig({ scaleFactor: 0.01 }),
      hktSimplify: DEFAULT_HKT_SIMPLIFY,
    });
    const keyA = serializeHktPreviewConfigKey(base, DEFAULT_HKT_SIMPLIFY);
    const keyB = serializeHktPreviewConfigKey(scaled, DEFAULT_HKT_SIMPLIFY);
    expect(keyA).not.toBe(keyB);
  });
});
