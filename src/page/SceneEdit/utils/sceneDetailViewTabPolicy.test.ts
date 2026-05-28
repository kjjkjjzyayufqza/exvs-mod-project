import { describe, expect, it } from "vitest";
import type { DetailViewModelData } from "../components/detail-view/sceneDetailViewTypes";
import {
  modelTabLoadingField,
  shouldLoadModelTab,
  shouldMountDetailTab,
} from "./sceneDetailViewTabPolicy";

function makeModelData(
  overrides: Partial<DetailViewModelData> = {},
): DetailViewModelData {
  return {
    bundle: {
      rootFolder: "C:/model",
      modlPath: "C:/model/model.numdlb",
      meshPath: "C:/model/model.numshb",
      skelPath: null,
      matlPaths: ["C:/model/model.numatb"],
      modl: null,
      mesh: null,
      skel: null,
      matl: null,
      textureRefs: [],
      resolvedNutexbPaths: [],
      textureResolve: [],
      warnings: [],
      sourceKind: "disk",
    },
    numdlb: { base: null, draft: null, loading: false, error: null },
    numatb: { base: null, draft: null, loading: false, error: null },
    numatbPaths: { maya: null, nust: null },
    nuhlpb: { base: null, draft: null, loading: false, error: null },
    ...overrides,
  };
}

describe("shouldMountDetailTab", () => {
  it("mounts only the active tab", () => {
    expect(shouldMountDetailTab("model", "model")).toBe(true);
    expect(shouldMountDetailTab("model", "mesh")).toBe(false);
    expect(shouldMountDetailTab("skeleton", "mesh")).toBe(false);
    expect(shouldMountDetailTab("textures", "textures")).toBe(true);
  });
});

describe("shouldLoadModelTab", () => {
  it("loads editable tabs once when data is absent", () => {
    const data = makeModelData();
    expect(shouldLoadModelTab("model", data)).toBe(true);
    expect(shouldLoadModelTab("material", data)).toBe(true);
    expect(shouldLoadModelTab("helper", data)).toBe(true);
    expect(shouldLoadModelTab("mesh", data)).toBe(false);
  });

  it("skips tabs that are loading or already loaded", () => {
    const loading = makeModelData({
      numdlb: { base: null, draft: null, loading: true, error: null },
    });
    expect(shouldLoadModelTab("model", loading)).toBe(false);

    const loaded = makeModelData({
      numdlb: {
        base: { modelName: "x", skeletonFileName: "", materialFileNames: [], meshFileName: "", animationFileName: "", entries: [] },
        draft: null,
        loading: false,
        error: null,
      },
    });
    expect(shouldLoadModelTab("model", loaded)).toBe(false);
  });

  it("skips material/helper when paths are missing", () => {
    const data = makeModelData({
      bundle: {
        ...makeModelData().bundle,
        matlPaths: [],
        rootFolder: "",
      },
    });
    expect(shouldLoadModelTab("material", data)).toBe(false);
    expect(shouldLoadModelTab("helper", data)).toBe(false);
  });
});

describe("modelTabLoadingField", () => {
  it("maps editable tabs to modelData fields", () => {
    expect(modelTabLoadingField("model")).toBe("numdlb");
    expect(modelTabLoadingField("material")).toBe("numatb");
    expect(modelTabLoadingField("helper")).toBe("nuhlpb");
    expect(modelTabLoadingField("mesh")).toBeNull();
  });
});
