import { describe, expect, it } from "vitest";
import {
  addMotionItemNode,
  removeMotionNode,
  serializeMotionProject,
  updateMotionNode,
  type MotionFolderNode,
  type MotionItemNode,
  type MotionStructureProject,
} from "./motionFolderService";

function baseProject(): MotionStructureProject {
  return {
    Name: "pack",
    HashName: "0x12345678",
    Magic: 14,
    Fhm2dTotalCount: 1,
    UnkCount: 3,
    SubFileData: [
      {
        index: 0,
        fileType: ".bin",
        fileIndex: 0,
        fileUrl: ".\\pack\\0\\old_motion.nuanmb",
        fileBaseName: "old_motion",
      },
    ],
    SubFileStructure: [
      {
        type: "Folder",
        Name: "0",
        unk1: "00000000",
        folderCount: 1,
        unk2: "00000000",
        unk2_1: 0,
        unk3: 0,
        unk4: 0,
        unk5: 0,
        unk6: 0,
      },
      {
        type: "Item",
        Name: "old_motion",
        unk1: "00000000",
        fileIndex: 0,
        unk2: "11111111",
        unk2_1: 0,
        unk3: 0,
        unk4: 0,
        originalFileIndex: 0,
      },
      { type: "EndMark", endMarkCount: 1 },
    ],
    SubFileParseStructure: {
      name: "Root",
      children: [
        {
          type: "Folder",
          name: "0",
          link: false,
          unk1: "00000000",
          unk2: "00000000",
          unk3: 0,
          children: [
            {
              type: "Item",
              name: "0",
              link: true,
              unk1: "00000000",
              unk2: "11111111",
              unk3: 0,
            },
          ],
        },
      ],
    },
  };
}

function baseNodes(): MotionFolderNode[] {
  const item: MotionItemNode = {
    id: "item:0",
    kind: "item",
    parentId: "folder:0",
    name: "old_motion",
    link: true,
    depth: 1,
    pathSegments: ["0"],
    unk1: "00000000",
    unk2: "11111111",
    unk2_1: 0,
    unk3: 0,
    unk4: 0,
    fileIndex: 0,
    originalFileIndex: 0,
    fileType: ".bin",
    fileUrl: ".\\pack\\0\\old_motion.nuanmb",
    fileBaseName: "old_motion",
    filePath: "E:\\workspace\\003motion\\pack\\0\\old_motion.nuanmb",
    rawSubFileData: baseProject().SubFileData[0],
    rawStructure: baseProject().SubFileStructure[1] as MotionItemNode["rawStructure"],
    rawParse: baseProject().SubFileParseStructure?.children?.[0]?.children?.[0] ?? null,
  };

  return [
    {
      id: "folder:0",
      kind: "folder",
      parentId: null,
      name: "0",
      link: false,
      depth: 0,
      pathSegments: ["0"],
      children: [item],
      unk1: "00000000",
      unk2: "00000000",
      unk2_1: 0,
      unk3: 0,
      unk4: 0,
      unk5: 0,
      unk6: 0,
      rawStructure: baseProject().SubFileStructure[0] as MotionFolderNode["rawStructure"],
      rawParse: baseProject().SubFileParseStructure?.children?.[0] ?? null,
    },
  ];
}

describe("motionFolderService", () => {
  it("serializes edited item name, unk1, and unk2 into structure, data, and parse tree", () => {
    const project = baseProject();
    const nodes = baseNodes();
    const result = updateMotionNode({
      nodes,
      nodeId: "item:0",
      name: "new_motion",
      unk1: "12345678",
      unk2: "ABCDEF12",
      rootName: "pack",
      motionRoot: "E:\\workspace\\003motion\\pack",
    });

    const serialized = serializeMotionProject(project, result.nodes, "pack");
    expect(serialized.SubFileData[0]).toMatchObject({
      fileBaseName: "new_motion",
      fileUrl: ".\\pack\\0\\new_motion.nuanmb",
    });
    expect(serialized.SubFileStructure[1]).toMatchObject({
      type: "Item",
      Name: "new_motion",
      unk1: "12345678",
      unk2: "abcdef12",
      fileIndex: 0,
    });
    expect(serialized.SubFileParseStructure?.children?.[0]?.children?.[0]).toMatchObject({
      type: "Item",
      name: "0",
      unk1: "12345678",
      unk2: "abcdef12",
      link: true,
    });
    expect(result.renamedPaths[0]).toEqual({
      from: "E:\\workspace\\003motion\\pack\\0\\old_motion.nuanmb",
      to: "E:\\workspace\\003motion\\pack\\0\\new_motion.nuanmb",
    });
  });

  it("adds a nuanmb item under a folder", () => {
    const result = addMotionItemNode({
      nodes: baseNodes(),
      parentFolderId: "folder:0",
      sourcePath: "E:\\source\\added.nuanmb",
      name: "added",
      unk1: "33333333",
      unk2: "22222222",
      rootName: "pack",
      motionRoot: "E:\\workspace\\003motion\\pack",
    });

    const serialized = serializeMotionProject(baseProject(), result.nodes, "pack");
    expect(result.targetPath).toBe("E:\\workspace\\003motion\\pack\\0\\added.nuanmb");
    expect(serialized.SubFileData).toHaveLength(2);
    expect(serialized.SubFileStructure).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "Item", Name: "added", unk1: "33333333", unk2: "22222222" }),
      ]),
    );
    expect(serialized.SubFileParseStructure?.children?.[0]?.children?.[1]).toMatchObject({
      type: "Item",
      link: false,
      unk1: "33333333",
      unk2: "22222222",
    });
  });

  it("removes a selected item from serialized structure", () => {
    const removed = removeMotionNode(baseNodes(), "item:0");
    const serialized = serializeMotionProject(baseProject(), removed.nodes, "pack");
    expect(removed.removed?.kind).toBe("item");
    expect(serialized.SubFileData).toHaveLength(0);
    expect(serialized.SubFileStructure.some((entry) => entry.type === "Item")).toBe(false);
  });

  it("preserves parse link independently from nonzero unk2", () => {
    const project = baseProject();
    const nodes = baseNodes().map((folder) => ({
      ...folder,
      children: folder.children.map((node) => ({ ...node, link: false })),
    }));

    const serialized = serializeMotionProject(project, nodes, "pack");
    expect(serialized.SubFileParseStructure?.children?.[0]?.children?.[0]).toMatchObject({
      type: "Item",
      link: false,
      unk2: "11111111",
    });
  });

});
