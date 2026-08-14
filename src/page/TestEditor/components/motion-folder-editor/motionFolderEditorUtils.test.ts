import { describe, expect, it } from "vitest";
import {
  formatMotionStoredHexForDisplay,
  motionHexMatchesQuery,
  normalizeMotionHex8,
  parseMotionHexDisplayToStored,
  swapMotionHex8Bytes,
} from "./motionFolderEditorUtils";

describe("motion hex LE/BE display helpers", () => {
  it("normalizes and swaps a621fd5e ↔ 5efd21a6", () => {
    expect(normalizeMotionHex8("A621FD5E")).toBe("a621fd5e");
    expect(normalizeMotionHex8("0x5efd21a6")).toBe("5efd21a6");
    expect(swapMotionHex8Bytes("a621fd5e")).toBe("5efd21a6");
    expect(swapMotionHex8Bytes("5efd21a6")).toBe("a621fd5e");
  });

  it("formats stored LE for LE and BE display", () => {
    expect(formatMotionStoredHexForDisplay("a621fd5e", "le")).toBe("a621fd5e");
    expect(formatMotionStoredHexForDisplay("a621fd5e", "be")).toBe("5efd21a6");
  });

  it("parses display text back to structure LE storage", () => {
    expect(parseMotionHexDisplayToStored("a621fd5e", "le")).toBe("a621fd5e");
    expect(parseMotionHexDisplayToStored("5efd21a6", "be")).toBe("a621fd5e");
    expect(parseMotionHexDisplayToStored("0x5EFD21A6", "be")).toBe("a621fd5e");
  });

  it("matches query against either endian spelling", () => {
    expect(motionHexMatchesQuery("a621fd5e", "a621")).toBe(true);
    expect(motionHexMatchesQuery("a621fd5e", "5efd")).toBe(true);
    expect(motionHexMatchesQuery("a621fd5e", "dead")).toBe(false);
  });
});
