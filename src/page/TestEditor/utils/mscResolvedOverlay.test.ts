import { describe, expect, it } from "vitest";
import {
  applyMscResolvedOverlayToScript2,
  buildMscResolvedOverlay,
  renderResolvedOverlayMarkdown,
} from "./mscResolvedOverlay";

describe("renderResolvedOverlayMarkdown", () => {
  it("renders stable keys first and keeps legacy names explicitly marked", () => {
    const markdown = renderResolvedOverlayMarkdown({
      actions: [
        {
          actionHashHex: "0x9475130e",
          actionIndexHex: "0x17",
          callbackName: "func_450",
          requestedSlots: ["0x23"],
          legacyWorkingName: "ACTION_TRANSFORM_DASH_ENTRY",
          legacyComment: "变形突入",
        },
      ],
      slotCallbacks: [
        {
          slotHex: "0x23",
          callbackName: "func_870",
          referencedByActionHashes: ["0x9475130e"],
        },
      ],
      weaponBindings: [
        {
          slotHex: "0x2",
          armsEntryHashHex: "0xa8e202bf",
          ownerCallbackName: "func_870",
          label: "GUN_015GNDMUC_004DELTPL_001_ASSIST",
        },
      ],
      resourceBindings: [
        {
          registryKindHex: "0x3",
          slotHex: "0x23",
          resourceValueHex: "0x37",
        },
      ],
      orphanActionFunctions: [
        {
          functionName: "func_450",
          requestedSlots: ["0x23"],
          resourceValues: ["0xe2c42dae"],
          notes: "Direct action registry callback is 0; slot registry callback is 0.",
        },
      ],
    });

    expect(markdown).toContain("# MSC Resolved Overlay");
    expect(markdown).toContain("Stable key: `0x9475130e`");
    expect(markdown).toContain("Legacy alias: `ACTION_TRANSFORM_DASH_ENTRY`");
    expect(markdown).toContain("Slot callback: `func_870`");
    expect(markdown).toContain("Registry kind: `0x3`");
    expect(markdown).toContain("Label: `GUN_015GNDMUC_004DELTPL_001_ASSIST`");
    expect(markdown).toContain("## Orphan Action-like Functions");
    expect(markdown).toContain("Function: `func_450`");
    expect(markdown).toContain("Requested slots: `0x23`");
  });
});

describe("buildMscResolvedOverlay", () => {
  it("resolves stable action evidence when func_143 has a non-legacy signature", () => {
    const result = buildMscResolvedOverlay({
      script0Content: `
sys_1(0x10000, 0x1, 0x2, 0x6d00aeaa);
int func_143()
{
    return 0x6d00aeaa;
}
`,
      script2Content: `
func_241(0x6d00aeaa, func_390);
void func_390()
{
    func_69(0x2);
}
`,
    });

    expect(result.status).toBe("resolved");
    expect(result.legacyAliasCount).toBe(0);
    expect(result.evidence.actions).toHaveLength(1);
    expect(result.markdown).toContain("Stable key: `0x6d00aeaa`");
  });

  it("resolves stable action evidence when func_95 receives a variable hash", () => {
    const result = buildMscResolvedOverlay({
      script0Content: `
sys_1(0x10000, 0x1, 0x2, 0x6d00aeaa);
void func_143()
{
    func_95(var3, var6, var7, arg1);
}
`,
      script2Content: "func_241(0x6d00aeaa, func_390);",
    });

    expect(result.status).toBe("resolved");
    expect(result.legacyAliasCount).toBe(0);
    expect(result.evidence.actions[0]?.callbackName).toBe("func_390");
  });

  it("returns partial when non-action stable registries are available", () => {
    const result = buildMscResolvedOverlay({
      script0Content: "sys_1(0x10000, 0x1, 0x2, 0x6d00aeaa);",
      script2Content: `
int func_241(int arg0, int arg1, int arg2, int arg3)
{
    return 0;
}
sys_1(0x10001, 0x2, 0x1, func_838);
void func_838()
{
    sys_4F(0xb, 0x1, 0xa8e202bf);
}
`,
    });

    expect(result.status).toBe("partial");
    expect(result.evidence.actions).toHaveLength(0);
    expect(result.evidence.slotCallbacks).toHaveLength(1);
    expect(result.markdown).toContain("Slot callback: `func_838`");
  });

  it("returns skipped when no stable registry evidence is available", () => {
    const result = buildMscResolvedOverlay({
      script0Content: "int func_143() { return 0; }",
      script2Content: "void func_1() {}",
    });

    expect(result.status).toBe("skipped");
    expect(result.markdown).toBeNull();
  });
});

describe("applyMscResolvedOverlayToScript2", () => {
  it("renames script2 action callbacks using legacy aliases when available", () => {
    const result = applyMscResolvedOverlayToScript2({
      script0Content: `
void func_81() {}
void func_143()
{
    if ((global48 & 0x1) != 0)
    {
        func_95(0xf48d2d49, 0, 0);
    }
}
`,
      script2Content: `
void func_912()
{
    func_69(0x1);
}

void func_241(int arg0, int arg1)
{
}

void func_1052()
{
    func_241(0xf48d2d49, func_912);
}
`,
    });

    expect(result.status).toBe("resolved");
    expect(result.renamedCallbackCount).toBe(1);
    expect(result.updatedScript2Content).toContain("void ACTION_A_SHOT()");
    expect(result.updatedScript2Content).toContain("func_241(0xf48d2d49, ACTION_A_SHOT); //  射击");
    expect(result.updatedScript2Content).not.toContain("func_912");
  });

  it("does not write ACTION_HASH fallback names without a 0.c legacy alias", () => {
    const result = applyMscResolvedOverlayToScript2({
      script0Content: "sys_1(0x10000, 0x1, 0x2, 0x6d00aeaa);",
      script2Content: `
void func_390()
{
    func_69(0x1);
}

void func_241(int arg0, int arg1)
{
}

void func_1052()
{
    func_241(0x6d00aeaa, func_390);
}
`,
    });

    expect(result.status).toBe("resolved");
    expect(result.renamedCallbackCount).toBe(0);
    expect(result.updatedScript2Content).toBeNull();
  });

  it("prefers 0.c legacy aliases over earlier unaliased func_241 bindings for the same callback", () => {
    const result = applyMscResolvedOverlayToScript2({
      script0Content: `
int func_143()
{
    if (global48 & 0x1)
    {
        func_95(0x7158fa47, 0, 0);
        func_95(0xf48d2d49, 0, 0);
    }
}
`,
      script2Content: `
void func_58()
{
    func_69(0x1);
}

void func_241(int arg0, int arg1)
{
}

void func_1052()
{
    func_241(0x613494c8, func_58);
    func_241(0xf48d2d49, func_58);
}
`,
    });

    expect(result.status).toBe("resolved");
    expect(result.renamedCallbackCount).toBe(1);
    expect(result.updatedScript2Content).not.toContain("ACTION_HASH_613494C8");
    expect(result.updatedScript2Content).toContain("void ACTION_A_SHOT_ALT_2()");
    expect(result.updatedScript2Content).toContain("func_241(0xf48d2d49, ACTION_A_SHOT_ALT_2); //  射击");
  });

  it("repairs previously generated ACTION_HASH callback names when 0.c provides the alias", () => {
    const result = applyMscResolvedOverlayToScript2({
      script0Content: `
int func_143()
{
    if (global48 & 0x1)
    {
        func_95(0x7158fa47, 0, 0);
        func_95(0xf48d2d49, 0, 0);
    }
}
`,
      script2Content: `
void ACTION_HASH_613494C8()
{
    func_69(0x1);
}

void func_241(int arg0, int arg1)
{
}

void func_1052()
{
    func_241(0x613494c8, ACTION_HASH_613494C8);
    func_241(0xf48d2d49, ACTION_HASH_613494C8);
}
`,
    });

    expect(result.status).toBe("resolved");
    expect(result.renamedCallbackCount).toBe(1);
    expect(result.updatedScript2Content).not.toContain("ACTION_HASH_613494C8");
    expect(result.updatedScript2Content).toContain("void ACTION_A_SHOT_ALT_2()");
    expect(result.updatedScript2Content).toContain("func_241(0xf48d2d49, ACTION_A_SHOT_ALT_2); //  射击");
  });

  it("adds legacy comments when the callback name is already resolved", () => {
    const result = applyMscResolvedOverlayToScript2({
      script0Content: `
int func_143()
{
    if (global48 & 0x1)
    {
        func_95(0x7158fa47, 0, 0);
        func_95(0xf48d2d49, 0, 0);
    }
}
`,
      script2Content: `
void ACTION_A_SHOT_ALT_2()
{
    func_69(0x1);
}

void func_241(int arg0, int arg1)
{
}

void func_1052()
{
    func_241(0xf48d2d49, ACTION_A_SHOT_ALT_2);
}
`,
    });

    expect(result.status).toBe("resolved");
    expect(result.renamedCallbackCount).toBe(0);
    expect(result.updatedScript2Content).toContain("func_241(0xf48d2d49, ACTION_A_SHOT_ALT_2); //  射击");
  });

  it("skips writing when no stable evidence exists", () => {
    const result = applyMscResolvedOverlayToScript2({
      script0Content: "",
      script2Content: "void func_1() {}",
    });

    expect(result.status).toBe("skipped");
    expect(result.updatedScript2Content).toBeNull();
    expect(result.renamedCallbackCount).toBe(0);
  });
});
