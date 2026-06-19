import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import { resolveFhm2dPackPaths } from "@/services/testEditorWorkspace/paths";
import type { AssetRefInfo } from "./assetRef";
import { extractAsset, getExtractOutputFolderCollisionInfo } from "./extractFhm2d";

const { existsMock, readFileMock, invokeMock, extractFHMDataMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
  readFileMock: vi.fn(),
  invokeMock: vi.fn(),
  extractFHMDataMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.filter(Boolean).join("/")),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
  readFile: readFileMock,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@/models/fhm2d", () => ({
  ExtractFHMData: extractFHMDataMock,
  ExtractType: {
    SingleFolder: "SingleFolder",
  },
  Fhm2d_type_format: {
    fhm2d_character: "fhm2d_character",
    fhm2d_effect: "fhm2d_effect",
    fhm2d_character_param: "fhm2d_character_param",
    fhm2d_msc: "fhm2d_msc",
    fhm2d_motion: "fhm2d_motion",
    fhm2d_sound: "fhm2d_sound",
  },
}));

function assetFixture(): AssetRefInfo {
  return {
    fieldKey: "Model",
    routeId: "unit.model",
    rawValue: -1111592982,
    hashHex: "0xBDBE6FEA",
    sourceFilePath: "E:/OB/dplcache/0xBDBE6FEA.fhm2d",
    modFilePath: "E:/OB/mod/0xBDBE6FEA.fhm2d",
    workspacePack: {
      configured: {
        routeId: "unit.model",
        prefix: "002chara",
        routeRootPath: "E:/workspace/002chara",
        hashHex: "0xBDBE6FEA",
        folderPath: "E:/workspace/002chara/0xBDBE6FEA",
        structureJsonPath: "E:/workspace/002chara/0xBDBE6FEA_structure.json",
        packKey: "002chara/0xBDBE6FEA",
      },
      existing: null,
      sourceLayout: "missing",
      folderExists: false,
      structureJsonExists: false,
      duplicateLayout: false,
    },
    workspaceFolderPath: "E:/workspace/002chara/0xBDBE6FEA",
    isModel: true,
    isEffectAsset: false,
    isParamAsset: false,
    isMscAsset: false,
    isMotionAsset: false,
    isSoundAsset: false,
  };
}

describe("extractFhm2d route targets", () => {
  beforeEach(() => {
    existsMock.mockReset();
    readFileMock.mockReset();
    invokeMock.mockReset();
    extractFHMDataMock.mockReset();
    existsMock.mockResolvedValue(true);
    readFileMock.mockResolvedValue(new Uint8Array([0xb9, 0xb7, 0xb2, 0xcd, 0x00]));
    invokeMock.mockResolvedValue(false);
    extractFHMDataMock.mockResolvedValue({ namingError: undefined });
  });

  it("extracts Model to the configured 002chara pack folder", async () => {
    const target = await resolveFhm2dPackPaths(
      "E:/output",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "unit.model",
      "0xBDBE6FEA",
    );

    const result = await extractAsset(assetFixture(), target);

    expect(extractFHMDataMock).toHaveBeenCalledWith(
      "E:/OB/dplcache/0xBDBE6FEA.fhm2d",
      "E:/output/002chara/0xBDBE6FEA",
      "SingleFolder",
      "fhm2d_character",
      undefined,
      false,
    );
    expect(result.path).toBe("E:/output/002chara/0xBDBE6FEA");
  });

  it("checks collisions at the resolved pack target", async () => {
    invokeMock.mockResolvedValue(true);
    const target = await resolveFhm2dPackPaths(
      "E:/output",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "unit.model",
      "0xBDBE6FEA",
    );

    const result = await getExtractOutputFolderCollisionInfo(target);

    expect(invokeMock).toHaveBeenCalledWith("path_exists", {
      path: "E:/output/002chara/0xBDBE6FEA",
    });
    expect(result).toEqual({
      targetDir: "E:/output/002chara/0xBDBE6FEA",
      folderExists: true,
    });
  });
});
