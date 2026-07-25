import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MotionFbxExportPanel } from "./MotionFbxExportPanel";

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

const report = {
  outputPath: "E:\\export\\attack.fbx",
  actionName: "attack",
  frameCount: 40,
  durationSeconds: 0.65,
  blenderPath: "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe",
  warnings: [],
};

function renderPanel() {
  return render(
    <MotionFbxExportPanel
      selectedNuanmbPath={"E:\\unit\\attack.nuanmb"}
      skeletonPath={"E:\\unit\\body.nusktb"}
      numdlbPath={"E:\\unit\\body.numdlb"}
      workspaceRoot={"E:\\unit"}
      disabled={false}
    />,
  );
}

describe("MotionFbxExportPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openMock.mockReset();
    saveMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    localStorage.clear();
  });

  it("exports complete motion FBX through the Rust command after save dialog", async () => {
    saveMock.mockResolvedValueOnce("E:\\export\\attack.fbx");
    invokeMock.mockResolvedValueOnce(report);
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Export complete FBX/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("ssbh_export_complete_motion_fbx", {
        request: {
          nuanmbPath: "E:\\unit\\attack.nuanmb",
          nusktbPath: "E:\\unit\\body.nusktb",
          numdlbPath: "E:\\unit\\body.numdlb",
          outputFbxPath: "E:\\export\\attack.fbx",
          blenderPath: null,
          actionName: null,
        },
      }),
    );
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(screen.getByText(/40 frames/)).toBeInTheDocument();
  });

  it("is a no-op when save dialog is cancelled", async () => {
    saveMock.mockResolvedValueOnce(null);
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Export complete FBX/i }));

    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("passes blender path override to the export command", async () => {
    saveMock.mockResolvedValueOnce("E:\\export\\attack.fbx");
    invokeMock.mockResolvedValueOnce(report);
    renderPanel();

    fireEvent.change(screen.getByPlaceholderText(/Auto-detect/i), {
      target: { value: "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Export complete FBX/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("ssbh_export_complete_motion_fbx", {
        request: expect.objectContaining({
          blenderPath: "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe",
        }),
      }),
    );
  });
});
