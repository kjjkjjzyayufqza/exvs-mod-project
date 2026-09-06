import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, tempDirMock, joinMock, mkdirMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  tempDirMock: vi.fn(),
  joinMock: vi.fn(),
  mkdirMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/api/path", () => ({
  tempDir: tempDirMock,
  join: joinMock,
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  mkdir: mkdirMock,
}));

import { previewMotionFbx } from "./motionFbxImportService";

describe("previewMotionFbx", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    tempDirMock.mockReset();
    joinMock.mockReset();
    mkdirMock.mockReset();
    tempDirMock.mockResolvedValue("C:\\Temp");
    joinMock.mockImplementation(async (...parts: string[]) => parts.join("\\"));
    mkdirMock.mockResolvedValue(undefined);
    invokeMock.mockResolvedValue({
      outputPath: "C:\\Temp\\exvs2-motion-fbx-preview\\main_csa_abc.nuanmb",
      actionName: "main_csa",
      frameCount: 48,
      durationSeconds: 0.8,
      matchedBones: ["ROOT"],
      ignoredBones: [],
      preservedNonTransformGroupCount: 0,
      warnings: [],
    });
  });

  it("writes a temp NUANMB under the OS temp dir without a save dialog", async () => {
    const report = await previewMotionFbx({
      fbxPath: "D:\\output\\exvs2\\Gundam Delta Kai\\motion\\主射CSA.fbx",
      nusktbPath: "E:\\unit\\body.nusktb",
      templateNuanmbPath: null,
      animationStackName: null,
      rigBindingPolicy: "exactHierarchy",
    });

    expect(mkdirMock).toHaveBeenCalledWith("C:\\Temp\\exvs2-motion-fbx-preview", {
      recursive: true,
    });
    expect(invokeMock).toHaveBeenCalledWith(
      "ssbh_import_motion_fbx",
      expect.objectContaining({
        request: expect.objectContaining({
          fbxPath: "D:\\output\\exvs2\\Gundam Delta Kai\\motion\\主射CSA.fbx",
          nusktbPath: "E:\\unit\\body.nusktb",
          templateNuanmbPath: null,
          animationStackName: null,
          rigBindingPolicy: "exactHierarchy",
          omitAthHelperBones: true,
        }),
      }),
    );
    const request = invokeMock.mock.calls[0]?.[1]?.request as {
      outputNuanmbPath: string;
    };
    expect(request.outputNuanmbPath).toMatch(
      /^C:\\Temp\\exvs2-motion-fbx-preview\\.*\.nuanmb$/i,
    );
    expect(report.frameCount).toBe(48);
  });

  it("rejects empty fbx or skeleton paths", async () => {
    await expect(
      previewMotionFbx({
        fbxPath: "  ",
        nusktbPath: "E:\\unit\\body.nusktb",
        templateNuanmbPath: null,
        animationStackName: null,
        rigBindingPolicy: "nameOnly",
      }),
    ).rejects.toThrow(/fbxPath/i);

    await expect(
      previewMotionFbx({
        fbxPath: "E:\\a.fbx",
        nusktbPath: "",
        templateNuanmbPath: null,
        animationStackName: null,
        rigBindingPolicy: "nameOnly",
      }),
    ).rejects.toThrow(/nusktbPath/i);
  });
});
