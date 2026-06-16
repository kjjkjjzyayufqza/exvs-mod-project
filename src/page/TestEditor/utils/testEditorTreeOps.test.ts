import { describe, expect, it } from "vitest";

import type { TestTreeNode } from "../types";
import { findTreeNodeByPath } from "./testEditorTreeOps";

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
});
