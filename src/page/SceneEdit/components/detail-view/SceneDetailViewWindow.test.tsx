import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { createEmptyNumatbFile } from "@/components/ssbh-model-preview/daeSsbhTypes";
import { SceneDetailViewWindow } from "./SceneDetailViewWindow";
import { SCENE_EDIT_RND_DRAG_HANDLE } from "../sceneEditRndModalUtils";
import type { DetailViewSession, DetailViewModelData } from "./sceneDetailViewTypes";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

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

vi.mock("@/components/ssbh-model-preview/NumdlbMappingEditorBody", () => ({
  NumdlbMappingEditorBody: () => <div>Numdlb editor</div>,
}));

vi.mock("@/components/ssbh-model-preview/NumatbTemplateEditorModalBody", () => ({
  NumatbTemplateEditorModalBody: ({
    onCopyProfilesJson,
  }: {
    onCopyProfilesJson?: () => void | Promise<void>;
  }) => (
    <div>
      <div>Numatb editor</div>
      {onCopyProfilesJson ? (
        <button type="button" aria-label="Copy NUMATB profiles as JSON" onClick={() => void onCopyProfilesJson()}>
          Copy JSON
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock("@/components/ssbh-model-preview/NuhlpbEditorBody", () => ({
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

function createSession(
  activeTab: DetailViewSession["activeTab"],
  modelDataOverrides?: Partial<DetailViewModelData>,
): DetailViewSession {
  const numatbBundle = {
    mayaFile: createEmptyNumatbFile(),
    nustFile: createEmptyNumatbFile(),
    mirrorTexturePathsAcrossProfiles: true,
  };

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
      numatb: {
        base: numatbBundle,
        draft: numatbBundle,
        loading: false,
        error: null,
      },
      numatbPaths: { maya: "D:/model/model__maya__.numatb", nust: "D:/model/model__nust__.numatb" },
      nuhlpb: { base: null, draft: null, loading: false, error: null },
      ...modelDataOverrides,
    },
  };
}

describe("SceneDetailViewWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("copies numatb JSON from the material tab", async () => {
    render(
      <SceneDetailViewWindow
        session={createSession("material")}
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

    fireEvent.click(screen.getByLabelText("Copy NUMATB profiles as JSON"));

    expect(writeText).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(vi.mocked(writeText).mock.calls[0][0]));
    expect(payload.modelName).toBe("Test Model");
    expect(payload.mayaProfile).toBeTruthy();
    expect(payload.nustProfile).toBeTruthy();
    expect(payload.numatbPaths).toEqual({
      maya: "D:/model/model__maya__.numatb",
      nust: "D:/model/model__nust__.numatb",
    });
  });
});
