import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const channels: Array<{
    onmessage: ((message: unknown) => void) | null;
  }> = [];
  class MockChannel {
    onmessage: ((message: unknown) => void) | null = null;

    constructor() {
      channels.push(this);
    }
  }
  return {
    channels,
    invokeMock: vi.fn(),
    MockChannel,
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  Channel: mocks.MockChannel,
  invoke: mocks.invokeMock,
}));

import {
  importUnitModelStaticMesh,
  validateUnitModelSourceFolder,
} from "./unitModelModelService";

describe("unitModelModelService", () => {
  beforeEach(() => {
    mocks.invokeMock.mockReset();
    mocks.channels.length = 0;
  });

  it("validates prepared SSBH folders through the dedicated preflight command", async () => {
    mocks.invokeMock.mockResolvedValue({
      sourceDir: "E:\\source",
      modelName: "unit_body",
      requiredFiles: [],
      textureReferences: [],
      sourceTexturesFound: [],
      textureReferencesNotInSource: [],
      ignoredSourceNuhlpb: false,
    });

    await validateUnitModelSourceFolder("E:/source");

    expect(mocks.invokeMock).toHaveBeenCalledWith(
      "validate_unit_model_source_folder",
      { sourceDir: "E:\\source" },
    );
  });

  it("passes selected geometries and streams progress for FBX/DAE imports", async () => {
    mocks.invokeMock.mockResolvedValue({
      modelRoot: "E:\\unit\\0",
      structureJsonPath: "E:\\unit\\0_structure.json",
      modelCount: 2,
      totalFiles: 20,
      removedFiles: [],
    });
    const onProgress = vi.fn();

    await importUnitModelStaticMesh(
      {
        modelRoot: "E:/unit/0",
        structureJsonPath: "E:/unit/0_structure.json",
        sourcePath: "E:/source/model.fbx",
        includeGeometryNames: ["Body", "Face"],
        config: {
          loadToScene: false,
          convertToSsbh: true,
          generateHkt: false,
          hktSimplify: {
            enabled: false,
            planarityAngleDeg: 15,
            minTriangleArea: 0.000001,
            weldEpsilon: 0.001,
            targetTriangleRatio: null,
            maxTargetTriangles: null,
            strategy: "shapePreserving",
            hullTargetFaces: null,
            quadMergeEnabled: true,
            preset: "none",
            hullPreset: "balanced",
          },
          ssbhConfig: null,
        },
      },
      onProgress,
    );

    expect(mocks.invokeMock).toHaveBeenCalledWith(
      "unit_model_import_static_mesh",
      expect.objectContaining({
        options: expect.objectContaining({
          modelRoot: "E:\\unit\\0",
          sourcePath: "E:\\source\\model.fbx",
          includeGeometryNames: ["Body", "Face"],
        }),
        onProgress: mocks.channels[0],
      }),
    );

    mocks.channels[0]?.onmessage?.({ kind: "complete" });
    expect(onProgress).toHaveBeenCalledWith({ kind: "complete" });
  });
});
