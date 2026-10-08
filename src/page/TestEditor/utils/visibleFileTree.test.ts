import { describe, expect, it } from "vitest";
import type { TestTreeNode } from "../types";
import { DEFAULT_FILE_TREE_VIEW_OPTIONS } from "./fileTreeViewSort";
import { visibleFileTreeNodes } from "./visibleFileTree";

function file(name: string, path: string): TestTreeNode {
  return { id: path, name, path, isDir: false };
}

function folder(name: string, path: string, children: TestTreeNode[]): TestTreeNode {
  return { id: path, name, path, isDir: true, children };
}

describe("visibleFileTreeNodes", () => {
  const tree = [
    folder("units", "E:/ws/units", [
      file("alpha.nud", "E:/ws/units/alpha.nud"),
      file("bravo.nud", "E:/ws/units/bravo.nud"),
      file("zeta.nud", "E:/ws/units/zeta.nud"),
    ]),
    folder("other", "E:/ws/other", [file("noise.nud", "E:/ws/other/noise.nud")]),
  ];
  const starOrder = ["E:\\ws\\units\\zeta.nud"];

  it("pins a starred sibling to the front of its folder after view-sort and search", () => {
    const unfiltered = visibleFileTreeNodes(tree, "", DEFAULT_FILE_TREE_VIEW_OPTIONS, starOrder);
    expect(unfiltered.map((node) => node.name)).toEqual(["other", "units"]);
    const unfilteredChildren = unfiltered.find((node) => node.name === "units")?.children ?? [];
    expect(unfilteredChildren.map((node) => node.name)).toEqual(["zeta.nud", "alpha.nud", "bravo.nud"]);
    expect(unfilteredChildren.filter((node) => node.name === "zeta.nud")).toHaveLength(1);
    expect(unfiltered[0]?.name).not.toBe("zeta.nud");

    const searched = visibleFileTreeNodes(tree, "bravo", DEFAULT_FILE_TREE_VIEW_OPTIONS, starOrder);
    expect(searched.map((node) => node.name)).toEqual(["units"]);
    const names = (searched[0]?.children ?? []).map((node) => node.name);
    expect(names).toEqual(["zeta.nud", "bravo.nud"]);
    expect(names.indexOf("zeta.nud")).toBe(0);
    expect(names.lastIndexOf("zeta.nud")).toBe(0);
  });
});