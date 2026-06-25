import { describe, expect, it } from "vitest";
import { buildStableMscEvidence } from "./mscStableEvidence";

const SCRIPT0 = `
sys_1(0x10000, 0x1, 0x17, 0x9475130e);
`;

const SCRIPT2 = `
func_241(0x9475130e, func_450);
sys_1(0x10001, 0x2, 0x23, func_870);
sys_1(0x10001, 0x3, 0x23, 0x37);

void func_450()
{
    func_69(0x23);
}

void func_870()
{
    sys_4F(0xb, 0x2, 0xa8e202bf);
}
`;

describe("buildStableMscEvidence", () => {
  it("extracts action bindings, slot callback bindings, and weapon bindings", () => {
    const evidence = buildStableMscEvidence({
      script0Content: SCRIPT0,
      script2Content: SCRIPT2,
      legacyAliases: new Map([
        [
          "0x9475130e",
          {
            hashHex: "0x9475130e",
            workingName: "ACTION_TRANSFORM_DASH_ENTRY",
            comment: "变形突入",
          },
        ],
      ]),
    });

    expect(evidence.actions).toEqual([
      expect.objectContaining({
        actionHashHex: "0x9475130e",
        callbackName: "func_450",
        actionIndexHex: "0x17",
        requestedSlots: ["0x23"],
        legacyWorkingName: "ACTION_TRANSFORM_DASH_ENTRY",
      }),
    ]);

    expect(evidence.slotCallbacks).toEqual([
      expect.objectContaining({
        slotHex: "0x23",
        callbackName: "func_870",
        referencedByActionHashes: ["0x9475130e"],
      }),
    ]);

    expect(evidence.weaponBindings).toEqual([
      expect.objectContaining({
        slotHex: "0x2",
        armsEntryHashHex: "0xa8e202bf",
        ownerCallbackName: "func_870",
      }),
    ]);

    expect(evidence.resourceBindings).toEqual([
      expect.objectContaining({
        registryKindHex: "0x3",
        slotHex: "0x23",
        resourceValueHex: "0x37",
      }),
    ]);
  });

  it("does not depend on a specific func_N number", () => {
    const renumbered = SCRIPT2.replace(/func_450/g, "func_900").replace(/func_870/g, "func_1158");
    const evidence = buildStableMscEvidence({
      script0Content: SCRIPT0,
      script2Content: renumbered,
      legacyAliases: new Map(),
    });
    expect(evidence.actions[0]?.callbackName).toBe("func_900");
    expect(evidence.slotCallbacks[0]?.callbackName).toBe("func_1158");
  });

  it("canonicalizes short hash values before cross-file lookup", () => {
    const evidence = buildStableMscEvidence({
      script0Content: "sys_1(0x10000, 0x1, 0x1, 0x2);",
      script2Content: "func_241(0x2, func_1);\nvoid func_1() { sys_4F(0xb, 0x1, 0x2); }",
      legacyAliases: new Map(),
    });

    expect(evidence.actions[0]?.actionHashHex).toBe("0x00000002");
    expect(evidence.weaponBindings[0]?.armsEntryHashHex).toBe("0x00000002");
  });

  it("surfaces orphan action-like functions when direct action registry stays zero", () => {
    const evidence = buildStableMscEvidence({
      script0Content: "sys_1(0x10000, 0x1, 0x17, 0x9475130e);",
      script2Content: `
func_241(0x9475130e, 0);
sys_1(0x10001, 0x2, 0x23, 0);
sys_1(0x10001, 0x3, 0x23, 0xe2c42dae);

void func_450()
{
    func_169(0x1008000);
    func_69(0x23);
    callFunc3(func_451);
}

void func_451()
{
}
`,
      legacyAliases: new Map(),
    });

    expect(evidence.orphanActionFunctions).toEqual([
      expect.objectContaining({
        functionName: "func_450",
        requestedSlots: ["0x23"],
        notes: expect.stringContaining("Direct action registry callback is 0"),
      }),
    ]);
  });
});
