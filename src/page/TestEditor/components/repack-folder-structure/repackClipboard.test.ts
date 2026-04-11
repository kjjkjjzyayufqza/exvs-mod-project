import { describe, expect, it } from "vitest";

import type { TreeDataItem } from "@/lib/utils";
import {
  copyNodesToClipboard,
  pasteClipboardItems,
  type RepackClipboardProjectData,
  type RepackSubFileDataItem,
} from "@/page/TestEditor/components/repack-folder-structure/repackClipboard";

function createItem(
  id: string,
  name: string,
  fileIndex: number,
  fileType = ".bin",
  fileUrl = `.\\data\\${fileIndex}.bin`,
): TreeDataItem {
  return {
    id,
    name,
    data: {
      type: "Item",
      index: fileIndex,
      fileIndex,
      originalFileIndex: fileIndex,
      fileType,
      fileUrl,
      unk1: "00000000",
      unk2: "00000000",
      unk2_1: 0,
      unk3: 0,
      unk4: 0,
      _originalSubFileData: {
        index: fileIndex,
        fileType,
        fileIndex,
        fileUrl,
      },
    },
  };
}

function createFolder(id: string, name: string, children: TreeDataItem[]): TreeDataItem {
  return {
    id,
    name,
    children,
    data: {
      type: "Folder",
      index: children.length,
      folderCount: children.length,
      unk1: "00000000",
      unk2: "00000000",
      unk2_1: 0,
      unk3: 0,
      unk4: 0,
      unk5: 0,
      unk6: 0,
    },
  };
}

function findNodeByName(nodes: TreeDataItem[], name: string): TreeDataItem | null {
  for (const node of nodes) {
    if (node.name === name) {
      return node;
    }
    if (node.children) {
      const hit = findNodeByName(node.children, name);
      if (hit) {
        return hit;
      }
    }
  }
  return null;
}

describe("repackClipboard", () => {
  it("copies selected nodes in tree order and returns deep clones", () => {
    const treeData = [
      createFolder("folder-a", "Folder A", [createItem("child-a", "Child A", 0)]),
      createItem("item-b", "Item B", 1),
    ];

    const copiedItems = copyNodesToClipboard(treeData, ["item-b", "folder-a"]);

    expect(copiedItems.map((item) => item.name)).toEqual(["Folder A", "Item B"]);
    expect(copiedItems[0]).not.toBe(treeData[0]);
    expect(copiedItems[0]?.children?.[0]).not.toBe(treeData[0]?.children?.[0]);

    treeData[0]!.children![0]!.name = "Mutated Child";
    expect(copiedItems[0]?.children?.[0]?.name).toBe("Child A");
  });

  it("pastes the full clipboard set into a folder and rewrites item indices consistently", () => {
    const targetFolder = createFolder("target-folder", "Target Folder", [createItem("existing-item", "Existing Item", 0)]);
    const copiedFolder = createFolder("copied-folder", "Copied Folder", [createItem("nested-item", "Nested Item", 10)]);
    const looseItem = createItem("loose-item", "Loose Item", 11, ".numdlb", ".\\data\\11.numdlb");
    const treeData = [targetFolder, copiedFolder, looseItem];

    const clipboardItems = copyNodesToClipboard(treeData, ["loose-item", "copied-folder"]);
    const completeProjectData: RepackClipboardProjectData<RepackSubFileDataItem> = {
      Fhm2dTotalCount: 1,
      SubFileData: [
        {
          index: 0,
          fileType: ".bin",
          fileIndex: 0,
          fileUrl: ".\\data\\0.bin",
        },
      ],
    };

    const result = pasteClipboardItems({
      treeData,
      parentId: "target-folder",
      clipboardItems,
      completeProjectData,
    });

    const nextTargetFolder = findNodeByName(result.treeData, "Target Folder");
    const pastedFolder = nextTargetFolder?.children?.find((node) => node.name === "Copied Folder") ?? null;
    const pastedLooseItem = nextTargetFolder?.children?.find((node) => node.name === "Loose Item") ?? null;
    const pastedNestedItem = pastedFolder?.children?.find((node) => node.name === "Nested Item") ?? null;

    expect(result.pastedItems).toHaveLength(2);
    expect(nextTargetFolder?.children).toHaveLength(3);
    expect(nextTargetFolder?.data?.folderCount).toBe(3);

    expect(pastedFolder?.id).not.toBe("copied-folder");
    expect(pastedLooseItem?.id).not.toBe("loose-item");
    expect(pastedNestedItem?.id).not.toBe("nested-item");

    expect(pastedNestedItem?.data?.fileIndex).toBe(1);
    expect(pastedNestedItem?.data?.index).toBe(1);
    expect(pastedNestedItem?.data?.originalFileIndex).toBe(1);
    expect(pastedLooseItem?.data?.fileIndex).toBe(2);
    expect(pastedLooseItem?.data?.index).toBe(2);
    expect(pastedLooseItem?.data?.originalFileIndex).toBe(2);

    expect(result.completeProjectData?.Fhm2dTotalCount).toBe(3);
    expect(result.completeProjectData?.SubFileData.map((item) => item.fileIndex)).toEqual([0, 1, 2]);
    expect(result.completeProjectData?.SubFileData[1]).toMatchObject({
      index: 1,
      fileIndex: 1,
      fileType: ".bin",
      fileUrl: ".\\data\\10.bin",
    });
    expect(result.completeProjectData?.SubFileData[2]).toMatchObject({
      index: 2,
      fileIndex: 2,
      fileType: ".numdlb",
      fileUrl: ".\\data\\11.numdlb",
    });
  });
});
