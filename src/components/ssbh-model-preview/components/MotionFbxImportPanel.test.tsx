import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MotionFbxImportPanel } from "./MotionFbxImportPanel";

const { invokeMock, openMock, saveMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
  saveMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock, save: saveMock }));
vi.mock("@tauri-apps/api/path", () => ({
  dirname: vi.fn(async (p: string) => {
    const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
    return i > 0 ? p.slice(0, i) : p;
  }),
}));
vi.mock("sonner", () => ({ toast: { error: toastErrorMock, success: toastSuccessMock } }));
vi.mock("@/store/configStore", () => ({
  useConfigStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      store: {},
      getSetting: vi.fn(async () => undefined),
      setSetting: vi.fn(async () => undefined),
    }),
}));
vi.mock("../MayaInspectorSection", () => ({
  MayaSection: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  ),
}));

const inspectReport = {
  stacks: [{ name: "attack_edit", frameCount: 40, durationSeconds: 0.65 }],
  boneCount: 30,
  boneNames: ["ROOT"],
};

const importReport = {
  outputPath: "E:\\out\\attack_edit.nuanmb",
  actionName: "attack_edit",
  frameCount: 40,
  durationSeconds: 0.65,
  matchedBones: ["ROOT"],
  ignoredBones: ["ROOT_end"],
  preservedNonTransformGroupCount: 2,
  warnings: [],
};

const onImportedMock = vi.fn();

function renderPanel() {
  return render(
    <MotionFbxImportPanel
      skeletonPath={"E:\\unit\\body.nusktb"}
      selectedNuanmbPath={"E:\\unit\\attack.nuanmb"}
      workspaceRoot={"E:\\unit"}
      disabled={false}
      onImported={onImportedMock}
    />,
  );
}

describe("MotionFbxImportPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openMock.mockReset();
    saveMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    onImportedMock.mockReset();
  });

  it("uses separate FBX and NUANMB path fields then imports", async () => {
    openMock.mockResolvedValueOnce("E:\\edit\\attack_edit.fbx");
    saveMock.mockResolvedValueOnce("E:\\out\\attack_edit.nuanmb");
    invokeMock.mockImplementation((command: string) => {
      if (command === "ssbh_inspect_motion_fbx") return Promise.resolve(inspectReport);
      if (command === "ssbh_import_motion_fbx") return Promise.resolve(importReport);
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderPanel();

    fireEvent.click(screen.getByLabelText(/Source FBX/i));
    await waitFor(() => expect(openMock).toHaveBeenCalled());
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("ssbh_inspect_motion_fbx", expect.anything()));

    fireEvent.click(screen.getByLabelText(/Output NUANMB/i));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /Import FBX as NUANMB/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("ssbh_import_motion_fbx", {
        request: {
          fbxPath: "E:\\edit\\attack_edit.fbx",
          nusktbPath: "E:\\unit\\body.nusktb",
          outputNuanmbPath: "E:\\out\\attack_edit.nuanmb",
          templateNuanmbPath: "E:\\unit\\attack.nuanmb",
          animationStackName: "attack_edit",
          rigBindingPolicy: "exactHierarchy",
          omitAthHelperBones: true,
        },
      }),
    );
    expect(onImportedMock).toHaveBeenCalledWith("E:\\out\\attack_edit.nuanmb");
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(screen.getByText(/40 frames/)).toBeInTheDocument();
  });

  it("does not import when FBX path is empty", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Import FBX as NUANMB/i }));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("allows re-import when output path equals the selected template NUANMB", async () => {
    openMock.mockResolvedValueOnce("E:\\edit\\attack_edit.fbx");
    // Same path as selected motion — second import / overwrite selected.
    saveMock.mockResolvedValueOnce("E:\\unit\\attack.nuanmb");
    invokeMock.mockImplementation((command: string) => {
      if (command === "ssbh_inspect_motion_fbx") return Promise.resolve(inspectReport);
      if (command === "ssbh_import_motion_fbx") {
        return Promise.resolve({
          ...importReport,
          outputPath: "E:\\unit\\attack.nuanmb",
        });
      }
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderPanel();

    fireEvent.click(screen.getByLabelText(/Source FBX/i));
    await waitFor(() => expect(openMock).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText(/Output NUANMB/i));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Import FBX as NUANMB/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("ssbh_import_motion_fbx", {
        request: expect.objectContaining({
          outputNuanmbPath: "E:\\unit\\attack.nuanmb",
          templateNuanmbPath: "E:\\unit\\attack.nuanmb",
        }),
      }),
    );
    expect(onImportedMock).toHaveBeenCalledWith("E:\\unit\\attack.nuanmb");
  });

  it("sends omitAthHelperBones false when skip ATH is unchecked", async () => {
    openMock.mockResolvedValueOnce("E:\\edit\\attack_edit.fbx");
    saveMock.mockResolvedValueOnce("E:\\out\\attack_edit.nuanmb");
    invokeMock.mockImplementation((command: string) => {
      if (command === "ssbh_inspect_motion_fbx") return Promise.resolve(inspectReport);
      if (command === "ssbh_import_motion_fbx") return Promise.resolve(importReport);
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderPanel();

    fireEvent.click(screen.getByLabelText(/Source FBX/i));
    await waitFor(() => expect(openMock).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText(/Output NUANMB/i));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText(/Skip ATH/i));
    fireEvent.click(screen.getByRole("button", { name: /Import FBX as NUANMB/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("ssbh_import_motion_fbx", {
        request: expect.objectContaining({ omitAthHelperBones: false }),
      }),
    );
  });

  it("omits the template when preserve groups is unchecked", async () => {
    openMock.mockResolvedValueOnce("E:\\edit\\attack_edit.fbx");
    saveMock.mockResolvedValueOnce("E:\\out\\attack_edit.nuanmb");
    invokeMock.mockImplementation((command: string) => {
      if (command === "ssbh_inspect_motion_fbx") return Promise.resolve(inspectReport);
      if (command === "ssbh_import_motion_fbx") return Promise.resolve(importReport);
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderPanel();

    fireEvent.click(screen.getByLabelText(/Source FBX/i));
    await waitFor(() => expect(openMock).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText(/Output NUANMB/i));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText(/Preserve groups/i));
    fireEvent.click(screen.getByRole("button", { name: /Import FBX as NUANMB/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("ssbh_import_motion_fbx", {
        request: expect.objectContaining({ templateNuanmbPath: null }),
      }),
    );
  });
});
