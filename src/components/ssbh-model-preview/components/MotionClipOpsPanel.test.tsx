import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MotionClipOpsPanel } from "./MotionClipOpsPanel";

const { invokeMock, saveMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  saveMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveMock }));
vi.mock("sonner", () => ({ toast: { error: toastErrorMock, success: toastSuccessMock } }));
vi.mock("../MayaInspectorSection", () => ({
  MayaSection: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  ),
}));

const report = {
  outputPath: "E:\\out\\attack_trim.nuanmb",
  actionName: "attack_trim",
  frameCount: 11,
  durationSeconds: 0.167,
  matchedBones: ["ROOT"],
  ignoredBones: [],
  preservedNonTransformGroupCount: 0,
  warnings: ["clip operations write transform-only NUANMB; non-Transform groups are not carried over"],
};

const onTransformedMock = vi.fn();

function renderPanel() {
  return render(
    <MotionClipOpsPanel
      selectedNuanmbPath={"E:\\motion\\attack.nuanmb"}
      skeletonPath={"E:\\unit\\body.nusktb"}
      finalFrameIndex={59}
      workspaceRoot={"E:\\unit"}
      disabled={false}
      onTransformed={onTransformedMock}
    />,
  );
}

describe("MotionClipOpsPanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    saveMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
    onTransformedMock.mockReset();
    localStorage.clear();
  });

  it("trims the selected clip through the transform command", async () => {
    saveMock.mockResolvedValueOnce("E:\\out\\attack_trim.nuanmb");
    invokeMock.mockResolvedValueOnce(report);
    renderPanel();

    fireEvent.change(screen.getByLabelText(/End frame/i), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /^Trim$/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("ssbh_transform_nuanmb_clip", {
        request: {
          nuanmbPath: "E:\\motion\\attack.nuanmb",
          nusktbPath: "E:\\unit\\body.nusktb",
          outputNuanmbPath: "E:\\out\\attack_trim.nuanmb",
          operation: { kind: "trim", startFrame: 0, endFrame: 10 },
        },
      }),
    );
    expect(onTransformedMock).toHaveBeenCalledWith("E:\\out\\attack_trim.nuanmb");
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it("rejects retime before invoking when the factor is not positive", async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText(/Speed/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /Retime/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/positive/i);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });
});
