import { describe, expect, it } from "vitest";
import * as reloadSystem from "./reloadSystem";

describe("reload system evidence boundaries", () => {
  it("exposes raw reload type labels instead of inferred game semantics", () => {
    expect(reloadSystem.RELOAD_TYPE_LABELS).toEqual({
      0: "Type 0 (unverified)",
      1: "Type 1 (unverified)",
      2: "Type 2 (unverified)",
      3: "Type 3 (unverified)",
    });
  });

  it("does not export unverified reload and DPS simulations", () => {
    expect(reloadSystem).not.toHaveProperty("getEffectiveReloadFrames");
    expect(reloadSystem).not.toHaveProperty("simulateAmmoTimeline");
    expect(reloadSystem).not.toHaveProperty("calculateWeaponDps");
  });
});
