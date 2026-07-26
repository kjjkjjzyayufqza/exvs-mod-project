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
vi.mock("sonner", () => ({ toast: { error: toastErrorMock, success: toastSuccessMock } }));
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
    localStorage.clear();
  });

  it("imports through inspect + save with the selected NUANMB as template", async () => {
    openMock.mockResolvedValueOnce("E:\\edit\\attack_edit.fbx");
    invokeMock.mockImplementation((command: string) => {
      if (command === "ssbh_inspect_motion_fbx") return Promise.resolve(inspectReport);
      if (command === "ssbh_import_motion_fbx") return Promise.resolve(importReport);
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    saveMock.mockResolvedValueOnce("E:\\out\\attack_edit.nuanmb");
    renderPanel();

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
        },
      }),
    );
    expect(onImportedMock).toHaveBeenCalledWith("E:\\out\\attack_edit.nuanmb");
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(screen.getByText(/40 frames/)).toBeInTheDocument();
  });

  it("is a no-op when the FBX open dialog is cancelled", async () => {
    openMock.mockResolvedValueOnce(null);
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Import FBX as NUANMB/i }));
    await waitFor(() => expect(openMock).toHaveBeenCalled());
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("omits the template when preserve groups is unchecked", async () => {
    openMock.mockResolvedValueOnce("E:\\edit\\attack_edit.fbx");
    invokeMock.mockImplementation((command: string) => {
      if (command === "ssbh_inspect_motion_fbx") return Promise.resolve(inspectReport);
      if (command === "ssbh_import_motion_fbx") return Promise.resolve(importReport);
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    saveMock.mockResolvedValueOnce("E:\\out\\attack_edit.nuanmb");
    renderPanel();

    fireEvent.click(screen.getByLabelText(/Preserve groups/i));
    fireEvent.click(screen.getByRole("button", { name: /Import FBX as NUANMB/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("ssbh_import_motion_fbx", {
        request: expect.objectContaining({ templateNuanmbPath: null }),
      }),
    );
  });

  it("surfaces backend errors inline and via toast", async () => {
    openMock.mockResolvedValueOnce("E:\\edit\\bad.fbx");
    invokeMock.mockImplementation((command: string) => {
      if (command === "ssbh_inspect_motion_fbx") return Promise.resolve(inspectReport);
      return Promise.reject(
        "Motion FBX import failed: candidate skeleton is missing reference bone 'HAND'",
      );
    });
    saveMock.mockResolvedValueOnce("E:\\out\\bad.nuanmb");
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Import FBX as NUANMB/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/missing reference bone/);
    expect(toastErrorMock).toHaveBeenCalled();
    expect(onImportedMock).not.toHaveBeenCalled();
  });

  it("asks for a stack choice when the FBX has multiple stacks", async () => {
    openMock.mockResolvedValueOnce("E:\\edit\\multi.fbx");
    invokeMock.mockImplementation((command: string) => {
      if (command === "ssbh_inspect_motion_fbx")
        return Promise.resolve({
          stacks: [
            { name: "clip_a", frameCount: 40, durationSeconds: 0.65 },
            { name: "clip_b", frameCount: 20, durationSeconds: 0.317 },
          ],
          boneCount: 30,
          boneNames: ["ROOT"],
        });
      return Promise.reject(new Error(`unexpected command ${command}`));
    });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Import FBX as NUANMB/i }));

    expect(await screen.findByText(/multiple animation stacks/i)).toBeInTheDocument();
    expect(saveMock).not.toHaveBeenCalled();
  });
});
