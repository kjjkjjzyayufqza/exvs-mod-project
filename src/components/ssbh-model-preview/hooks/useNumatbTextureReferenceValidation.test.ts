import { describe, expect, it } from "vitest";
import type { MissingTexturePathSlotRef } from "../store/numatbTemplateStoreHelpers";
import { mapUnresolvedTextureReferenceIssues } from "./useNumatbTextureReferenceValidation";

function slot(value: string): MissingTexturePathSlotRef {
  return {
    profile: "nust",
    materialLabel: "rock",
    paramId: "BaseColorMap",
    materialIndex: 0,
    attributeIndex: 0,
    value,
    textureDataKind: "String1",
  };
}

describe("mapUnresolvedTextureReferenceIssues", () => {
  it("maps unresolved references back to profile, material, and parameter slots", () => {
    const issues = mapUnresolvedTextureReferenceIssues(
      [slot("world_1_test-RGB"), slot("existing_texture")],
      ["world_1_test-RGB"],
    );

    expect(issues).toEqual([
      {
        slot: slot("world_1_test-RGB"),
        message: "Not found: world_1_test-RGB.nutexb",
      },
    ]);
  });

  it("matches references case-insensitively and ignores the nutexb extension", () => {
    expect(
      mapUnresolvedTextureReferenceIssues(
        [slot("WORLD_1_TEST-rgb.nutexb")],
        ["world_1_test-RGB"],
      ),
    ).toHaveLength(1);
  });
});
