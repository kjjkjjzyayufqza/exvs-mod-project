import { describe, expect, it } from "vitest";
import type { Fhm2dVirtualTreeNode } from "@/components/ssbh-model-preview/fhm2dMemoryPreviewTypes";
import {
  collectVirtualFiles,
  formatByteSize,
  isFhm2dImageFile,
  partitionFhm2dImageViewFiles,
} from "./fhm2dImageViewModel";

function fileNode(
  name: string,
  fileType: string,
  children: Fhm2dVirtualTreeNode[] = [],
): Fhm2dVirtualTreeNode {
  return {
    id: name,
    kind: children.length > 0 ? "folder" : "file",
    name,
    virtualPath: `memory://s/${name}`,
    relativePath: name,
    parentRelativePath: null,
    fileIndex: children.length > 0 ? null : 1,
    fileType: children.length > 0 ? null : fileType,
    size: children.length > 0 ? null : 12,
    childCount: children.length,
    isModelRelated: false,
    hasReferenceIssue: false,
    selectedCandidate: false,
    children,
  };
}

describe("fhm2dImageViewModel", () => {
  it("treats nutexb as images even when the type field is missing", () => {
    expect(isFhm2dImageFile(".nutexb", "a.bin")).toBe(true);
    expect(isFhm2dImageFile(null, "gui.nutexb")).toBe(true);
    expect(isFhm2dImageFile(".lm", "navi_bt.lm")).toBe(false);
  });

  it("splits image files from the rest of the archive", () => {
    const tree: Fhm2dVirtualTreeNode[] = [
      fileNode("pack", "", [
        fileNode("cutin.nutexb", ".nutexb"),
        fileNode("script.lm", ".lm"),
        fileNode("meta.bin", ".bin"),
      ]),
    ];
    const files = collectVirtualFiles(tree);
    const { images, others } = partitionFhm2dImageViewFiles(files);
    expect(images.map((file) => file.name)).toEqual(["cutin.nutexb"]);
    expect(others.map((file) => file.name)).toEqual(["script.lm", "meta.bin"]);
    expect(formatByteSize(12)).toBe("12 B");
  });
});
