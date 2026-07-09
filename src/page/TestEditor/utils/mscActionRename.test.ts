import { describe, expect, it } from "vitest";
import { collectLegacyActionAliases } from "./mscActionRename";

const SCRIPT0 = `
void func_143()
{
    if ((global48 & 0x1) != 0)
    {
        func_95(0xf48d2d49, 0, 0);
    }
    else if ((global48 & 0x80) != 0)
    {
        func_95(0x31f61d6c, 0, 0);
    }
}
`;

const SCRIPT2 = `
func_241(0xf48d2d49, func_912);
func_241(0x31f61d6c, func_926);
`;

describe("collectLegacyActionAliases", () => {
  it("returns legacy alias hints keyed by action hash", () => {
    const aliases = collectLegacyActionAliases(SCRIPT0, SCRIPT2);
    expect(aliases.get("0xf48d2d49")).toEqual({
      hashHex: "0xf48d2d49",
      workingName: "ACTION_A_SHOT",
      comment: "射击",
    });
    expect(aliases.get("0x31f61d6c")).toEqual({
      hashHex: "0x31f61d6c",
      workingName: "ACTION_AB_SUB",
      comment: "副射",
    });
  });

  it("derives action aliases when the input mask global index shifts", () => {
    const shiftedScript0 = `
void func_143()
{
    if (global39 == 0x1)
    {
        if (global50 & 0x40)
        {
            func_95(0x84da49cf, 0, 0);
        }
    }
    else if (global50 & 0x40)
    {
        func_95(0x30819be5, 0, 0);
    }
    else if (global50 & 0x1)
    {
        func_95(0xf48d2d49, 0, 0);
    }
}
`;
    const shiftedScript2 = `
func_241(0x84da49cf, func_900);
func_241(0x30819be5, func_981);
func_241(0xf48d2d49, func_912);
`;

    const aliases = collectLegacyActionAliases(shiftedScript0, shiftedScript2);

    expect(aliases.get("0x30819be5")).toEqual({
      hashHex: "0x30819be5",
      workingName: "ACTION_B_MELEE_VARIANT_ALT_2",
      comment: "近战派生",
    });
    expect(aliases.get("0xf48d2d49")).toEqual({
      hashHex: "0xf48d2d49",
      workingName: "ACTION_A_SHOT",
      comment: "射击",
    });
  });

  it("accepts non-void func_143 signatures", () => {
    const aliases = collectLegacyActionAliases(
      `
int func_143()
{
    if (global48 & 0x1)
    {
        func_95(0xf48d2d49, 0, 0);
    }
}
`,
      "func_241(0xf48d2d49, func_912);",
    );

    expect(aliases.get("0xf48d2d49")).toEqual({
      hashHex: "0xf48d2d49",
      workingName: "ACTION_A_SHOT",
      comment: "射击",
    });
  });

  it("does not read an earlier function body when matching func_143", () => {
    const aliases = collectLegacyActionAliases(
      `
void func_1()
{
    if (global48 & 0x1)
    {
        func_95(0x11111111, 0, 0);
    }
}

void func_143()
{
    if (global48 & 0x1)
    {
        if (func_97(0x71))
        {
            func_95(0xae6d509d, 0x1, 0x1, 0);
        }
        else
        {
            func_95(0xf48d2d49, 0, 0x1, 0);
        }
    }
}
`,
      `
func_241(0xae6d509d, ACTION_HASH_AE6D509D);
func_241(0xf48d2d49, ACTION_HASH_F48D2D49);
`,
    );

    expect(aliases.get("0xae6d509d")?.workingName).toBe("ACTION_A_SHOT");
    expect(aliases.get("0xf48d2d49")?.workingName).toBe("ACTION_A_SHOT_ALT_2");
    expect(aliases.has("0x11111111")).toBe(false);
  });

  it("falls back to a non-func_143 legacy mask router when func_143 uses new sys_41 routing", () => {
    const aliases = collectLegacyActionAliases(
      `
void func_143()
{
    var0 = sys_41(0x1, global48, global2);
    func_145(var0, func_144(var0), 0);
}

void func_160()
{
    if (global48 & 0x1)
    {
        if (func_97(0x71))
        {
            func_95(0xae6d509d, 0x1, 0x1, 0);
        }
        else
        {
            func_95(0xf48d2d49, 0, 0x1, 0);
        }
    }
}
`,
      `
func_241(0xae6d509d, ACTION_HASH_AE6D509D);
func_241(0xf48d2d49, ACTION_HASH_F48D2D49);
`,
    );

    expect(aliases.get("0xae6d509d")).toEqual({
      hashHex: "0xae6d509d",
      workingName: "ACTION_A_SHOT",
      comment: "射击",
    });
    expect(aliases.get("0xf48d2d49")).toEqual({
      hashHex: "0xf48d2d49",
      workingName: "ACTION_A_SHOT_ALT_2",
      comment: "射击",
    });
  });

  it("prefers the input mask data flow over unrelated global bitmasks", () => {
    const script0WithUnrelatedMask = `
void func_4()
{
    global50 = func_81(var1, var2);
    sys_1(0x10001, 0x1, 0, global50);
}

void func_143()
{
    if (global2 & 0x8)
    {
        func_99();
    }
    if (global50 & 0x80)
    {
        func_95(0x31f61d6c, 0, 0);
    }
}
`;
    const aliases = collectLegacyActionAliases(
      script0WithUnrelatedMask,
      "func_241(0x31f61d6c, func_926);",
    );

    expect(aliases.get("0x31f61d6c")).toEqual({
      hashHex: "0x31f61d6c",
      workingName: "ACTION_AB_SUB",
      comment: "副射",
    });
  });
});
