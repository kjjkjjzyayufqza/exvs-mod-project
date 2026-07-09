import { describe, expect, it } from "vitest";
import {
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
