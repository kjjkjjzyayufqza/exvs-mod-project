import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CascadeurBridgePanel } from "./CascadeurBridgePanel";

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
  outputPath: "E:\\bridge\\motion.fbx",
  actionName: "edited_action",
  frameCount: 90,
  durationSeconds: 1.4833333,
  matchedBones: ["ROOT"],
  ignoredBones: [],
  preservedNonTransformGroupCount: 2,
  warnings: [],
};

function renderPanel(onImportedNuanmb = vi.fn()) {
  return render(
    <CascadeurBridgePanel
      selectedNuanmbPath={"E:\\unit\\attack.nuanmb"}
      skeletonPath={"E:\\unit\\body.nusktb"}
      workspaceRoot={"E:\\unit"}
      disabled={false}
      onImportedNuanmb={onImportedNuanmb}
    />,
  );
}

describe("CascadeurBridgePanel", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openMock.mockReset();
    saveMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it("exports selected motion with active skeleton through the Rust bridge command", async () => {
    openMock.mockResolvedValueOnce("E:\\cascadeur\\attack_bridge");
    invokeMock.mockResolvedValueOnce(report);
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Export bridge" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("ssbh_export_nuanmb_to_cascadeur_bridge", {
        request: {
          nuanmbPath: "E:\\unit\\attack.nuanmb",
          nusktbPath: "E:\\unit\\body.nusktb",
          outputDirectory: "E:\\cascadeur\\attack_bridge",
          actionName: null,
        },
      }),
    );
  });

  it("imports a Cascadeur FBX with selected motion as the NUANMB template", async () => {
    const onImportedNuanmb = vi.fn();
    openMock
      .mockResolvedValueOnce("E:\\cascadeur\\edited.fbx")
      .mockResolvedValueOnce("E:\\cascadeur\\bridge.json");
    saveMock.mockResolvedValueOnce("E:\\unit\\attack_cascadeur.nuanmb");
    invokeMock.mockResolvedValueOnce({ ...report, outputPath: "E:\\unit\\attack_cascadeur.nuanmb" });
    renderPanel(onImportedNuanmb);

    fireEvent.click(screen.getByRole("button", { name: "Import bridge" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("ssbh_import_cascadeur_bridge_to_nuanmb", {
        request: {
          fbxPath: "E:\\cascadeur\\edited.fbx",
          bridgeManifestPath: "E:\\cascadeur\\bridge.json",
          nusktbPath: "E:\\unit\\body.nusktb",
          outputNuanmbPath: "E:\\unit\\attack_cascadeur.nuanmb",
          animationStackName: null,
          templateNuanmbPath: "E:\\unit\\attack.nuanmb",
          rigBindingPolicy: "exactHierarchy",
        },
      }),
    );
    expect(onImportedNuanmb).toHaveBeenCalledWith("E:\\unit\\attack_cascadeur.nuanmb");
    expect(screen.getByText("Preserved groups: 2")).toBeInTheDocument();
  });
});
