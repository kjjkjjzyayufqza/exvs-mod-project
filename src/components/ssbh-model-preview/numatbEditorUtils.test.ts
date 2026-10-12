import { describe, expect, it } from "vitest";
import {
  classifyNumatbPreviewProfileId,
  detectNumatbProfileFromMatl,
  detectNumatbProfileFromPath,
} from "./numatbEditorUtils";
import type { MatlDataJson } from "./daeSsbhTypes";

function matl(entries: Array<{ material_label: string; shader_label: string }>): MatlDataJson {
  return {
    major_version: 1,
    minor_version: 6,
    entries: entries.map((entry) => ({
      material_label: entry.material_label,
      shader_label: entry.shader_label,
      textures: [],
    })),
  };
}

describe("detectNumatbProfileFromMatl", () => {
  it("treats all-empty shader_label as maya", () => {
    expect(
      detectNumatbProfileFromMatl(
        matl([
          { material_label: "a", shader_label: "" },
          { material_label: "b", shader_label: "  " },
        ]),
      ),
    ).toBe("maya");
  });

  it("treats any non-empty shader_label as nust", () => {
    expect(
      detectNumatbProfileFromMatl(
        matl([
          { material_label: "a", shader_label: "" },
          { material_label: "b", shader_label: "vsngCharaBasic" },
        ]),
      ),
    ).toBe("nust");
  });

  it("treats empty entry list as maya", () => {
    expect(detectNumatbProfileFromMatl(matl([]))).toBe("maya");
  });
});

describe("detectNumatbProfileFromPath", () => {
  it("detects explicit maya and nust suffixes", () => {
    expect(detectNumatbProfileFromPath("D:/m/foo__maya__.numatb")).toBe("maya");
    expect(detectNumatbProfileFromPath("D:/m/foo__nust__.numatb")).toBe("nust");
  });

  it("defaults unmarked names to nust", () => {
    expect(detectNumatbProfileFromPath("D:/m/foo.numatb")).toBe("nust");
  });
});

describe("classifyNumatbPreviewProfileId", () => {
  it("classifies maya, base nust, and m variants", () => {
    expect(classifyNumatbPreviewProfileId("D:/m/body__maya__.numatb")).toBe("maya");
    expect(classifyNumatbPreviewProfileId("D:/m/body__nust__.numatb")).toBe("nust");
    expect(classifyNumatbPreviewProfileId("D:/m/body_m001__nust__.numatb")).toBe("m001");
    expect(classifyNumatbPreviewProfileId("D:/m/body_m010__nust__.numatb")).toBe("m010");
  });
});
