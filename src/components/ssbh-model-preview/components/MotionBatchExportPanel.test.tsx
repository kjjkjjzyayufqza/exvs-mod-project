import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MotionBatchExportPanel } from "./MotionBatchExportPanel";
import { IDLE_MOTION_FBX_COMPOSE_JOB } from "../motionFbxExportService";

const { exportMock, openMock, statusMock, stopMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  exportMock: vi.fn(),
  openMock: vi.fn(),
  statusMock: vi.fn(),
  stopMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));
vi.mock("sonner", () => ({ toast: { error: toastErrorMock, success: toastSuccessMock } }));
vi.mock("../motionFbxExportService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../motionFbxExportService")>();
  return {
    ...actual,
    exportCompleteMotionFbx: exportMock,
    getBlender51PathOverride: () => null,
    setBlender51PathOverride: vi.fn(),
    subscribeBlenderExecutablePath: () => () => {},
    getMotionFbxComposeJobStatus: statusMock,
    stopMotionFbxCompose: stopMock,
  };
});
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

function okReport(stem: string) {
  return {
    outputPath: `E:\\batch\\${stem}.fbx`,
    actionName: stem,
    frameCount: 40,
    durationSeconds: 0.65,
    blenderPath: "blender.exe",
    warnings: [],
  };
}

describe("MotionBatchExportPanel", () => {
  beforeEach(() => {
    exportMock.mockReset();
    openMock.mockReset();
    statusMock.mockReset();
    stopMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    localStorage.clear();
    statusMock.mockResolvedValue(IDLE_MOTION_FBX_COMPOSE_JOB);
    stopMock.mockResolvedValue(false);
  });

  it("exports every selected clip sequentially into the chosen directory", async () => {
    openMock.mockResolvedValueOnce("E:\\batch");
    exportMock.mockResolvedValue(okReport("clip"));
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
      .mockResolvedValueOnce(okReport("idle"));
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

  it("filters the clip list with the search box without changing hidden selection", async () => {
    renderPanel();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "idle" } });

    await waitFor(() => {
      expect(screen.queryByRole("checkbox", { name: "attack" })).not.toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "idle" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /^None$/i }));
    expect(screen.getByRole("checkbox", { name: "idle" })).not.toBeChecked();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "attack" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "idle" })).not.toBeChecked();
    });
  });

  it("stops the in-flight Blender job and skips remaining clips", async () => {
    openMock.mockResolvedValueOnce("E:\\batch");
    let rejectFirst: (error: Error) => void = () => undefined;
    exportMock.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        }),
    );
    stopMock.mockImplementation(async () => {
      rejectFirst(new Error("Motion FBX export failed: stopped by user"));
      return true;
    });
    statusMock.mockResolvedValue({
      running: true,
      stopRequested: false,
      pid: 4242,
      blenderPath: "C:\\Blender Foundation\\Blender 5.1\\blender.exe",
      outputFbx: "E:\\batch\\attack.fbx",
      elapsedMs: 1500,
      stdoutTail: "Blender 5.1.0",
      stderrTail: "",
    });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Export all to folder/i }));

    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: /^Stop$/i })).toBeInTheDocument();
    expect(await screen.findByText(/pid 4242/)).toBeInTheDocument();
    expect(screen.getByText(/Blender 5\.1\.0/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Stop$/i }));

    await waitFor(() => expect(stopMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("Remaining clips were skipped.")).toBeInTheDocument(),
    );
    expect(exportMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /^Exit$/i })).toBeInTheDocument();
  });
});
