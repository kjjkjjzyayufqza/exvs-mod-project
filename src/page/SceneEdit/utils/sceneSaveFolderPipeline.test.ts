import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("./sceneDeleteConfirm", () => ({
  buildDeletePreview: vi.fn(),
  executeDelete: vi.fn(),
}));

vi.mock("./sceneSessionService", () => ({
  sceneSaveAsFolder: vi.fn(),
  sceneImportDae: vi.fn(),
  sceneConfigureImport: vi.fn(),
  sceneExecuteImport: vi.fn(),
}));

vi.mock("./sceneDaeSessionImport", () => ({
  retargetSessionImportFolderName: vi.fn(),
}));

vi.mock("./sceneSavePipeline", () => ({
  createBakedImportedDaeExportObject: vi.fn(),
}));

vi.mock("./sceneDaeSsbhSave", () => ({
  buildImportedDaeStageRegistrationPlan: vi.fn(),
  createImportedDaePlacementRow: vi.fn(),
}));

vi.mock("./sceneStageStructure", () => ({
  resolveStagePackStructureTarget: vi.fn(() => ({
    packRoot: "E:/stage",
    structurePath: "E:/0x12345678_structure.json",
    packFolderName: "12345678",
    hashHex: "0x12345678",
  })),
}));

vi.mock("./daeExportImport", () => ({
  serializeDaeToBytes: vi.fn(() => [60, 67, 79, 76]),
}));

import { writeTextFile, readDir } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { buildDeletePreview, executeDelete } from "./sceneDeleteConfirm";
import { executeSaveFolderPipeline, type SaveFolderParams } from "./sceneSaveFolderPipeline";
import { useSceneDirtyStore } from "../store/sceneDirtyStore";
import type { SaveStepInfo } from "../components/SaveProgressDialog";
import type { ImportedDaeObject } from "../components/MapViewport";
import {
  sceneExecuteImport,
  sceneImportDae,
  sceneSaveAsFolder,
} from "./sceneSessionService";
import { retargetSessionImportFolderName } from "./sceneDaeSessionImport";
import { buildImportedDaeStageRegistrationPlan } from "./sceneDaeSsbhSave";
import { createBakedImportedDaeExportObject } from "./sceneSavePipeline";

const mockWriteTextFile = vi.mocked(writeTextFile);
const mockReadDir = vi.mocked(readDir);
const mockInvoke = vi.mocked(invoke);
const mockBuildDeletePreview = vi.mocked(buildDeletePreview);
const mockExecuteDelete = vi.mocked(executeDelete);
const mockSceneSaveAsFolder = vi.mocked(sceneSaveAsFolder);
const mockSceneImportDae = vi.mocked(sceneImportDae);
const mockSceneExecuteImport = vi.mocked(sceneExecuteImport);
const mockRetargetSessionImportFolderName = vi.mocked(retargetSessionImportFolderName);
const mockBuildImportedDaeStageRegistrationPlan = vi.mocked(buildImportedDaeStageRegistrationPlan);
const mockCreateBakedImportedDaeExportObject = vi.mocked(createBakedImportedDaeExportObject);

const DEFAULT_TRANSFORM = {
  posX: 0,
  posY: 0,
  posZ: 0,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
};

function makeImportedDaeObject(overrides?: Partial<ImportedDaeObject>): ImportedDaeObject {
  return {
    id: "dae_obj_1",
    name: "sample_mesh",
    sourcePath: "E:/models/sample.dae",
    scene: {} as ImportedDaeObject["scene"],
    transform: { ...DEFAULT_TRANSFORM },
    ...overrides,
  };
}

function makeParams(overrides?: Partial<SaveFolderParams>): SaveFolderParams {
  return {
    stageRoot: "E:/stage/16F73C97/0/0",
    dirtyStore: useSceneDirtyStore.getState(),
    graphicParams: [{ key: "fog_density", value: "0.5" }],
    placementHeader: ["VDK_TYPE", "VDK_OBJECTNUMBER", "VDK_POSITION_X"],
    placementEntries: [],
    importedDaeObjects: [],
    sceneSessionId: null,
    onProgress: vi.fn(),
    onDeleteConfirm: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe("sceneSaveFolderPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSceneDirtyStore.getState().reset();
    mockReadDir.mockResolvedValue([]);
    mockWriteTextFile.mockResolvedValue(undefined);
    mockSceneSaveAsFolder.mockResolvedValue({ success: true, filesWritten: 4, warnings: [] });
    mockSceneImportDae.mockResolvedValue("import-new");
    mockSceneExecuteImport.mockResolvedValue({
      importId: "import-new",
      name: "sample_mesh",
      ssbhGenerated: true,
      hktGenerated: false,
      hktDetail: null,
      warnings: [],
    });
    mockRetargetSessionImportFolderName.mockResolvedValue(undefined);
    mockBuildImportedDaeStageRegistrationPlan.mockReturnValue({
      baseFilename: "sample_mesh",
      folderName: "sample_mesh",
      outputDir: "E:/stage/16F73C97/0/0/sample_mesh/0",
    });
    mockCreateBakedImportedDaeExportObject.mockReturnValue({} as ReturnType<typeof createBakedImportedDaeExportObject>);
    mockInvoke.mockImplementation(async (cmd: string, _args?: unknown) => {
      if (cmd === "restore_shared_textures") {
        return { texturesCollected: 0, subdirsRemoved: 0, warnings: [] };
      }
      if (cmd === "load_stage_bundle") {
        return {
          rootPath: "E:/stage",
          baseModel: null,
          subModels: [],
          graphicParams: [],
          placementHeader: [],
          placementEntries: [],
          warnings: [],
        };
      }
      if (cmd === "rebuild_stage_structure_json") {
        return null;
      }
      return null;
    });
  });

  it("writes graphic_param.csv even with no dirty objects", async () => {
    const params = makeParams();
    const result = await executeSaveFolderPipeline(params);
    expect(result.success).toBe(true);
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "E:/stage/16F73C97/0/0/info/graphic_param.csv",
      "fog_density,0.5\r\n",
    );
  });

  it("skips delete phase when no objects are deleted", async () => {
    const params = makeParams();
    await executeSaveFolderPipeline(params);
    expect(mockBuildDeletePreview).not.toHaveBeenCalled();
    expect(mockExecuteDelete).not.toHaveBeenCalled();
  });

  it("executes delete when dirty store has deleted objects and user confirms", async () => {
    const store = useSceneDirtyStore.getState();
    store.markObjectDeleted("box01");
    mockBuildDeletePreview.mockResolvedValue({
      previews: [{ folderName: "box01", folderPath: "E:/stage/box01", files: ["a.bin"], totalSizeBytes: 100 }],
      totalFiles: 1,
      totalSizeBytes: 100,
    });
    mockExecuteDelete.mockResolvedValue(undefined);

    const params = makeParams();
    const result = await executeSaveFolderPipeline(params);
    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(1);
    expect(mockExecuteDelete).toHaveBeenCalledWith("E:/stage/16F73C97/0/0", ["box01"]);
  });

  it("aborts save when user cancels delete confirmation", async () => {
    const store = useSceneDirtyStore.getState();
    store.markObjectDeleted("box01");
    mockBuildDeletePreview.mockResolvedValue({
      previews: [],
      totalFiles: 0,
      totalSizeBytes: 0,
    });

    const params = makeParams({
      onDeleteConfirm: vi.fn().mockResolvedValue(false),
    });
    const result = await executeSaveFolderPipeline(params);
    expect(result.success).toBe(false);
    expect(mockExecuteDelete).not.toHaveBeenCalled();
  });

  it("calls restore_shared_textures invoke", async () => {
    const params = makeParams();
    const result = await executeSaveFolderPipeline(params);
    expect(result.success).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("restore_shared_textures", {
      stageRoot: "E:/stage/16F73C97/0/0",
    });
  });

  it("records migrated texture count from restore result", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "restore_shared_textures") {
        return { texturesCollected: 7, subdirsRemoved: 2, warnings: [] };
      }
      if (cmd === "rebuild_stage_structure_json") return null;
      return { rootPath: "E:/stage", baseModel: null, subModels: [], graphicParams: [], placementHeader: [], placementEntries: [], warnings: [] };
    });

    const params = makeParams();
    const result = await executeSaveFolderPipeline(params);
    expect(result.migratedTextures).toBe(7);
  });

  it("reports progress for all phases", async () => {
    const onProgress = vi.fn();
    const params = makeParams({ onProgress });
    await executeSaveFolderPipeline(params);

    const stepIds = onProgress.mock.calls.map((c) => (c[0] as SaveStepInfo).id);
    expect(stepIds).toContain("delete");
    expect(stepIds).toContain("migrate");
    expect(stepIds).toContain("convert");
    expect(stepIds).toContain("csv");
    expect(stepIds).toContain("structure");
  });

  it("skips structure rebuild when skipStructureRebuild is true", async () => {
    const onProgress = vi.fn();
    const params = makeParams({ onProgress, skipStructureRebuild: true });
    await executeSaveFolderPipeline(params);

    const stepIds = onProgress.mock.calls.map((c) => (c[0] as SaveStepInfo).id);
    expect(stepIds).not.toContain("structure");
    expect(mockInvoke).not.toHaveBeenCalledWith(
      "rebuild_stage_structure_json",
      expect.anything(),
    );
  });

  it("reloads bundle after save", async () => {
    const params = makeParams();
    const result = await executeSaveFolderPipeline(params);
    expect(result.reloadedBundle).toBeDefined();
    expect(mockInvoke).toHaveBeenCalledWith("load_stage_bundle", {
      stageRoot: "E:/stage/16F73C97/0/0",
    });
  });

  it("retargets pre-converted session imports instead of re-importing DAE bytes", async () => {
    const store = useSceneDirtyStore.getState();
    store.markObjectAdded("sample_mesh");

    const params = makeParams({
      sceneSessionId: "session-1",
      importedDaeObjects: [
        makeImportedDaeObject({ sessionImportId: "import-existing" }),
      ],
    });

    const result = await executeSaveFolderPipeline(params);

    expect(result.success).toBe(true);
    expect(result.convertedCount).toBe(1);
    expect(mockRetargetSessionImportFolderName).toHaveBeenCalledWith(
      "session-1",
      "import-existing",
      expect.objectContaining({ convertToSsbh: true }),
      "sample_mesh",
    );
    expect(mockSceneImportDae).not.toHaveBeenCalled();
    expect(mockSceneExecuteImport).not.toHaveBeenCalled();
    expect(mockSceneSaveAsFolder).toHaveBeenCalledWith(
      "session-1",
      "E:/stage/16F73C97/0/0",
    );
  });

  it("converts preview-only imported DAE through the session pipeline on save", async () => {
    const store = useSceneDirtyStore.getState();
    store.markObjectAdded("sample_mesh");

    const params = makeParams({
      sceneSessionId: "session-1",
      importedDaeObjects: [makeImportedDaeObject()],
    });

    const result = await executeSaveFolderPipeline(params);

    expect(result.success).toBe(true);
    expect(result.convertedCount).toBe(1);
    expect(mockRetargetSessionImportFolderName).not.toHaveBeenCalled();
    expect(mockSceneImportDae).toHaveBeenCalled();
    expect(mockSceneExecuteImport).toHaveBeenCalled();
    expect(mockSceneSaveAsFolder).toHaveBeenCalledWith(
      "session-1",
      "E:/stage/16F73C97/0/0",
    );
  });
});
