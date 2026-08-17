import { describe, expect, it } from "vitest";
import {
  extractHashNameFromStructureText,
  fingerprintStructureNames,
} from "./namedFhm2dPackIndex";

describe("namedFhm2dPackIndex pure helpers", () => {
  it("extracts HashName from the head without full JSON parse", () => {
    const hugeTail = `"SubFileData":${JSON.stringify(new Array(2000).fill({ a: 1 }))}`;
    const text = `{\n  "Name": "Gyan_effect",\n  "HashName": "0xbdbE6fea",\n  ${hugeTail}\n}`;
    expect(extractHashNameFromStructureText(text)).toBe("0xBDBE6FEA");
  });

  it("returns null when HashName is missing", () => {
    expect(extractHashNameFromStructureText('{"Name":"x"}')).toBeNull();
  });

  it("fingerprints structure names order-independently", () => {
    const a = fingerprintStructureNames(["b_structure.json", "a_structure.json"]);
    const b = fingerprintStructureNames(["a_structure.json", "b_structure.json"]);
    const c = fingerprintStructureNames(["a_structure.json", "c_structure.json"]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
