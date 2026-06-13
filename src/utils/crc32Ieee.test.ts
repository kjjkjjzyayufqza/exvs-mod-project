import { describe, expect, it } from "vitest";
import { crc32Ieee, crc32IeeeUint32 } from "./crc32Ieee";

describe("crc32Ieee", () => {
  it("matches known vectors", () => {
    expect(crc32IeeeUint32("")).toBe(0x00000000);
    expect(crc32Ieee("").hashInt32).toBe(0);

    expect(crc32IeeeUint32("test")).toBe(0xd87f7e0c);
    expect(crc32Ieee("test").hashHex).toBe("0xD87F7E0C");

    const unit = crc32Ieee("026gnbelt_003delatkai_001");
    expect(unit.hashU32).toBe(0xa258a522);
    expect(unit.hashInt32).toBe(-1571248862);
    expect(unit.hashHex).toBe("0xA258A522");
  });
});
