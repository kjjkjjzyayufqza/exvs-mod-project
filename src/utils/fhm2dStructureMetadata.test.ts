import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";

import {
  promptAndMigrateFhm2dStructureIfNeeded,
  setFhm2dStructureMigrationPromptHandler,
} from "./fhm2dStructureMetadata";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("fhm2dStructureMetadata", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(() => {
    setFhm2dStructureMigrationPromptHandler(null);
  });

  it("returns null when structure metadata is already present", async () => {
    invokeMock.mockResolvedValueOnce({
      structureJsonPath: "E:/pack/Gyan_model_structure.json",
      needsMigration: false,
      name: "Gyan_model",
      hashName: "0xF6954689",
      suggestedName: "Gyan_model",
      suggestedHashName: "0xF6954689",
      rootPath: "E:/pack/Gyan_model",
    });

    const result = await promptAndMigrateFhm2dStructureIfNeeded({
      structureJsonPath: "E:/pack/Gyan_model_structure.json",
    });

    expect(result).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("uses the registered migration prompt handler and sanitizes the selected name", async () => {
    invokeMock
      .mockResolvedValueOnce({
        structureJsonPath: "E:/pack/0xF6954689_structure.json",
        needsMigration: true,
        name: null,
        hashName: null,
        suggestedName: "0xF6954689",
        suggestedHashName: "0xF6954689",
        rootPath: "E:/pack/0xF6954689",
      })
      .mockResolvedValueOnce({
        oldStructureJsonPath: "E:/pack/0xF6954689_structure.json",
        structureJsonPath: "E:/pack/Gyan_model_structure.json",
        oldRootPath: "E:/pack/0xF6954689",
        rootPath: "E:/pack/Gyan_model",
        name: "Gyan_model",
        hashName: "0xF6954689",
        updatedFileUrlCount: 8,
      });

    const unregister = setFhm2dStructureMigrationPromptHandler(async ({ analysis }) => {
      expect(analysis.suggestedHashName).toBe("0xF6954689");
      return "Gyan model!";
    });

    const result = await promptAndMigrateFhm2dStructureIfNeeded({
      structureJsonPath: "E:/pack/0xF6954689_structure.json",
      title: "Migrate test",
    });
    unregister();

    expect(invokeMock).toHaveBeenNthCalledWith(2, "migrate_fhm2d_structure_metadata", {
      structureJsonPath: "E:/pack/0xF6954689_structure.json",
      name: "Gyan_model",
    });
    expect(result?.structureJsonPath).toBe("E:/pack/Gyan_model_structure.json");
  });
});

