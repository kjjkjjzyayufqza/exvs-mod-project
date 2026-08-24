import { describe, expect, it } from "vitest";
import {
  buildNutexbTree,
  collectNutexbFilesUnder,
  collectNutexbFolderIds,
  findNutexbTreeNode,
  flattenNutexbTree,
  visibleNutexbFiles,
} from "./nutexbViewModel";

describe("nutexbViewModel", () => {
  const files = [
    { relativePath: "a.nutexb", path: "E:/mod/a.nutexb", size: 10 },
    { relativePath: "gui/p_l/vs_p_l.nutexb", path: "E:/mod/gui/p_l/vs_p_l.nutexb", size: 20 },
    { relativePath: "gui/p_r/vs_p_r.nutexb", path: "E:/mod/gui/p_r/vs_p_r.nutexb", size: 30 },
  ];

  it("nests folders and sorts folders before files", () => {
    const tree = buildNutexbTree("mod", files);
    expect(tree.children.map((child) => child.name)).toEqual(["gui", "a.nutexb"]);
    const gui = tree.children[0];
    expect(gui?.kind).toBe("folder");
    expect(gui?.children.map((child) => child.name)).toEqual(["p_l", "p_r"]);
    expect(collectNutexbFilesUnder(gui!).map((node) => node.name)).toEqual([
      "vs_p_l.nutexb",
      "vs_p_r.nutexb",
    ]);
    expect(collectNutexbFolderIds(tree)).toEqual(["", "gui", "gui/p_l", "gui/p_r"]);
    expect(tree.fileCount).toBe(3);
    expect(gui?.fileCount).toBe(2);
  });

  it("hides collapsed folder children unless searching", () => {
    const tree = buildNutexbTree("mod", files);
    const collapsed = flattenNutexbTree(tree, new Set(["gui"]), "");
    expect(collapsed.map((row) => row.node.name)).toEqual(["mod", "gui", "a.nutexb"]);
    const searched = flattenNutexbTree(tree, new Set(["gui"]), "vs_p_l");
    expect(searched.some((row) => row.node.name === "vs_p_l.nutexb")).toBe(true);
    expect(findNutexbTreeNode(tree, "gui/p_l/vs_p_l.nutexb")?.path).toContain("vs_p_l.nutexb");
  });

  it("shows all files at root and filters by search across folders", () => {
    const tree = buildNutexbTree("mod", files);
    expect(visibleNutexbFiles(tree, "", "").map((node) => node.name)).toEqual([
      "vs_p_l.nutexb",
      "vs_p_r.nutexb",
      "a.nutexb",
    ]);
    expect(visibleNutexbFiles(tree, "gui/p_l", "").map((node) => node.name)).toEqual([
      "vs_p_l.nutexb",
    ]);
    expect(visibleNutexbFiles(tree, "gui/p_r", "vs_p_l").map((node) => node.name)).toEqual([
      "vs_p_l.nutexb",
    ]);
  });
});
