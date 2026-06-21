import { describe, it, expect } from "vitest";

import {
  buildUnitModelStructureTree,
  collectModelGroupNames,
  mergeShlModelFolderNames,
  type UnitModelTreeNode,
} from "./unitModelStructureTree";

const STRUCTURE = {
  Magic: 10,
  SubFileData: [
    { fileIndex: 0, fileType: ".numdlb", fileBaseName: "body", fileUrl: "pkg/model_a/body.numdlb" },
    {
      fileIndex: 1,
      fileType: ".numatb",
      fileBaseName: "body__maya__",
      fileUrl: "pkg/model_a/body__maya__.numatb",
    },
  ],
  SubFileStructure: [
    { type: "Folder", unk2: "", unk3: 0, unk5: 0 },
    { type: "Folder", unk2: "", unk3: 0, unk5: 0 },
    { type: "Item", fileIndex: 0, unk2: "40000000", unk3: 0, Name: "body" },
    { type: "Item", fileIndex: 1, unk2: "21000000", unk3: 1, Name: "body__maya__" },
    { type: "EndMark", endMarkCount: 2 },
  ],
};

function findItem(node: UnitModelTreeNode, fileIndex: number): UnitModelTreeNode | null {
  if (node.kind === "item" && node.fileIndex === fileIndex) return node;
  for (const c of node.children ?? []) {
    const found = findItem(c, fileIndex);
    if (found) return found;
  }
  return null;
}

describe("buildUnitModelStructureTree fileUrl", () => {
  it("attaches the pool fileUrl onto item nodes", () => {
    const { root } = buildUnitModelStructureTree(STRUCTURE);
    expect(findItem(root, 0)?.fileUrl).toBe("pkg/model_a/body.numdlb");
    expect(findItem(root, 1)?.fileUrl).toBe("pkg/model_a/body__maya__.numatb");
  });

  it("leaves fileUrl undefined when the pool entry has none", () => {
    const noUrl = {
      ...STRUCTURE,
      SubFileData: [{ fileIndex: 0, fileType: ".numdlb", fileBaseName: "body" }],
      SubFileStructure: [
        { type: "Folder", unk2: "", unk3: 0, unk5: 0 },
        { type: "Item", fileIndex: 0, unk2: "40000000", unk3: 0, Name: "body" },
        { type: "EndMark", endMarkCount: 1 },
      ],
    };
    const { root } = buildUnitModelStructureTree(noUrl);
    expect(findItem(root, 0)?.fileUrl).toBeUndefined();
  });
});

describe("mergeShlModelFolderNames", () => {
  it("keeps structure order and appends disk-only models", () => {
    expect(mergeShlModelFolderNames(["body", "wing"], ["body", "N2_not_boom_mix_ship"])).toEqual([
      "body",
      "wing",
      "N2_not_boom_mix_ship",
    ]);
  });

  it("deduplicates case-insensitively", () => {
    expect(mergeShlModelFolderNames(["Body"], ["body", "Wing"])).toEqual(["Body", "Wing"]);
  });
});

describe("collectModelGroupNames", () => {
  it("walks model-group nodes in DFS order", () => {
    const tree = {
      Magic: 10,
      SubFileData: [
        { fileIndex: 0, fileType: ".numdlb", fileBaseName: "body", fileUrl: "models/body/body.numdlb" },
        { fileIndex: 1, fileType: ".numdlb", fileBaseName: "wing", fileUrl: "models/wing/wing.numdlb" },
      ],
      SubFileStructure: [
        { type: "Folder", unk2: "", unk3: 0, unk5: 0 },
        { type: "Folder", unk2: "", unk3: 0, unk5: 0 },
        { type: "Folder", unk2: "", unk3: 0, unk5: 0 },
        { type: "Item", fileIndex: 0, unk2: "40000000", unk3: 0, Name: "body" },
        { type: "EndMark", endMarkCount: 1 },
        { type: "Folder", unk2: "", unk3: 0, unk5: 0 },
        { type: "Item", fileIndex: 1, unk2: "40000000", unk3: 0, Name: "wing" },
        { type: "EndMark", endMarkCount: 1 },
        { type: "EndMark", endMarkCount: 2 },
        { type: "EndMark", endMarkCount: 1 },
      ],
    };
    const { root } = buildUnitModelStructureTree(tree);
    expect(collectModelGroupNames(root)).toEqual(["body", "wing"]);
  });
});
