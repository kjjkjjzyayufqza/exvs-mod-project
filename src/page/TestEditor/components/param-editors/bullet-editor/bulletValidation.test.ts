import { describe, expect, it } from "vitest";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import { validateBulletEntry } from "./bulletValidation";

describe("validateBulletEntry", () => {
  it("accepts all RE-verified move types (0-7, 255) without warnings", () => {
    for (const moveType of [0, 1, 2, 3, 4, 5, 6, 7, 255]) {
      const entry: TypedParamEntry = { moveType };
      expect(validateBulletEntry(entry)).toEqual([]);
    }
  });

  it("warns when move_type is outside the RE-verified set", () => {
    const messages = validateBulletEntry({ moveType: 8 });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ field: "moveType", level: "warning" });
    expect(messages[0]!.message).toContain("Unknown move type 8");
  });

  it("treats 513-595 as unknown move types (entity command IDs, not move types)", () => {
    for (const commandId of [513, 560, 595]) {
      const messages = validateBulletEntry({ moveType: commandId });
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        field: "moveType",
        level: "warning",
      });
      expect(messages[0]!.message).toContain(
        `Unknown move type ${commandId}`,
      );
    }
  });

  it("warns explicitly when moveType is missing instead of assuming a default", () => {
    const messages = validateBulletEntry({ initialSpeed: 100 });
    expect(messages).toEqual([
      {
        field: "moveType",
        level: "warning",
        message: "moveType field is missing or non-numeric",
      },
    ]);
  });

  it("truncates fractional moveType values before lookup", () => {
    expect(validateBulletEntry({ moveType: 2.9 })).toEqual([]);
  });

  it("emits no initial_speed message (640 clamp unsubstantiated in process.md)", () => {
    const messages = validateBulletEntry({ moveType: 0, initialSpeed: 10000 });
    expect(messages).toEqual([]);
  });

  it("marks negative lifetime as absolute duration mode info", () => {
    const messages = validateBulletEntry({ moveType: 0, lifetime: -120 });
    expect(messages).toEqual([
      {
        field: "lifetime",
        level: "info",
        message: "Negative lifetime = absolute duration mode",
      },
    ]);
  });
});
