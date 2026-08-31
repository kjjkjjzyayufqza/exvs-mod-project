import { describe, expect, it } from "vitest";
import {
  addMotionFolderBundle,
  addMotionItemNode,
  isValidMotionHexId,
  moveArrayItem,
  moveMotionFolderChild,
  previewAddMotionFileTarget,
  previewAddMotionFolderTargets,
  removeMotionNode,
  reorderMotionFolderChildren,
  serializeMotionProject,
  suggestNextMotionBundleFolderName,
  updateMotionNode,
  type MotionFolderNode,
  type MotionItemNode,
  type MotionStructureNode,
  type MotionStructureProject,
} from "./motionFolderService";

function findFolderByName(nodes: MotionStructureNode[], name: string): MotionFolderNode | undefined {
  for (const node of nodes) {
    if (node.kind === "folder") {
      if (node.name === name) return node;
      const nested = findFolderByName(node.children, name);
      if (nested) return nested;
    }
  }
  return undefined;
}

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

  it("validates 8-digit motion hex ids", () => {
    expect(isValidMotionHexId("0f1fc213")).toBe(true);
    expect(isValidMotionHexId("0x0F1FC213")).toBe(true);
    expect(isValidMotionHexId("")).toBe(false);
    expect(isValidMotionHexId("0000000")).toBe(false);
    expect(isValidMotionHexId("zzzzzzzz")).toBe(false);
  });

  it("suggests next numeric bundle folder name", () => {
    const parent = baseNodes()[0]!;
    expect(suggestNextMotionBundleFolderName(parent)).toBe("0");
    const withFolders: MotionFolderNode = {
      ...parent,
      children: [
        ...parent.children,
        {
          id: "folder:0/0",
          kind: "folder",
          parentId: parent.id,
          name: "0",
          link: false,
          depth: 1,
          pathSegments: ["0", "0"],
          children: [],
          unk1: "aaaaaaaa",
          unk2: "00000000",
          unk2_1: 0,
          unk3: 2,
          unk4: 0,
          unk5: 0,
          unk6: 0,
          rawStructure: null,
          rawParse: null,
        },
        {
          id: "folder:0/3",
          kind: "folder",
          parentId: parent.id,
          name: "3",
          link: false,
          depth: 1,
          pathSegments: ["0", "3"],
          children: [],
          unk1: "bbbbbbbb",
          unk2: "00000000",
          unk2_1: 0,
          unk3: 2,
          unk4: 0,
          unk5: 0,
          unk6: 0,
          rawStructure: null,
          rawParse: null,
        },
      ],
    };
    expect(suggestNextMotionBundleFolderName(withFolders)).toBe("4");
  });

  it("adds a folder-format motion bundle (folder unk1=action id, item unk2=model id)", () => {
    const result = addMotionFolderBundle({
      nodes: baseNodes(),
      parentFolderId: "folder:0",
      folderName: "0",
      actionId: "0f1fc213",
      unk3: 2,
      clips: [
        {
          sourcePath: "E:\\source\\body.nuanmb",
          name: "001hito_clip",
          modelId: "43309cab",
        },
        {
          sourcePath: "E:\\source\\weapon.nuanmb",
          name: "400stick_clip",
          modelId: "59990c22",
        },
      ],
      rootName: "pack",
      motionRoot: "E:\\workspace\\003motion\\pack",
    });

    expect(result.folder.pathSegments).toEqual(["0", "0"]);
    expect(result.folder.unk1).toBe("0f1fc213");
    expect(result.folder.unk3).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      name: "001hito_clip",
      unk1: "00000000",
      unk2: "43309cab",
      pathSegments: ["0", "0"],
    });
    expect(result.items[1]).toMatchObject({
      name: "400stick_clip",
      unk1: "00000000",
      unk2: "59990c22",
    });
    expect(result.copyJobs).toEqual([
      {
        sourcePath: "E:\\source\\body.nuanmb",
        targetPath: "E:\\workspace\\003motion\\pack\\0\\0\\001hito_clip.nuanmb",
      },
      {
        sourcePath: "E:\\source\\weapon.nuanmb",
        targetPath: "E:\\workspace\\003motion\\pack\\0\\0\\400stick_clip.nuanmb",
      },
    ]);

    const serialized = serializeMotionProject(baseProject(), result.nodes, "pack");
    expect(serialized.SubFileData).toHaveLength(3);
    expect(serialized.SubFileStructure).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "Folder",
          Name: "0",
          unk1: "0f1fc213",
          unk3: 2,
          folderCount: 2,
        }),
        expect.objectContaining({
          type: "Item",
          Name: "001hito_clip",
          unk1: "00000000",
          unk2: "43309cab",
        }),
        expect.objectContaining({
          type: "Item",
          Name: "400stick_clip",
          unk1: "00000000",
          unk2: "59990c22",
        }),
      ]),
    );
    const parseFolder = serialized.SubFileParseStructure?.children?.[0]?.children?.find(
      (child) => child.type === "Folder" && child.name === "0",
    );
    expect(parseFolder).toMatchObject({
      type: "Folder",
      unk1: "0f1fc213",
      unk3: 2,
    });
    expect(parseFolder?.children).toHaveLength(2);
    expect(parseFolder?.children?.[0]).toMatchObject({
      type: "Item",
      unk1: "00000000",
      unk2: "43309cab",
    });
  });

  it("removes a selected item from serialized structure", () => {
    const removed = removeMotionNode(baseNodes(), "item:0");
    const serialized = serializeMotionProject(baseProject(), removed.nodes, "pack");
    expect(removed.removed?.kind).toBe("item");
    expect(serialized.SubFileData).toHaveLength(0);
    expect(serialized.SubFileStructure.some((entry) => entry.type === "Item")).toBe(false);
  });

  it("reorders folder children and serializes item order for body-first packs", () => {
    const bundle = addMotionFolderBundle({
      nodes: baseNodes(),
      parentFolderId: "folder:0",
      folderName: "9",
      actionId: "a621fd5e",
      unk3: 2,
      clips: [
        { sourcePath: "E:\\source\\wing.nuanmb", name: "wing_clip", modelId: "c1a9c1f6" },
        { sourcePath: "E:\\source\\body.nuanmb", name: "body_clip", modelId: "9c5e24c7" },
      ],
      rootName: "pack",
      motionRoot: "E:\\workspace\\003motion\\pack",
    });

    expect(bundle.folder.children.map((child) => child.name)).toEqual(["wing_clip", "body_clip"]);

    const reordered = reorderMotionFolderChildren({
      nodes: bundle.nodes,
      folderId: bundle.folder.id,
      orderedChildIds: [bundle.items[1]!.id, bundle.items[0]!.id],
    });
    expect(findFolderByName(reordered, "9")?.children.map((child) => child.name)).toEqual([
      "body_clip",
      "wing_clip",
    ]);

    const serialized = serializeMotionProject(baseProject(), reordered, "pack");
    const parseFolder = serialized.SubFileParseStructure?.children?.[0]?.children?.find(
      (child) => child.type === "Folder" && child.name === "9",
    );
    expect(parseFolder?.children?.map((child) => child.unk2)).toEqual(["9c5e24c7", "c1a9c1f6"]);

    const movedDown = moveMotionFolderChild({
      nodes: reordered,
      folderId: bundle.folder.id,
      childId: bundle.items[1]!.id,
      direction: "down",
    });
    expect(findFolderByName(movedDown, "9")?.children.map((child) => child.name)).toEqual([
      "wing_clip",
      "body_clip",
    ]);

    expect(moveArrayItem(["a", "b", "c"], 2, "up")).toEqual(["a", "c", "b"]);
    expect(moveArrayItem(["a", "b"], 0, "up")).toEqual(["a", "b"]);
  });

  it("previews add targets and replaces existing folder when replaceExisting is set", () => {
    const parent = baseNodes()[0] as MotionFolderNode;
    const preview = previewAddMotionFolderTargets({
      motionRoot: "E:\\workspace\\003motion\\pack",
      rootName: "pack",
      parentFolder: parent,
      folderName: "trans_loop",
      clipNames: ["trans_loop_body", "trans_loop_wing"],
    });
    expect(preview.folderPath).toBe("E:\\workspace\\003motion\\pack\\0\\trans_loop");
    expect(preview.filePaths).toEqual([
      "E:\\workspace\\003motion\\pack\\0\\trans_loop\\trans_loop_body.nuanmb",
      "E:\\workspace\\003motion\\pack\\0\\trans_loop\\trans_loop_wing.nuanmb",
    ]);
    expect(preview.existingStructureFolder).toBeNull();

    expect(
      previewAddMotionFileTarget({
        motionRoot: "E:\\workspace\\003motion\\pack",
        rootName: "pack",
        parentFolder: parent,
        name: "solo",
      }),
    ).toBe("E:\\workspace\\003motion\\pack\\0\\solo.nuanmb");

    const first = addMotionFolderBundle({
      nodes: baseNodes(),
      parentFolderId: "folder:0",
      folderName: "trans_loop",
      actionId: "a621fd5e",
      clips: [
        { sourcePath: "E:\\source\\body.nuanmb", name: "trans_loop_body", modelId: "9c5e24c7" },
        { sourcePath: "E:\\source\\wing.nuanmb", name: "trans_loop_wing", modelId: "c1a9c1f6" },
      ],
      rootName: "pack",
      motionRoot: "E:\\workspace\\003motion\\pack",
    });
    expect(() =>
      addMotionFolderBundle({
        nodes: first.nodes,
        parentFolderId: "folder:0",
        folderName: "trans_loop",
        actionId: "a621fd5e",
        clips: [
          { sourcePath: "E:\\source\\body2.nuanmb", name: "trans_loop_body", modelId: "9c5e24c7" },
        ],
        rootName: "pack",
        motionRoot: "E:\\workspace\\003motion\\pack",
      }),
    ).toThrow(/already exists/);

    const replaced = addMotionFolderBundle({
      nodes: first.nodes,
      parentFolderId: "folder:0",
      folderName: "trans_loop",
      actionId: "b621fd5e",
      clips: [
        { sourcePath: "E:\\source\\body2.nuanmb", name: "trans_loop_body", modelId: "9c5e24c7" },
      ],
      rootName: "pack",
      motionRoot: "E:\\workspace\\003motion\\pack",
      replaceExisting: true,
    });
    const folder = findFolderByName(replaced.nodes, "trans_loop");
    expect(folder?.unk1).toBe("b621fd5e");
    expect(folder?.children).toHaveLength(1);
    expect(folder?.children[0]).toMatchObject({ name: "trans_loop_body", unk2: "9c5e24c7" });
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

  it("serializes a shared fileIndex as one SubFileData row and two tree Items", () => {
    const [root] = baseNodes();
    const original = root!.children[0] as MotionItemNode;
    const folder0: MotionFolderNode = {
      id: "folder:0/0",
      kind: "folder",
      parentId: root!.id,
      name: "0",
      link: false,
      depth: 1,
      pathSegments: ["0", "0"],
      children: [{
        ...original,
        id: "item:0",
        parentId: "folder:0/0",
        depth: 2,
        pathSegments: ["0", "0"],
      }],
      unk1: "00000000",
      unk2: "00000000",
      unk2_1: 0,
      unk3: 0,
      unk4: 0,
      unk5: 0,
      unk6: 0,
      rawStructure: null,
      rawParse: null,
    };
    const folder1: MotionFolderNode = {
      ...folder0,
      id: "folder:0/1",
      name: "1",
      pathSegments: ["0", "1"],
      children: [{
        ...original,
        id: "item:0/1:0:1",
        parentId: "folder:0/1",
        depth: 2,
        pathSegments: ["0", "1"],
      }],
    };
    const nodes: MotionStructureNode[] = [{
      ...root!,
      children: [folder0, folder1],
    }];

    const serialized = serializeMotionProject(baseProject(), nodes, "pack");
    expect(serialized.SubFileData).toHaveLength(1);
    expect(serialized.Fhm2dTotalCount).toBe(1);
    const itemEntries = serialized.SubFileStructure.filter((entry) => entry.type === "Item");
    expect(itemEntries).toHaveLength(2);
    expect(itemEntries.map((entry) => ("fileIndex" in entry ? entry.fileIndex : null))).toEqual([0, 0]);
  });

});
