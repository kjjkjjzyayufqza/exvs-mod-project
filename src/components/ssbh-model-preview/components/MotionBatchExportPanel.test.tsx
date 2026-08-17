import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MotionBatchExportPanel } from "./MotionBatchExportPanel";

const { exportMock, openMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  exportMock: vi.fn(),
  openMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));
vi.mock("sonner", () => ({ toast: { error: toastErrorMock, success: toastSuccessMock } }));
vi.mock("../motionFbxExportService", () => ({
  exportCompleteMotionFbx: exportMock,
  getBlender51PathOverride: () => null,
}));
vi.mock("../MayaInspectorSection", () => ({
  MayaSection: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  ),
}));

const nuanmbPaths = ["E:\\motion\\attack.nuanmb", "E:\\motion\\idle.nuanmb"];

function renderPanel() {
  return render(
    <MotionBatchExportPanel
      nuanmbPaths={nuanmbPaths}
      skeletonPath={"E:\\unit\\body.nusktb"}
      numdlbPath={"E:\\unit\\body.numdlb"}
      workspaceRoot={"E:\\unit"}
      disabled={false}
    />,
  );
}

describe("MotionBatchExportPanel", () => {
  beforeEach(() => {
    exportMock.mockReset();
    openMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    localStorage.clear();
  });

  it("exports every selected clip sequentially into the chosen directory", async () => {
    openMock.mockResolvedValueOnce("E:\\batch");
    exportMock.mockResolvedValue({
      outputPath: "E:\\batch\\out.fbx",
      actionName: "clip",
      frameCount: 40,
      durationSeconds: 0.65,
      blenderPath: "blender.exe",
      warnings: [],
    });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Export all to folder/i }));

    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(2));
    expect(exportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nuanmbPath: "E:\\motion\\attack.nuanmb",
        outputFbxPath: "E:\\batch\\attack.fbx",
      }),
    );
    expect(exportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        nuanmbPath: "E:\\motion\\idle.nuanmb",
        outputFbxPath: "E:\\batch\\idle.fbx",
      }),
    );
    expect(await screen.findByText(/2 exported, 0 failed/)).toBeInTheDocument();
  });

  it("collects per-clip failures and continues", async () => {
    openMock.mockResolvedValueOnce("E:\\batch");
    exportMock
      .mockRejectedValueOnce(new Error("staging write failed"))
      .mockResolvedValueOnce({
        outputPath: "E:\\batch\\idle.fbx",
        actionName: "idle",
        frameCount: 40,
        durationSeconds: 0.65,
        blenderPath: "blender.exe",
        warnings: [],
      });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Export all to folder/i }));

    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/1 exported, 1 failed/)).toBeInTheDocument();
    expect(screen.getByText(/staging write failed/)).toBeInTheDocument();
  });

  it("aborts remaining clips when Blender resolve fails", async () => {
    openMock.mockResolvedValueOnce("E:\\batch");
    exportMock.mockRejectedValueOnce(new Error("Blender 5.1 was not found"));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Export all to folder/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Blender/));
    expect(exportMock).toHaveBeenCalledTimes(1);
  });
});
