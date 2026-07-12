import { describe, expect, it } from "vitest";

import { registerMotionNuanmbPath } from "./motionNuanmbRegistry";

describe("registerMotionNuanmbPath", () => {
  it("appends an imported NUANMB path without duplicating an existing path", () => {
    const original = "E:\\unit\\attack.nuanmb";
    const imported = "E:\\unit\\attack_cascadeur.nuanmb";

    expect(registerMotionNuanmbPath([original], imported)).toEqual([original, imported]);
    expect(registerMotionNuanmbPath([original, imported], imported)).toEqual([original, imported]);
  });

  it("treats Windows slash and case variants as an existing imported path", () => {
    const imported = "E:\\unit\\attack_cascadeur.nuanmb";

    expect(registerMotionNuanmbPath([imported], "e:/UNIT/ATTACK_CASCADEUR.NUANMB")).toEqual([imported]);
  });
});
