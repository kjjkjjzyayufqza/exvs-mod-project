import { describe, expect, it } from "vitest";

import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import type { TestTreeNode } from "../types";
import { findTreeNodeByPath, getDirtyPackFromPath } from "./testEditorTreeOps";

function dir(path: string, name: string, children: TestTreeNode[] = []): TestTreeNode {
  return {
    id: path,
    name,
    path,
    isDir: true,
    children,
  };
}

describe("findTreeNodeByPath", () => {
  const rootDir = "E:/workspace/com/file";
  const tree: TestTreeNode[] = [
    dir(`${rootDir}/0xA258a522`, "0xA258a522"),
    dir(`${rootDir}/0x036B9E67`, "0x036B9E67"),
  ];

  it("matches by normalized full path", () => {
    const hit = findTreeNodeByPath(tree, "E:\\workspace\\com\\file\\0xA258a522", rootDir);
    expect(hit?.name).toBe("0xA258a522");
  });

  it("falls back to folder name when hash casing differs", () => {
    const hit = findTreeNodeByPath(tree, "E:\\workspace\\com\\file\\0xA258A522", rootDir);
    expect(hit?.name).toBe("0xA258a522");
  });

  it("returns null for paths outside the workspace root", () => {
    expect(findTreeNodeByPath(tree, "D:/other/0xA258a522", rootDir)).toBeNull();
  });

  it("finds a nested hash folder by its configured full path", () => {
    const nestedTree = [
      dir("E:/workspace/002chara", "002chara", [
        dir("E:/workspace/002chara/0xBDBE6FEA", "0xBDBE6FEA"),
      ]),
    ];

    expect(
      findTreeNodeByPath(nestedTree, "E:\\workspace\\002chara\\0xBDBE6FEA", "E:/workspace")
        ?.name,
    ).toBe("0xBDBE6FEA");
  });
});

describe("getDirtyPackFromPath", () => {
  it("returns a nested dirty pack for watcher file events", () => {
    const identity = getDirtyPackFromPath(
      "E:/workspace/002chara/0xBDBE6FEA/0.numdlb",
      "E:/workspace",
      false,
      DEFAULT_TEST_EDITOR_WORKSPACE,
    );
    expect(identity?.packKey).toBe("002chara/0xBDBE6FEA");
    expect(identity?.folderPath).toBe("E:/workspace/002chara/0xBDBE6FEA");
  });

  it("keeps structure JSON events paired with their nested folder", () => {
    const identity = getDirtyPackFromPath(
      "E:/workspace/002chara/0xBDBE6FEA_structure.json",
      "E:/workspace",
      false,
      DEFAULT_TEST_EDITOR_WORKSPACE,
    );
    expect(identity?.packKey).toBe("002chara/0xBDBE6FEA");
    expect(identity?.structureJsonPath).toBe(
      "E:/workspace/002chara/0xBDBE6FEA_structure.json",
    );
  });
});
