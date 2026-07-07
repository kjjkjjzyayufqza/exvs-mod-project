import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkspaceContentDescriptor, type ResolvedWorkspaceContentLocation } from "./contentCatalog";
import { moveLegacyWorkspaceContentToConfigured } from "./legacyMigration";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

function legacyCharacterIdContent(): ResolvedWorkspaceContentLocation {
  return {
    descriptor: getWorkspaceContentDescriptor("character-id-table"),
    configured: {
      routeId: "list.character",
      prefix: "012list",
      routeRootPath: "E:/workspace/012list",
      hashHex: "0x036B9E67",
      folderPath: "E:/workspace/012list/characteridtable",
      structureJsonPath: "E:/workspace/012list/characteridtable_structure.json",
      packKey: "012list/characteridtable",
      filePath: "E:/workspace/012list/characteridtable/character_id_table.bin",
    },
    existing: {
      routeId: "list.character",
      prefix: "",
      routeRootPath: "E:/workspace",
      hashHex: "0x036B9E67",
      folderPath: "E:/workspace/0x036B9E67",
      structureJsonPath: "E:/workspace/0x036B9E67_structure.json",
      packKey: "0x036B9E67",
      filePath: "E:/workspace/0x036B9E67/character_id_table.bin",
    },
    sourceLayout: "legacy",
    writable: false,
    duplicateLayout: false,
  };
}

describe("moveLegacyWorkspaceContentToConfigured", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("invokes the Rust move command with resolved legacy and configured asset roots", async () => {
    invokeMock.mockResolvedValue({
      sourceFolderPath: "E:/workspace/0x036B9E67",
      sourceStructureJsonPath: "E:/workspace/0x036B9E67_structure.json",
      configuredFolderPath: "E:/workspace/012list/characteridtable",
      configuredStructureJsonPath: "E:/workspace/012list/characteridtable_structure.json",
    });

    const result = await moveLegacyWorkspaceContentToConfigured(legacyCharacterIdContent());

    expect(invokeMock).toHaveBeenCalledWith("move_legacy_workspace_content", {
      sourceFolderPath: "E:/workspace/0x036B9E67",
      sourceStructureJsonPath: "E:/workspace/0x036B9E67_structure.json",
      configuredFolderPath: "E:/workspace/012list/characteridtable",
      configuredStructureJsonPath: "E:/workspace/012list/characteridtable_structure.json",
    });
    expect(result.configuredFolderPath).toBe("E:/workspace/012list/characteridtable");
  });

  it("rejects content that is already using the configured route", async () => {
    const content = legacyCharacterIdContent();
    content.sourceLayout = "configured";
    content.writable = true;
    content.existing = content.configured;

    await expect(moveLegacyWorkspaceContentToConfigured(content)).rejects.toThrow(
      "Only legacy flat workspace content can be moved",
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
