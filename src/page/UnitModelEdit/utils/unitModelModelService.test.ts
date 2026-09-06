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
  addUnitModelModel,
  importUnitModelStaticMesh,
  previewUnitModelModelReplacement,
  previewUnitModelNumshbReplacement,
  removeUnitModelModel,
  replaceUnitModelModel,
  replaceUnitModelNumshb,
  stageUnitModelStaticMesh,
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

  it("previews prepared-folder replacement through the dry-run command", async () => {
    mocks.invokeMock.mockResolvedValue({
      source: {
        sourceDir: "E:\\source",
        modelName: "source_body",
        requiredFiles: [],
        textureReferences: [],
        sourceTexturesFound: [],
        textureReferencesNotInSource: [],
        ignoredSourceNuhlpb: false,
      },
      target: {
        modelName: "target_body",
        modelIndex: 2,
        numdlbPath: null,
        numshbPath: null,
        nusktbPath: null,
        jnttblPath: null,
        numatbPaths: [],
        nuhlpbPath: null,
      },
      compatibility: {
        skeleton: {
          sourceBoneCount: 0,
          targetBoneCount: 0,
          matchingBoneNames: 0,
          missingInSource: [],
          newInSource: [],
        },
        jnttbl: { sourceBoneCount: 0, targetBoneCount: 0 },
        materials: { keptLabels: [], removedLabels: [], addedLabels: [] },
      },
      textures: {
        referenced: [],
        copiedFromSource: [],
        reusedFromPool: [],
        missing: [],
        orphanedAfterReplace: [],
      },
      warnings: [],
      blockers: [],
    });

    await previewUnitModelModelReplacement(
      "E:/unit/0",
      "target_body",
      "E:/source",
      "E:/unit/0_structure.json",
    );

    expect(mocks.invokeMock).toHaveBeenCalledWith(
      "preview_unit_model_model_replacement",
      {
        modelRoot: "E:\\unit\\0",
        structureJsonPath: "E:\\unit\\0_structure.json",
        targetModelName: "target_body",
        sourceDir: "E:\\source",
      },
    );
  });

  it("syncs all texture containers after adding a prepared SSBH folder", async () => {
    mocks.invokeMock
      .mockResolvedValueOnce({
        modelRoot: "E:\\unit\\0",
        structureJsonPath: "E:\\unit\\0_structure.json",
        modelCount: 2,
        totalFiles: 20,
        removedFiles: [],
      })
      .mockResolvedValueOnce({
        modelRoot: "E:\\unit\\0",
        structureJsonPath: "E:\\unit\\0_structure.json",
        changed: true,
      });

    await addUnitModelModel("E:/unit/0", "E:/source", "E:/unit/0_structure.json");

    expect(mocks.invokeMock).toHaveBeenNthCalledWith(1, "add_unit_model_model", {
      modelRoot: "E:\\unit\\0",
      structureJsonPath: "E:\\unit\\0_structure.json",
      sourceDir: "E:\\source",
    });
    expect(mocks.invokeMock).toHaveBeenNthCalledWith(2, "sync_unit_model_texture_containers", {
      modelRoot: "E:\\unit\\0",
      structureJsonPath: "E:\\unit\\0_structure.json",
    });
  });

  it("returns the mutation result with a sync warning when the follow-up sync fails", async () => {
    mocks.invokeMock
      .mockResolvedValueOnce({
        modelRoot: "E:\\unit\\0",
        structureJsonPath: "E:\\unit\\0_structure.json",
        modelCount: 2,
        totalFiles: 20,
        removedFiles: [],
      })
      .mockRejectedValueOnce(new Error("sync exploded"));

    await expect(
      addUnitModelModel("E:/unit/0", "E:/source", "E:/unit/0_structure.json"),
    ).resolves.toEqual({
      modelRoot: "E:\\unit\\0",
      structureJsonPath: "E:\\unit\\0_structure.json",
      modelCount: 2,
      totalFiles: 20,
      removedFiles: [],
      syncWarning: "Error: sync exploded",
    });
  });

  it("returns a sync warning when the mutation result has no structure path for follow-up sync", async () => {
    mocks.invokeMock.mockResolvedValueOnce({
      modelRoot: "E:\\unit\\0",
      structureJsonPath: "",
      modelCount: 2,
      totalFiles: 20,
      removedFiles: [],
    });

    await expect(
      addUnitModelModel("E:/unit/0", "E:/source"),
    ).resolves.toEqual({
      modelRoot: "E:\\unit\\0",
      structureJsonPath: "",
      modelCount: 2,
      totalFiles: 20,
      removedFiles: [],
      syncWarning: "Texture container sync skipped: missing structure JSON path.",
    });
  });

  it("syncs all texture containers after removing a model", async () => {
    mocks.invokeMock
      .mockResolvedValueOnce({
        modelRoot: "E:\\unit\\0",
        structureJsonPath: "E:\\unit\\0_structure.json",
        modelCount: 1,
        totalFiles: 12,
        removedFiles: [".\\0\\models\\alpha\\alpha.numdlb"],
      })
      .mockResolvedValueOnce({
        modelRoot: "E:\\unit\\0",
        structureJsonPath: "E:\\unit\\0_structure.json",
        changed: true,
      });

    await removeUnitModelModel("E:/unit/0", "alpha", "E:/unit/0_structure.json");

    expect(mocks.invokeMock).toHaveBeenNthCalledWith(1, "remove_unit_model_model", {
      modelRoot: "E:\\unit\\0",
      structureJsonPath: "E:\\unit\\0_structure.json",
      modelName: "alpha",
    });
    expect(mocks.invokeMock).toHaveBeenNthCalledWith(2, "sync_unit_model_texture_containers", {
      modelRoot: "E:\\unit\\0",
      structureJsonPath: "E:\\unit\\0_structure.json",
    });
  });

  it("syncs all texture containers after replacing a model", async () => {
    mocks.invokeMock
      .mockResolvedValueOnce({
        modelRoot: "E:\\unit\\0",
        structureJsonPath: "E:\\unit\\0_structure.json",
        modelCount: 2,
        totalFiles: 20,
        removedFiles: [".\\0\\models\\alpha\\alpha_old.numatb"],
      })
      .mockResolvedValueOnce({
        modelRoot: "E:\\unit\\0",
        structureJsonPath: "E:\\unit\\0_structure.json",
        changed: false,
      });

    await replaceUnitModelModel(
      "E:/unit/0",
      "alpha",
      "E:/source",
      "E:/unit/0_structure.json",
    );

    expect(mocks.invokeMock).toHaveBeenNthCalledWith(1, "replace_unit_model_model", {
      modelRoot: "E:\\unit\\0",
      structureJsonPath: "E:\\unit\\0_structure.json",
      targetModelName: "alpha",
      sourceDir: "E:\\source",
    });
    expect(mocks.invokeMock).toHaveBeenNthCalledWith(2, "sync_unit_model_texture_containers", {
      modelRoot: "E:\\unit\\0",
      structureJsonPath: "E:\\unit\\0_structure.json",
    });
  });

  it("previews and commits mesh-and-material replacement without texture container sync", async () => {
    mocks.invokeMock
      .mockResolvedValueOnce({
        target: {
          modelName: "alpha",
          modelIndex: 0,
          numdlbPath: "E:\\unit\\0\\models\\alpha\\alpha.numdlb",
          numshbPath: "E:\\unit\\0\\models\\alpha\\alpha.numshb",
          nusktbPath: null,
          jnttblPath: null,
          numatbPaths: [],
          nuhlpbPath: null,
        },
        sourceDir: "E:\\src\\body",
        sourceNumshbPath: "E:\\src\\body\\body.numshb",
        sourceNumdlbPath: "E:\\src\\body\\body.numdlb",
        sourceMayaNumatbPath: "E:\\src\\body\\body__maya__.numatb",
        sourceNustNumatbPath: "E:\\src\\body\\body__nust__.numatb",
        targetNumshbPath: "E:\\unit\\0\\models\\alpha\\alpha.numshb",
        targetNumdlbPath: "E:\\unit\\0\\models\\alpha\\alpha.numdlb",
        targetMayaNumatbPath: "E:\\unit\\0\\models\\alpha\\alpha__maya__.numatb",
        targetNustNumatbPath: "E:\\unit\\0\\models\\alpha\\alpha__nust__.numatb",
        meshObjects: {
          source: [],
          targetNumdlbEntries: [],
          kept: [],
          missingInSource: [],
          newInSource: [],
        },
        skeleton: {
          sourceInfluenceBones: [],
          targetBoneNames: [],
          matchingBoneNames: 0,
          missingInTargetSkeleton: [],
          sourceSkelBoneCount: null,
          matchingSkelBoneNames: null,
        },
        stats: {
          sourceObjectCount: 0,
          sourceVertexCount: 0,
          sourceTriangleCount: 0,
        },
        warnings: [],
        blockers: [],
      })
      .mockResolvedValueOnce({
        modelRoot: "E:\\unit\\0",
        structureJsonPath: "E:\\unit\\0_structure.json",
        modelCount: 1,
        totalFiles: 7,
        removedFiles: [],
      });

    await previewUnitModelNumshbReplacement(
      "E:/unit/0",
      "alpha",
      "E:/src/body",
      "E:/unit/0_structure.json",
    );
    await replaceUnitModelNumshb(
      "E:/unit/0",
      "alpha",
      "E:/src/body",
      "E:/unit/0_structure.json",
    );

    expect(mocks.invokeMock).toHaveBeenNthCalledWith(
      1,
      "preview_unit_model_numshb_replacement",
      {
        modelRoot: "E:\\unit\\0",
        structureJsonPath: "E:\\unit\\0_structure.json",
        targetModelName: "alpha",
        sourceDir: "E:\\src\\body",
      },
    );
    expect(mocks.invokeMock).toHaveBeenNthCalledWith(2, "replace_unit_model_numshb", {
      modelRoot: "E:\\unit\\0",
      structureJsonPath: "E:\\unit\\0_structure.json",
      targetModelName: "alpha",
      sourceDir: "E:\\src\\body",
    });
    expect(mocks.invokeMock).not.toHaveBeenCalledWith(
      "sync_unit_model_texture_containers",
      expect.anything(),
    );
  });

  it("passes selected geometries and streams progress for FBX/DAE imports", async () => {
    mocks.invokeMock
      .mockResolvedValueOnce({
        modelRoot: "E:\\unit\\0",
        structureJsonPath: "E:\\unit\\0_structure.json",
        modelCount: 2,
        totalFiles: 20,
        removedFiles: [],
      })
      .mockResolvedValueOnce({
        modelRoot: "E:\\unit\\0",
        structureJsonPath: "E:\\unit\\0_structure.json",
        changed: true,
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
    expect(mocks.invokeMock).toHaveBeenNthCalledWith(2, "sync_unit_model_texture_containers", {
      modelRoot: "E:\\unit\\0",
      structureJsonPath: "E:\\unit\\0_structure.json",
    });

    mocks.channels[0]?.onmessage?.({ kind: "complete" });
    expect(onProgress).toHaveBeenCalledWith({ kind: "complete" });
  });

  it("stages converted SSBH into an output folder without adding a model", async () => {
    mocks.invokeMock.mockResolvedValue({
      outputDir: "C:\\Temp\\unit-model-replace-full\\stamp",
      fileCount: 8,
    });
    const onProgress = vi.fn();

    const result = await stageUnitModelStaticMesh(
      {
        modelRoot: "E:/unit/0",
        outputDir: "C:/Temp/unit-model-replace-full/stamp",
        sourcePath: "E:/source/model.fbx",
        includeGeometryNames: ["SHAPE_ROOTShape", "SHAPE_ROOTShape__sub1"],
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

    expect(result.fileCount).toBe(8);
    expect(mocks.invokeMock).toHaveBeenCalledWith(
      "unit_model_stage_static_mesh",
      expect.objectContaining({
        options: expect.objectContaining({
          modelRoot: "E:\\unit\\0",
          outputDir: "C:\\Temp\\unit-model-replace-full\\stamp",
          sourcePath: "E:\\source\\model.fbx",
          includeGeometryNames: ["SHAPE_ROOTShape", "SHAPE_ROOTShape__sub1"],
        }),
        onProgress: mocks.channels[0],
      }),
    );
  });
});
