import { describe, expect, it } from "vitest";
import { findBundleForDetailViewNode } from "./sceneDetailViewBundleLookup";
import type { StageTreeNode } from "../components/StageHierarchyTree";
import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";

function makeBundle(rootFolder: string): SsbhModelPreviewBundle {
  return {
    rootFolder,
    modlPath: `${rootFolder}/model.numdlb`,
    meshPath: `${rootFolder}/model.numshb`,
    skelPath: null,
    matlPaths: [],
    textureRefs: [],
    resolvedNutexbPaths: [],
    textureResolve: [],
    warnings: [],
    sourceKind: "disk",
    sourceSessionId: null,
    virtualModlPath: null,
    modl: null,
    mesh: null,
    skel: null,
    matl: null,
  };
}

describe("findBundleForDetailViewNode", () => {
  const lookup = {
    baseModel: makeBundle("C:/stage"),
    subModels: [
      { folderName: "box01", objectIndex: 2, bundle: makeBundle("C:/stage/box01") },
    ],
  };

  it("resolves base model by role", () => {
    const node: StageTreeNode = { id: "base", label: "base", role: "base" };
    expect(findBundleForDetailViewNode(node, lookup)?.rootFolder).toBe("C:/stage");
  });

  it("resolves sub_model by folder id", () => {
    const node: StageTreeNode = {
      id: "box01",
      label: "box01",
      role: "sub_model",
      objectIndex: 2,
    };
    expect(findBundleForDetailViewNode(node, lookup)?.rootFolder).toBe("C:/stage/box01");
  });

  it("resolves imported_dae when an in-memory SSBH bundle is attached", () => {
    const bundle = makeBundle("memory://scene/prop");
    const importedLookup = {
      ...lookup,
      importedDaeObjects: [{ id: "dae-1", name: "prop", sessionImportId: "import-1", ssbhBundle: bundle }],
    };
    const node: StageTreeNode = { id: "dae-1", label: "prop", role: "imported_dae" };
    expect(findBundleForDetailViewNode(node, importedLookup)).toBe(bundle);
  });

  it("returns null for imported_dae without an SSBH bundle", () => {
    const node: StageTreeNode = { id: "dae-1", label: "prop", role: "imported_dae" };
    expect(findBundleForDetailViewNode(node, { ...lookup, importedDaeObjects: [{ id: "dae-1", name: "prop" }] })).toBeNull();
  });
});
