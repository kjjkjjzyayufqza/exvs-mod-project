import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(),
  writeTextFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join("/"))),
}));

vi.mock("./sceneDeleteConfirm", () => ({
  buildDeletePreview: vi.fn(),
  executeDelete: vi.fn(),
}));

vi.mock("./sceneTextureMigration", () => ({
  detectOldTextureFormat: vi.fn(),
  migrateTexturesToSharedFolder: vi.fn(),
}));

vi.mock("./sceneSessionService", () => ({
  sceneSaveAsFolder: vi.fn(),
}));

vi.mock("@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService", () => ({
  ssbhAnalyzeDae: vi.fn(),
  ssbhConvertDaeToSsbh: vi.fn(),
}));

vi.mock("./daeExportImport", () => ({
  writeObjectAsDAE: vi.fn(),
}));

vi.mock("./sceneSavePipeline", () => ({
  createBakedImportedDaeExportObject: vi.fn(),
}));

vi.mock("./sceneDaeSsbhSave", () => ({
  buildImportedDaeStageRegistrationPlan: vi.fn(),
  buildImportedDaeSsbhConvertParams: vi.fn(),
  createImportedDaeJnttblBytes: vi.fn(),
  createImportedDaePlacementRow: vi.fn(),
}));

vi.mock("./sceneStageStructure", () => ({
  resolveStagePackStructureTarget: vi.fn(() => ({
    packRoot: "E:/stage",
    structurePath: "E:/0x12345678_structure.json",
    packFolderName: "12345678",
    hashHex: "0x12345678",
  })),
  buildStageStructureJsonFromFiles: vi.fn(() => ({ Magic: 0, Fhm2dTotalCount: 0, UnkCount: 0, SubFileData: [], SubFileStructure: [] })),
}));

import { writeTextFile, readDir } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { buildDeletePreview, executeDelete } from "./sceneDeleteConfirm";
import { detectOldTextureFormat, migrateTexturesToSharedFolder } from "./sceneTextureMigration";
import { executeSaveFolderPipeline, type SaveFolderParams } from "./sceneSaveFolderPipeline";
import { useSceneDirtyStore } from "../store/sceneDirtyStore";
import type { SaveStepInfo } from "../components/SaveProgressDialog";

const mockWriteTextFile = vi.mocked(writeTextFile);
const mockReadDir = vi.mocked(readDir);
const mockInvoke = vi.mocked(invoke);
const mockDetect = vi.mocked(detectOldTextureFormat);
const mockMigrate = vi.mocked(migrateTexturesToSharedFolder);
const mockBuildDeletePreview = vi.mocked(buildDeletePreview);
const mockExecuteDelete = vi.mocked(executeDelete);

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
    mockDetect.mockResolvedValue(false);
    mockReadDir.mockResolvedValue([]);
    mockWriteTextFile.mockResolvedValue(undefined);
    mockInvoke.mockResolvedValue({
      rootPath: "E:/stage",
      baseModel: null,
      subModels: [],
      graphicParams: [],
      placementHeader: [],
      placementEntries: [],
      warnings: [],
    });
  });

  it("writes graphic_param.csv even with no dirty objects", async () => {
    const params = makeParams();
    const result = await executeSaveFolderPipeline(params);
    expect(result.success).toBe(true);
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      "E:/stage/16F73C97/0/0/info/graphic_param.csv",
      "fog_density,0.5",
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

  it("runs texture migration when old format detected", async () => {
    mockDetect.mockResolvedValue(true);
    mockMigrate.mockResolvedValue({ migratedCount: 5, deduplicatedCount: 1, conflicts: [] });

    const params = makeParams();
    const result = await executeSaveFolderPipeline(params);
    expect(result.migratedTextures).toBe(5);
    expect(mockMigrate).toHaveBeenCalledWith("E:/stage/16F73C97/0/0");
  });

  it("skips migration when new format detected", async () => {
    mockDetect.mockResolvedValue(false);
    const params = makeParams();
    await executeSaveFolderPipeline(params);
    expect(mockMigrate).not.toHaveBeenCalled();
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
});
