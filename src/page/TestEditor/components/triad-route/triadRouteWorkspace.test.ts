import { describe, expect, it } from "vitest";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import {
  buildExpectedStageScriptFolder,
  buildStageScriptExtractTarget,
  buildStageScriptFolderCandidates,
  buildStageScriptSourceFhm2dPath,
  stageScriptPayloadFileName,
} from "./triadRouteWorkspace";

describe("extractStageScriptPackage paths", () => {
  it("interpolates the package hash into the dplcache file name", () => {
    expect(
      buildStageScriptSourceFhm2dPath(
        "E:\\OBHK0.3_v27\\data\\x64\\dplcache_release",
        0x67af_23fa,
      ),
    ).toBe("E:\\OBHK0.3_v27\\data\\x64\\dplcache_release\\0x67AF23FA.fhm2d");
  });

  it("puts the scene folder under the mission prefix", () => {
    expect(
      buildStageScriptExtractTarget("E:\\XB\\mod", "051mission", "000triad_battle_a001_001"),
    ).toBe("E:\\XB\\mod/051mission/000triad_battle_a001_001");
  });

  it("lists unique lookup folders under each script root", () => {
    expect(
      buildStageScriptFolderCandidates(
        ["E:\\XB\\mod/051mission", "E:\\XB\\mod/051mission"],
        "000triad_battle_a001_001",
      ),
    ).toEqual(["E:\\XB\\mod/051mission/000triad_battle_a001_001"]);
    expect(buildStageScriptFolderCandidates(["E:\\XB\\mod/051mission"], null)).toEqual([]);
  });

  it("uses the mission.script prefix as the unpack destination", () => {
    const document = {
      assetRoutes: { "mission.script": { prefix: "051mission" } },
    } as unknown as TestEditorWorkspaceDocument;
    expect(
      buildExpectedStageScriptFolder("E:\\XB\\mod", document, "000triad_battle_a001_001"),
    ).toBe("E:\\XB\\mod/051mission/000triad_battle_a001_001");
    expect(buildExpectedStageScriptFolder("E:\\XB\\mod", document, null)).toBeNull();
  });
});

describe("stageScriptPayloadFileName", () => {
  it("uses the scene name as the .mismsexc stem", () => {
    expect(stageScriptPayloadFileName("000triad_battle_a001_001")).toBe(
      "000triad_battle_a001_001.mismsexc",
    );
    expect(stageScriptPayloadFileName("000triad_battle_a002_001_r1")).toBe(
      "000triad_battle_a002_001_r1.mismsexc",
    );
  });

  it("does not double the extension when the scene name already has it", () => {
    expect(stageScriptPayloadFileName("000triad_battle_a001_001.mismsexc")).toBe(
      "000triad_battle_a001_001.mismsexc",
    );
  });

  it("rejects empty or path-like scene names", () => {
    expect(() => stageScriptPayloadFileName("  ")).toThrow("Scene name is required");
    expect(() => stageScriptPayloadFileName("a/b")).toThrow("Unsafe scene name");
    expect(() => stageScriptPayloadFileName("..\\evil")).toThrow("Unsafe scene name");
  });
});
