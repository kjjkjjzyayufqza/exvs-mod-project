import { describe, it, expect } from "vitest";

import { buildUnitModelStructureTree, type UnitModelTreeNode } from "./unitModelStructureTree";

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
