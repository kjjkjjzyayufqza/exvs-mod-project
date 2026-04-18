import { describe, expect, it } from "vitest";
import {
  flattenVirtualTree,
  groupPreviewCandidatesByFolder,
  indexVirtualTreeEntries,
  toggleCandidateGroupSelection,
} from "./fhm2dMemoryPreviewUtils";
import type { Fhm2dPreviewCandidate, Fhm2dVirtualTreeNode } from "./fhm2dMemoryPreviewTypes";

const tree: Fhm2dVirtualTreeNode[] = [
  {
    id: "folder:pkg",
    kind: "folder",
    name: "pkg",
    virtualPath: "memory://s/pkg",
    relativePath: "pkg",
    parentRelativePath: null,
    fileIndex: null,
    fileType: null,
    size: null,
    childCount: 2,
    isModelRelated: true,
    hasReferenceIssue: false,
    selectedCandidate: false,
    children: [
      {
        id: "file:1",
        kind: "file",
        name: "body_model.numdlb",
        virtualPath: "memory://s/pkg/body_model.numdlb",
        relativePath: "pkg/body_model.numdlb",
        parentRelativePath: "pkg",
        fileIndex: 1,
        fileType: ".numdlb",
        size: 128,
        childCount: 0,
        isModelRelated: true,
        hasReferenceIssue: false,
        selectedCandidate: false,
        children: [],
      },
      {
        id: "file:2",
        kind: "file",
        name: "readme.bin",
        virtualPath: "memory://s/pkg/readme.bin",
        relativePath: "pkg/readme.bin",
        parentRelativePath: "pkg",
        fileIndex: 2,
        fileType: ".bin",
        size: 32,
        childCount: 0,
        isModelRelated: false,
        hasReferenceIssue: false,
        selectedCandidate: false,
        children: [],
      },
    ],
  },
];

describe("indexVirtualTreeEntries", () => {
  it("indexes nested nodes by id", () => {
    const index = indexVirtualTreeEntries(tree);
    expect(index["folder:pkg"]?.kind).toBe("folder");
    expect(index["file:1"]?.relativePath).toBe("pkg/body_model.numdlb");
  });
});

describe("flattenVirtualTree", () => {
  it("keeps matching ancestors visible when searching", () => {
    const rows = flattenVirtualTree(tree, new Set(), "body_model", false);
    expect(rows.map((row) => row.node.id)).toEqual(["folder:pkg", "file:1"]);
  });

  it("filters non-model-related rows when requested", () => {
    const rows = flattenVirtualTree(tree, new Set(), "", true);
    expect(rows.map((row) => row.node.id)).toEqual(["folder:pkg", "file:1"]);
  });
});

describe("groupPreviewCandidatesByFolder", () => {
  it("groups numdlb candidates by folder and counts complete entries", () => {
    const candidates: Fhm2dPreviewCandidate[] = [
      {
        id: "a",
        displayLabel: "A",
        folderRelativePath: "pkg/a",
        folderVirtualPath: "memory://s/pkg/a",
        modlEntryId: "file:1",
        modlVirtualPath: "memory://s/pkg/a/model.numdlb",
        meshVirtualPath: "memory://s/pkg/a/model.numshb",
        skelVirtualPath: null,
        matlVirtualPaths: [],
        nutexbVirtualPaths: [],
        issues: [],
        complete: true,
      },
      {
        id: "b",
        displayLabel: "B",
        folderRelativePath: "pkg/a",
        folderVirtualPath: "memory://s/pkg/a",
        modlEntryId: "file:2",
        modlVirtualPath: "memory://s/pkg/a/body.numdlb",
        meshVirtualPath: null,
        skelVirtualPath: null,
        matlVirtualPaths: [],
        nutexbVirtualPaths: [],
        issues: ["Missing mesh"],
        complete: false,
      },
    ];
    const groups = groupPreviewCandidatesByFolder(candidates);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.completeCount).toBe(1);
    expect(groups[0]?.candidates).toHaveLength(2);
  });
});

describe("toggleCandidateGroupSelection", () => {
  it("adds and removes grouped candidate ids", () => {
    const candidates: Fhm2dPreviewCandidate[] = [
      {
        id: "a",
        displayLabel: "A",
        folderRelativePath: "pkg/a",
        folderVirtualPath: "memory://s/pkg/a",
        modlEntryId: "file:1",
        modlVirtualPath: "memory://s/pkg/a/model.numdlb",
        meshVirtualPath: "memory://s/pkg/a/model.numshb",
        skelVirtualPath: null,
        matlVirtualPaths: [],
        nutexbVirtualPaths: [],
        issues: [],
        complete: true,
      },
      {
        id: "b",
        displayLabel: "B",
        folderRelativePath: "pkg/a",
        folderVirtualPath: "memory://s/pkg/a",
        modlEntryId: "file:2",
        modlVirtualPath: "memory://s/pkg/a/body.numdlb",
        meshVirtualPath: "memory://s/pkg/a/body.numshb",
        skelVirtualPath: null,
        matlVirtualPaths: [],
        nutexbVirtualPaths: [],
        issues: [],
        complete: true,
      },
    ];
    expect([...toggleCandidateGroupSelection(new Set(), candidates, true)]).toEqual(["a", "b"]);
    expect([...toggleCandidateGroupSelection(new Set(["a", "b"]), candidates, false)]).toEqual([]);
  });
});
