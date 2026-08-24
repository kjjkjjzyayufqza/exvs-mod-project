import { describe, expect, it } from "vitest";

import { DEFAULT_TEST_EDITOR_WORKSPACE } from "./defaults";
import { classifyWorkspacePackPath } from "./packIdentity";
import type { TestEditorWorkspaceDocument } from "./types";

function classify(
  nodePath: string,
  document: TestEditorWorkspaceDocument = DEFAULT_TEST_EDITOR_WORKSPACE,
  nodeIsDirectory = false,
) {
  return classifyWorkspacePackPath({
    workspaceRoot: "E:/workspace",
    nodePath,
    nodeIsDirectory,
    document,
  });
}

describe("classifyWorkspacePackPath", () => {
  it("classifies a nested Character Model file as 002chara/0xBDBE6FEA", () => {
    expect(classify("E:/workspace/002chara/0xBDBE6FEA/0.numdlb")).toEqual({
      packKey: "002chara/0xBDBE6FEA",
      routeId: "unit.model",
      prefix: "002chara",
      hashFolderName: "0xBDBE6FEA",
      folderPath: "E:/workspace/002chara/0xBDBE6FEA",
      structureJsonPath: "E:/workspace/002chara/0xBDBE6FEA_structure.json",
      sourceLayout: "configured",
    });
  });

  it("keeps equal hashes under different prefixes distinct", () => {
    expect(classify("E:/workspace/002chara/0x12345678/a.bin")?.packKey).toBe(
      "002chara/0x12345678",
    );
    expect(classify("E:/workspace/006effect/0x12345678/b.bin")?.packKey).toBe(
      "006effect/0x12345678",
    );
  });

  it("classifies custom-named packs under configured prefixes", () => {
    expect(classify("E:/workspace/002chara/Gyan_model/body.numdlb")).toEqual({
      packKey: "002chara/Gyan_model",
      routeId: "unit.model",
      prefix: "002chara",
      hashFolderName: "Gyan_model",
      folderPath: "E:/workspace/002chara/Gyan_model",
      structureJsonPath: "E:/workspace/002chara/Gyan_model_structure.json",
      sourceLayout: "configured",
    });
  });

  it("classifies custom-named structure JSON files under configured prefixes", () => {
    expect(
      classify("E:/workspace/002chara/Gyan_model_structure.json", DEFAULT_TEST_EDITOR_WORKSPACE, false),
    )?.toMatchObject({
      packKey: "002chara/Gyan_model",
      hashFolderName: "Gyan_model",
      structureJsonPath: "E:/workspace/002chara/Gyan_model_structure.json",
    });
  });

  it("uses the longest configured prefix", () => {
    const document: TestEditorWorkspaceDocument = {
      ...DEFAULT_TEST_EDITOR_WORKSPACE,
      assetRoutes: {
        ...DEFAULT_TEST_EDITOR_WORKSPACE.assetRoutes,
        "unit.arms-param": {
          prefix: "041cpm/arms_param",
          kind: "fhm2d-pack",
          label: "Arms Param",
        },
      },
    };
    expect(classify("E:/workspace/041cpm/arms_param/0x12345678/a.bin", document)?.prefix).toBe(
      "041cpm/arms_param",
    );
  });

  it("classifies root-level packs only when legacy fallback is enabled", () => {
    expect(classify("E:/workspace/0x12345678/a.bin")?.sourceLayout).toBe("legacy");
    const document: TestEditorWorkspaceDocument = {
      ...DEFAULT_TEST_EDITOR_WORKSPACE,
      legacyReadFallback: false,
    };
    expect(classify("E:/workspace/0x12345678/a.bin", document)).toBeNull();
  });

  it("returns null for route directories and unrelated files", () => {
    expect(classify("E:/workspace/002chara", DEFAULT_TEST_EDITOR_WORKSPACE, true)).toBeNull();
    expect(classify("E:/workspace/test_editor_workspace.json")).toBeNull();
  });

  it("ignores any path under a .git directory", () => {
    expect(classify("E:/workspace/.git/index")).toBeNull();
    expect(classify("E:/workspace/002chara/0xBDBE6FEA/.git/HEAD")).toBeNull();
    expect(classify("E:\\workspace\\002chara\\0xBDBE6FEA\\.git\\objects\\aa")).toBeNull();
    expect(classify("E:/workspace/002chara/0xBDBE6FEA/.gitignore")?.packKey).toBe(
      "002chara/0xBDBE6FEA",
    );
  });

  it("maps duplicate prefixes to a null route id while keeping the physical pack key", () => {
    const identity = classify("E:/workspace/012list/0x036B9E67/character_id_table.bin");
    expect(identity?.routeId).toBeNull();
    expect(identity?.packKey).toBe("012list/0x036B9E67");
  });

  it("classifies nested GUI structure JSON without treating image as the pack", () => {
    expect(
      classify(
        "E:/workspace/009gui/image/pilot/vs_p_l/wing_gundam_zero_rebellion_image_vs_p_l_016_001_c01_structure.json",
      ),
    ).toMatchObject({
      packKey:
        "009gui/image/pilot/vs_p_l/wing_gundam_zero_rebellion_image_vs_p_l_016_001_c01",
      prefix: "009gui/image/pilot/vs_p_l",
      hashFolderName: "wing_gundam_zero_rebellion_image_vs_p_l_016_001_c01",
      folderPath:
        "E:/workspace/009gui/image/pilot/vs_p_l/wing_gundam_zero_rebellion_image_vs_p_l_016_001_c01",
      structureJsonPath:
        "E:/workspace/009gui/image/pilot/vs_p_l/wing_gundam_zero_rebellion_image_vs_p_l_016_001_c01_structure.json",
    });
  });

  it("uses the deepest sibling structure JSON when classifying nested GUI files", () => {
    const keys = new Set([
      "e:/workspace/009gui/image/pilot/vs_p_l/wing_gundam_zero_rebellion_image_vs_p_l_016_001_c01_structure.json",
    ]);
    const identity = classifyWorkspacePackPath({
      workspaceRoot: "E:/workspace",
      nodePath:
        "E:/workspace/009gui/image/pilot/vs_p_l/wing_gundam_zero_rebellion_image_vs_p_l_016_001_c01/VS_P_L.nutexb",
      nodeIsDirectory: false,
      document: DEFAULT_TEST_EDITOR_WORKSPACE,
      structureJsonPathKeys: keys,
    });
    expect(identity?.packKey).toBe(
      "009gui/image/pilot/vs_p_l/wing_gundam_zero_rebellion_image_vs_p_l_016_001_c01",
    );
    expect(identity?.folderPath).toBe(
      "E:/workspace/009gui/image/pilot/vs_p_l/wing_gundam_zero_rebellion_image_vs_p_l_016_001_c01",
    );
  });

  it("keeps character inner folders from stealing the pack when structure JSON keys exist", () => {
    const keys = new Set(["e:/workspace/002chara/0xbdbe6fea_structure.json"]);
    const identity = classifyWorkspacePackPath({
      workspaceRoot: "E:/workspace",
      nodePath: "E:/workspace/002chara/0xBDBE6FEA/001/body.numdlb",
      nodeIsDirectory: false,
      document: DEFAULT_TEST_EDITOR_WORKSPACE,
      structureJsonPathKeys: keys,
    });
    expect(identity?.packKey).toBe("002chara/0xBDBE6FEA");
  });
});
