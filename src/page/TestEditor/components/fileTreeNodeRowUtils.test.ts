import { describe, expect, it } from "vitest";

import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import type { TestTreeNode } from "../types";
import {
  collectStructureJsonPathKeys,
  parseWorkspacePackNodeTarget,
} from "./fileTreeNodeRowUtils";

function dir(path: string, children: TestTreeNode[] = []): TestTreeNode {
  const name = path.replace(/[\\/]+$/, "").split(/[/\\]/).pop() ?? path;
  return {
    id: path,
    name,
    path,
    isDir: true,
    children,
  };
}

function file(path: string): TestTreeNode {
  const name = path.split(/[/\\]/).pop() ?? path;
  return {
    id: path,
    name,
    path,
    isDir: false,
  };
}

describe("parseWorkspacePackNodeTarget", () => {
  it("resolves a configured nested hash folder", () => {
    const target = parseWorkspacePackNodeTarget(
      dir("E:/workspace/002chara/0xBDBE6FEA"),
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
    );
    expect(target).toMatchObject({
      packKey: "002chara/0xBDBE6FEA",
      folderPath: "E:/workspace/002chara/0xBDBE6FEA",
      structureJsonPath: "E:/workspace/002chara/0xBDBE6FEA_structure.json",
    });
  });

  it("resolves the sibling structure JSON to the same pack", () => {
    const target = parseWorkspacePackNodeTarget(
      file("E:/workspace/002chara/0xBDBE6FEA_structure.json"),
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
    );
    expect(target?.folderPath).toBe("E:/workspace/002chara/0xBDBE6FEA");
    expect(target?.packKey).toBe("002chara/0xBDBE6FEA");
  });

  it("rejects route folders and non-structure files", () => {
    expect(
      parseWorkspacePackNodeTarget(
        dir("E:/workspace/002chara"),
        "E:/workspace",
        DEFAULT_TEST_EDITOR_WORKSPACE,
      ),
    ).toBeNull();
    expect(
      parseWorkspacePackNodeTarget(
        file("E:/workspace/002chara/readme.json"),
        "E:/workspace",
        DEFAULT_TEST_EDITOR_WORKSPACE,
      ),
    ).toBeNull();
  });

  it("resolves a nested 009gui extract folder when its sibling structure JSON is indexed", () => {
    const packFolder =
      "E:/workspace/009gui/image/pilot/vs_p_l/wing_gundam_zero_rebellion_image_vs_p_l_016_001_c01";
    const structureJson = `${packFolder}_structure.json`;
    const keys = new Set([structureJson.replace(/\\/g, "/").toLowerCase()]);
    const target = parseWorkspacePackNodeTarget(
      dir(packFolder),
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      keys,
    );
    expect(target).toMatchObject({
      packKey:
        "009gui/image/pilot/vs_p_l/wing_gundam_zero_rebellion_image_vs_p_l_016_001_c01",
      folderPath: packFolder,
      structureJsonPath: structureJson,
    });
  });

  it("resolves a nested 009gui structure JSON to the extract folder", () => {
    const packFolder =
      "E:/workspace/009gui/image/pilot/vs_p_l/wing_gundam_zero_rebellion_image_vs_p_l_016_001_c01";
    const structureJson = `${packFolder}_structure.json`;
    const keys = new Set([structureJson.replace(/\\/g, "/").toLowerCase()]);
    const target = parseWorkspacePackNodeTarget(
      file(structureJson),
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      keys,
    );
    expect(target?.folderPath).toBe(packFolder);
    expect(target?.structureJsonPath).toBe(structureJson);
  });
});

describe("collectStructureJsonPathKeys", () => {
  it("indexes nested structure JSON paths", () => {
    const paths = collectStructureJsonPathKeys([
      dir("E:/workspace/002chara", [
        file("E:/workspace/002chara/0xBDBE6FEA_structure.json"),
      ]),
    ]);
    expect(paths.has("e:/workspace/002chara/0xbdbe6fea_structure.json")).toBe(true);
  });
});
