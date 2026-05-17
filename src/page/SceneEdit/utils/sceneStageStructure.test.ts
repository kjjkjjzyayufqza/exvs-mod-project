import { describe, expect, it } from "vitest";
import {
  buildStageStructureJsonFromFiles,
  resolveStagePackStructureTarget,
  type StagePackFileEntry,
} from "./sceneStageStructure";

describe("sceneStageStructure", () => {
  it("resolves a hash pack root and sibling structure json from a nested stage root", () => {
    const target = resolveStagePackStructureTarget("E:/XB/unpack/com/test/16F73C97/0/0");

    expect(target.packRoot).toBe("E:/XB/unpack/com/test/16F73C97");
    expect(target.structurePath).toBe("E:/XB/unpack/com/test/0x16F73C97_structure.json");
    expect(target.packFolderName).toBe("16F73C97");
    expect(target.hashHex).toBe("0x16F73C97");
  });

  it("throws when the stage root is not inside a hash-named pack folder", () => {
    expect(() => resolveStagePackStructureTarget("E:/stages/custom/base")).toThrow(
      "Unable to resolve a hash-named stage pack root",
    );
  });

  it("builds a repack structure json from game-ready files and excludes editor intermediates", () => {
    const files: StagePackFileEntry[] = [
      { relativePath: "0/0/base/model.numdlb", fileType: ".numdlb" },
      { relativePath: "0/0/base/model.numshb", fileType: ".numshb" },
      { relativePath: "0/0/base/model.nusktb", fileType: ".nusktb" },
      { relativePath: "0/0/base/model__maya__.numatb", fileType: ".numatb" },
      { relativePath: "0/0/base/model__nust__.numatb", fileType: ".numatb" },
      { relativePath: "0/0/base/model.jnttbl", fileType: ".jnttbl" },
      { relativePath: "0/0/base/model.dae", fileType: ".dae" },
      { relativePath: "0/0/base/dae_to_ssbh.log", fileType: ".log" },
    ];

    const json = buildStageStructureJsonFromFiles({
      packFolderName: "16F73C97",
      files,
    });

    expect(json.Magic).toBe(-843925575);
    expect(json.Fhm2dTotalCount).toBe(6);
    expect(json.SubFileData?.map((entry) => entry.fileUrl)).toEqual([
      "16F73C97/0/0/base/model.numdlb",
      "16F73C97/0/0/base/model.numshb",
      "16F73C97/0/0/base/model.nusktb",
      "16F73C97/0/0/base/model__maya__.numatb",
      "16F73C97/0/0/base/model__nust__.numatb",
      "16F73C97/0/0/base/model.jnttbl",
    ]);
    expect(json.SubFileStructure?.filter((entry) => entry.type === "Item")).toHaveLength(6);
  });
});
