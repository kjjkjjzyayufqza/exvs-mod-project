import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SceneDetailViewWindow } from "./SceneDetailViewWindow";
import { SCENE_EDIT_RND_DRAG_HANDLE } from "../sceneEditRndModalUtils";
import type { DetailViewSession, DetailViewModelData } from "./sceneDetailViewTypes";

vi.mock("react-rnd", () => ({
  Rnd: ({
    children,
    dragHandleClassName,
  }: {
    children: React.ReactNode;
    dragHandleClassName?: string;
  }) => (
    <div data-testid="scene-edit-rnd" data-drag-handle={dragHandleClassName}>
      {children}
    </div>
  ),
}));

vi.mock("@/page/TestEditor/components/ssbh-model-preview/NumdlbMappingEditorBody", () => ({
  NumdlbMappingEditorBody: () => <div>Numdlb editor</div>,
}));

vi.mock("@/page/TestEditor/components/ssbh-model-preview/NumatbTemplateEditorModalBody", () => ({
  NumatbTemplateEditorModalBody: () => <div>Numatb editor</div>,
}));

vi.mock("@/page/TestEditor/components/ssbh-model-preview/NuhlpbEditorBody", () => ({
  NuhlpbEditorBody: () => <div>Nuhlpb editor</div>,
}));

vi.mock("./MeshReadonlyTab", () => ({
  MeshReadonlyTab: () => <div>Mesh readonly tab</div>,
}));

const bundle: DetailViewModelData["bundle"] = {
  rootFolder: "D:/model",
  modlPath: "D:/model/model.numdlb",
  meshPath: "D:/model/model.numshb",
  skelPath: null,
  matlPaths: ["D:/model/model.numatb"],
  modl: null,
  mesh: {},
  skel: {},
  matl: null,
  textureRefs: [],
  resolvedNutexbPaths: [],
  textureResolve: [],
  warnings: [],
  sourceKind: "disk",
};

function createSession(activeTab: DetailViewSession["activeTab"]): DetailViewSession {
  return {
    id: "detail-1-node",
    nodeId: "node-1",
    nodeLabel: "Test Model",
    kind: "ssbh-model",
    activeTab,
    zIndex: 1000,
    effectData: null,
    modelData: {
      bundle,
      numdlb: {
        base: {
          modelName: "model",
          skeletonFileName: "model.nusktb",
          materialFileNames: ["model.numatb"],
          meshFileName: "model.numshb",
          animationFileName: null,
          entries: [],
        },
        draft: {
          modelName: "model",
          skeletonFileName: "model.nusktb",
          materialFileNames: ["model.numatb"],
          meshFileName: "model.numshb",
          animationFileName: null,
          entries: [],
        },
        loading: false,
        error: null,
      },
      numatb: { base: null, draft: null, loading: false, error: null },
      numatbPaths: { maya: null, nust: null },
      nuhlpb: { base: null, draft: null, loading: false, error: null },
    },
  };
}

describe("SceneDetailViewWindow", () => {
  it("uses react-rnd shell with shared drag handle", () => {
    render(
      <SceneDetailViewWindow
        session={createSession("model")}
        cascadeIndex={0}
        onActivate={() => {}}
        onClose={() => {}}
        onTabChange={() => {}}
        onNumdlbDraftChange={() => {}}
        onNumdlbSave={() => {}}
        onNumatbDraftChange={() => {}}
        onNumatbSave={() => {}}
        onNuhlpbDraftChange={() => {}}
        onNuhlpbSave={() => {}}
      />,
    );

    expect(screen.getByTestId("scene-edit-rnd")).toHaveAttribute(
      "data-drag-handle",
      SCENE_EDIT_RND_DRAG_HANDLE,
    );
  });

  it("lazy-mounts only the active tab panel", () => {
    render(
      <SceneDetailViewWindow
        session={createSession("mesh")}
        cascadeIndex={0}
        onActivate={() => {}}
        onClose={() => {}}
        onTabChange={() => {}}
        onNumdlbDraftChange={() => {}}
        onNumdlbSave={() => {}}
        onNumatbDraftChange={() => {}}
        onNumatbSave={() => {}}
        onNuhlpbDraftChange={() => {}}
        onNuhlpbSave={() => {}}
      />,
    );

    expect(screen.getByText("Mesh readonly tab")).toBeInTheDocument();
    expect(screen.queryByText("Numdlb editor")).not.toBeInTheDocument();
  });
});
