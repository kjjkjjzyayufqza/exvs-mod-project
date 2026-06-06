import { describe, expect, it } from "vitest";
import {
  buildStagePackStructureJsonCandidates,
  parseStagePackFolderName,
} from "./stagePackNaming";

describe("stagePackNaming", () => {
  it("parses stage pack folder names with optional arbitrary suffixes", () => {
    expect(parseStagePackFolderName("16F73C97")).toEqual({
      folderName: "16F73C97",
      assetHashHex: "0x16F73C97",
      labelSuffix: "",
    });
    expect(parseStagePackFolderName("0x16F73C97_Minecraft_world_1")).toEqual({
      folderName: "0x16F73C97_Minecraft_world_1",
      assetHashHex: "0x16F73C97",
      labelSuffix: "_Minecraft_world_1",
    });
    expect(parseStagePackFolderName("0x16F73C97 a b c")).toEqual({
      folderName: "0x16F73C97 a b c",
      assetHashHex: "0x16F73C97",
      labelSuffix: " a b c",
    });
    expect(parseStagePackFolderName("16F73C97aa_sdaa-weqdsd")).toEqual({
      folderName: "16F73C97aa_sdaa-weqdsd",
      assetHashHex: "0x16F73C97",
      labelSuffix: "aa_sdaa-weqdsd",
    });
    expect(parseStagePackFolderName("custom/base")).toBeNull();
  });

  it("builds ordered structure json candidates with legacy hash-only fallbacks", () => {
    expect(
      buildStagePackStructureJsonCandidates("E:/XB/unpack/com/test", "16F73C97", "0x16F73C97"),
    ).toEqual([
      "E:/XB/unpack/com/test/16F73C97_structure.json",
      "E:/XB/unpack/com/test/0x16F73C97_structure.json",
    ]);

    expect(
      buildStagePackStructureJsonCandidates(
        "E:/XB/解包/com/test",
        "0x16F73C97_Minecraft_world_1",
        "0x16F73C97",
      ),
    ).toEqual([
      "E:/XB/解包/com/test/0x16F73C97_Minecraft_world_1_structure.json",
      "E:/XB/解包/com/test/0x16F73C97_structure.json",
      "E:/XB/解包/com/test/16F73C97_structure.json",
    ]);
  });
});
