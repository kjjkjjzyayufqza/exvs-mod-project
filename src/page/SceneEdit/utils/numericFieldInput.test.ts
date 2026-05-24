import { describe, expect, it } from "vitest";
import {
  commitDecimalInput,
  isCompleteDecimalInput,
  sanitizeDecimalInput,
} from "./numericFieldInput";

describe("numericFieldInput", () => {
  it("strips letters from decimal input", () => {
    expect(sanitizeDecimalInput("12a3.4b5")).toBe("123.45");
    expect(sanitizeDecimalInput("-1.2x")).toBe("-1.2");
  });

  it("allows partial decimal typing states", () => {
    expect(sanitizeDecimalInput("-")).toBe("-");
    expect(sanitizeDecimalInput(".")).toBe(".");
    expect(sanitizeDecimalInput("-.")).toBe("-.");
    expect(isCompleteDecimalInput("-")).toBe(false);
    expect(isCompleteDecimalInput("1.25")).toBe(true);
  });

  it("reverts invalid commit to fallback", () => {
    expect(commitDecimalInput("abc", "0")).toBe("0");
    expect(commitDecimalInput("-", "2.5")).toBe("2.5");
    expect(commitDecimalInput("3.14", "0")).toBe("3.14");
  });
});
