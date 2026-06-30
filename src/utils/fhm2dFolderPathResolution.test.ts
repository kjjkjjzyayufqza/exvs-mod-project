import { describe, expect, it, vi, beforeEach } from "vitest";
import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

import {
  applyFhm2dStructureMigrationToPack,
  inferFhm2dStructurePathFromFolder,
  resolveMigratedFhm2dFolderPath,
} from "./fhm2dFolderPathResolution";
import { analyzeFhm2dStructureMigration } from "./fhm2dStructureMetadata";

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(),
  readDir: vi.fn(),
  readTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.join("/")),
}));

vi.mock("./fhm2dStructureMetadata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fhm2dStructureMetadata")>();
  return {
    ...actual,
    analyzeFhm2dStructureMigration: vi.fn(),
  };
});

const existsMock = vi.mocked(exists);
const readDirMock = vi.mocked(readDir);
const readTextFileMock = vi.mocked(readTextFile);
const analyzeMock = vi.mocked(analyzeFhm2dStructureMigration);

describe("fhm2dFolderPathResolution", () => {
  beforeEach(() => {
    existsMock.mockReset();
    readDirMock.mockReset();
    readTextFileMock.mockReset();
    analyzeMock.mockReset();
  });

  it("infers sibling structure json from a folder path", () => {
    expect(inferFhm2dStructurePathFromFolder("E:/workspace/006effect/0xBDBE6FEA")).toBe(
      "E:/workspace/006effect/0xBDBE6FEA_structure.json",
    );
  });

  it("returns the same folder path when it already exists", async () => {
    existsMock.mockResolvedValue(true);

    await expect(resolveMigratedFhm2dFolderPath("E:/workspace/006effect/0xBDBE6FEA")).resolves.toBe(
      "E:/workspace/006effect/0xBDBE6FEA",
    );
  });

  it("remaps a stale hash folder path using sibling structure metadata", async () => {
    existsMock.mockImplementation(async (path) => {
      const normalized = String(path).replace(/\\/g, "/");
      return (
        normalized === "E:/workspace/006effect/Gyan_effect" ||
        normalized.endsWith("Gyan_effect_structure.json")
      );
    });
    analyzeMock.mockResolvedValue({
      structureJsonPath: "E:/workspace/006effect/Gyan_effect_structure.json",
      needsMigration: false,
      name: "Gyan_effect",
      hashName: "0xBDBE6FEA",
      suggestedName: "Gyan_effect",
      suggestedHashName: "0xBDBE6FEA",
      rootPath: "E:/workspace/006effect/Gyan_effect",
    });
    readDirMock.mockResolvedValue([
      { name: "Gyan_effect_structure.json", isDirectory: false, isFile: true, isSymlink: false },
    ]);
    readTextFileMock.mockResolvedValue(
      JSON.stringify({ Name: "Gyan_effect", HashName: "0xBDBE6FEA" }),
    );

    await expect(resolveMigratedFhm2dFolderPath("E:/workspace/006effect/0xBDBE6FEA")).resolves.toBe(
      "E:/workspace/006effect/Gyan_effect",
    );

    expect(join).toHaveBeenCalled();
  });

  it("applies migration results to pack identity fields", () => {
    const next = applyFhm2dStructureMigrationToPack(
      {
        packKey: "006effect/0xBDBE6FEA",
        prefix: "006effect",
        hashFolderName: "0xBDBE6FEA",
        folderPath: "E:/workspace/006effect/0xBDBE6FEA",
        structureJsonPath: "E:/workspace/006effect/0xBDBE6FEA_structure.json",
      },
      {
        oldStructureJsonPath: "E:/workspace/006effect/0xBDBE6FEA_structure.json",
        structureJsonPath: "E:/workspace/006effect/Gyan_effect_structure.json",
        oldRootPath: "E:/workspace/006effect/0xBDBE6FEA",
        rootPath: "E:/workspace/006effect/Gyan_effect",
        name: "Gyan_effect",
        hashName: "0xBDBE6FEA",
        updatedFileUrlCount: 4,
      },
    );

    expect(next.folderPath).toBe("E:/workspace/006effect/Gyan_effect");
    expect(next.structureJsonPath).toBe("E:/workspace/006effect/Gyan_effect_structure.json");
    expect(next.packKey).toBe("006effect/Gyan_effect");
    expect(next.hashFolderName).toBe("0xBDBE6FEA");
  });
});
