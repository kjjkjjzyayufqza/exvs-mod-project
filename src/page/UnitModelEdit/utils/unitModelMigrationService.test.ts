import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invokeMock,
}));

import {
  analyzeUnitModelFolderMigration,
  migrateUnitModelFolderLayout,
} from "./unitModelMigrationService";

describe("unitModelMigrationService", () => {
  beforeEach(() => {
    mocks.invokeMock.mockReset();
  });

  it("analyzes folders through the dedicated migration command", async () => {
    mocks.invokeMock.mockResolvedValue({
      modelRoot: "E:\\unit\\0xUNIT",
      structureJsonPath: "E:\\unit\\0xUNIT_structure.json",
      state: "legacy",
      canMigrate: true,
      reason: null,
      modelCount: 1,
      totalFiles: 8,
      plannedFileMoves: 6,
      plannedFileUrlUpdates: 6,
      warnings: [],
    });

    await analyzeUnitModelFolderMigration("E:/unit/0xUNIT");

    expect(mocks.invokeMock).toHaveBeenCalledWith("analyze_unit_model_folder_migration", {
      modelRoot: "E:\\unit\\0xUNIT",
      structureJsonPath: undefined,
    });
  });

  it("passes an explicit structure json path when migrating", async () => {
    mocks.invokeMock.mockResolvedValue({
      modelRoot: "E:\\unit\\0xUNIT",
      structureJsonPath: "E:\\unit\\0xUNIT_structure.json",
      migrated: true,
      modelCount: 1,
      totalFiles: 8,
      movedFiles: 6,
      updatedFileUrls: 6,
      removedLegacyFiles: [],
      backupStructureJsonPath: "E:\\unit\\0xUNIT_structure.json.bak",
      warnings: [],
    });

    await migrateUnitModelFolderLayout(
      "E:/unit/0xUNIT",
      "E:/unit/0xUNIT_structure.json",
    );

    expect(mocks.invokeMock).toHaveBeenCalledWith("migrate_unit_model_folder_layout", {
      modelRoot: "E:\\unit\\0xUNIT",
      structureJsonPath: "E:\\unit\\0xUNIT_structure.json",
    });
  });
});
