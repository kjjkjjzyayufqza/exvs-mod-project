import { describe, expect, it } from "vitest";
import {
  collectLegacyActionAliases,
  renameScript2CallbacksByActionMask,
} from "./mscActionRename";

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
});

describe("renameScript2CallbacksByActionMask", () => {
  it("keeps old mutation path working as compatibility wrapper", () => {
    const result = renameScript2CallbacksByActionMask(SCRIPT0, SCRIPT2);
    expect(result.updatedScript2).toContain("func_241(0xf48d2d49, ACTION_A_SHOT); //射击");
    expect(result.updatedScript2).toContain("func_241(0x31f61d6c, ACTION_AB_SUB); //副射");
  });
});
