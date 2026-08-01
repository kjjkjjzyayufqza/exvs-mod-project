import { describe, expect, it } from "vitest";
import {
  findFileNameIgnoreCase,
  preferredStructureJsonNames,
  resolveRepackOutputBesideFolder,
  resolveStructureJsonBesideFolder,
} from "./extractRepackPaths";

describe("preferredStructureJsonNames", () => {
  it("returns modern _structure.json then legacy .json", () => {
    expect(preferredStructureJsonNames("0xBDBE6FEA")).toEqual([
      "0xBDBE6FEA_structure.json",
      "0xBDBE6FEA.json",
    ]);
  });

  it("returns empty for blank folder name", () => {
    expect(preferredStructureJsonNames("  ")).toEqual([]);
  });
});

describe("findFileNameIgnoreCase", () => {
  it("matches case-insensitively and returns actual casing", () => {
    expect(
      findFileNameIgnoreCase(
        ["Other.json", "0xBDBE6FEA_Structure.json"],
        "0xb dbe6fea_structure.json".replace(/\s/g, ""),
      ),
    ).toBe("0xBDBE6FEA_Structure.json");
  });
});

describe("resolveStructureJsonBesideFolder", () => {
  it("prefers sibling {folder}_structure.json", () => {
    const result = resolveStructureJsonBesideFolder({
      folderPath: "E:/workspace/002chara/Gyan_model",
      parentJsonFileNames: [
        "noise.json",
        "Gyan_model_structure.json",
        "Gyan_model.json",
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.structureFileName).toBe("Gyan_model_structure.json");
    expect(result.structureJsonPath).toBe(
      "E:/workspace/002chara/Gyan_model_structure.json",
    );
    expect(result.matchKind).toBe("preferred_structure");
    expect(result.parentDir).toBe("E:/workspace/002chara");
  });

  it("falls back to legacy {folder}.json when _structure is missing", () => {
    const result = resolveStructureJsonBesideFolder({
      folderPath: "E:\\mods\\0xDEADBEEF",
      parentJsonFileNames: ["0xDEADBEEF.json", "readme.txt"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matchKind).toBe("preferred_legacy");
    expect(result.structureFileName).toBe("0xDEADBEEF.json");
    expect(result.structureJsonPath.replace(/\\/g, "/")).toBe(
      "E:/mods/0xDEADBEEF.json",
    );
  });

  it("fails clearly when no preferred structure JSON exists", () => {
    const result = resolveStructureJsonBesideFolder({
      folderPath: "E:/workspace/pack/A",
      parentJsonFileNames: ["B_structure.json", "unrelated.json"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/No structure JSON found/);
    expect(result.error).toMatch(/A_structure\.json/);
  });

  it("uses validated other JSON only when preferred names are absent", () => {
    const result = resolveStructureJsonBesideFolder({
      folderPath: "E:/workspace/pack/NamedFolder",
      parentJsonFileNames: ["other_pack_structure.json", "noise.json"],
      validatedStructureJsonNames: ["other_pack_structure.json"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matchKind).toBe("validated_other");
    expect(result.structureFileName).toBe("other_pack_structure.json");
  });

  it("does not invent a template when validated list is empty and names mismatch", () => {
    const result = resolveStructureJsonBesideFolder({
      folderPath: "E:/workspace/pack/NamedFolder",
      parentJsonFileNames: ["other_pack_structure.json"],
      validatedStructureJsonNames: [],
    });
    expect(result.ok).toBe(false);
  });
});

describe("resolveRepackOutputBesideFolder", () => {
  it("uses HashName for output .fhm2d in the parent directory", () => {
    const result = resolveRepackOutputBesideFolder({
      folderPath: "E:/workspace/006effect/Gyan_effect",
      structureJsonPath: "E:/workspace/006effect/Gyan_effect_structure.json",
      hashName: "0xBDBE6FEA",
    });
    expect(result.parentDir).toBe("E:/workspace/006effect");
    expect(result.hashName).toBe("0xBDBE6FEA");
    expect(result.outputPath).toBe("E:/workspace/006effect/0xBDBE6FEA.fhm2d");
  });

  it("falls back to structure stem when HashName is missing", () => {
    const result = resolveRepackOutputBesideFolder({
      folderPath: "E:/workspace/002chara/Gyan_model",
      structureJsonPath: "E:/workspace/002chara/Gyan_model_structure.json",
      hashName: null,
    });
    expect(result.hashName).toBeNull();
    expect(result.packStem).toBe("Gyan_model");
    expect(result.outputPath).toBe("E:/workspace/002chara/Gyan_model.fhm2d");
  });
});
