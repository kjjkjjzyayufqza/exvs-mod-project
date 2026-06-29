import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "./defaults";
import { resolveExistingFhm2dPack, resolveFhm2dPackPaths } from "./paths";
import type { TestEditorWorkspaceDocument } from "./types";

const { existsMock, readDirMock, readTextFileMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
  readDirMock: vi.fn(),
  readTextFileMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.filter(Boolean).join("/")),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
  readDir: readDirMock,
  readTextFile: readTextFileMock,
}));

function withExistingPaths(paths: string[]) {
  const existing = new Set(paths);
  existsMock.mockImplementation(async (path: string) => existing.has(path));
}

function withDirectoryEntries(entriesByPath: Record<string, string[]>) {
  readDirMock.mockImplementation(async (path: string) =>
    (entriesByPath[path] ?? []).map((name) => ({ name })),
  );
}

function withTextFiles(filesByPath: Record<string, string>) {
  readTextFileMock.mockImplementation(async (path: string) => {
    const content = filesByPath[path];
    if (content === undefined) {
      throw new Error(`Missing mock file: ${path}`);
    }
    return content;
  });
}

function withoutLegacyFallback(): TestEditorWorkspaceDocument {
  return {
    ...DEFAULT_TEST_EDITOR_WORKSPACE,
    legacyReadFallback: false,
    assetRoutes: { ...DEFAULT_TEST_EDITOR_WORKSPACE.assetRoutes },
  };
}

describe("testEditorWorkspace paths", () => {
  beforeEach(() => {
    existsMock.mockReset();
    readDirMock.mockReset();
    readTextFileMock.mockReset();
    readDirMock.mockResolvedValue([]);
    readTextFileMock.mockRejectedValue(new Error("Missing mock file"));
  });

  it("builds the Character Model pack under 002chara", async () => {
    const paths = await resolveFhm2dPackPaths(
      "E:/XB/unpack/com/file",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "unit.model",
      "0xBDBE6FEA",
    );

    expect(paths.routeRootPath).toBe("E:/XB/unpack/com/file/002chara");
    expect(paths.folderPath).toBe("E:/XB/unpack/com/file/002chara/0xBDBE6FEA");
    expect(paths.structureJsonPath).toBe(
      "E:/XB/unpack/com/file/002chara/0xBDBE6FEA_structure.json",
    );
    expect(paths.packKey).toBe("002chara/0xBDBE6FEA");
  });

  it("builds a custom-named pack path while preserving the game hash", async () => {
    const paths = await resolveFhm2dPackPaths(
      "E:/XB/unpack/com/file",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "unit.model",
      "0xBDBE6FEA",
      "Gyan model (test)",
    );

    expect(paths.hashHex).toBe("0xBDBE6FEA");
    expect(paths.folderPath).toBe("E:/XB/unpack/com/file/002chara/Gyan_model_test");
    expect(paths.structureJsonPath).toBe(
      "E:/XB/unpack/com/file/002chara/Gyan_model_test_structure.json",
    );
    expect(paths.packKey).toBe("002chara/Gyan_model_test");
  });

  it("prefers the configured pack when both configured and legacy packs exist", async () => {
    withExistingPaths([
      "E:/workspace/002chara/0xBDBE6FEA",
      "E:/workspace/002chara/0xBDBE6FEA_structure.json",
      "E:/workspace/0xBDBE6FEA",
      "E:/workspace/0xBDBE6FEA_structure.json",
    ]);

    const resolution = await resolveExistingFhm2dPack(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "unit.model",
      "0xBDBE6FEA",
    );

    expect(resolution.sourceLayout).toBe("configured");
    expect(resolution.existing?.folderPath).toBe("E:/workspace/002chara/0xBDBE6FEA");
    expect(resolution.duplicateLayout).toBe(true);
  });

  it("reads a complete legacy flat pack when configured paths are missing", async () => {
    withExistingPaths(["E:/workspace/0xBDBE6FEA", "E:/workspace/0xBDBE6FEA_structure.json"]);

    const resolution = await resolveExistingFhm2dPack(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "unit.model",
      "0xBDBE6FEA",
    );

    expect(resolution.configured.folderPath).toBe("E:/workspace/002chara/0xBDBE6FEA");
    expect(resolution.sourceLayout).toBe("legacy");
    expect(resolution.existing?.folderPath).toBe("E:/workspace/0xBDBE6FEA");
    expect(resolution.existing?.structureJsonPath).toBe("E:/workspace/0xBDBE6FEA_structure.json");
    expect(resolution.existing?.packKey).toBe("0xBDBE6FEA");
  });

  it("resolves a configured custom-named pack by HashName metadata", async () => {
    withExistingPaths([
      "E:/workspace/002chara/Gyan_model",
      "E:/workspace/002chara/Gyan_model_structure.json",
    ]);
    withDirectoryEntries({
      "E:/workspace/002chara": ["Gyan_model", "Gyan_model_structure.json"],
    });
    withTextFiles({
      "E:/workspace/002chara/Gyan_model_structure.json": JSON.stringify({
        Name: "Gyan_model",
        HashName: "0xBDBE6FEA",
      }),
    });

    const resolution = await resolveExistingFhm2dPack(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "unit.model",
      "0xBDBE6FEA",
    );

    expect(resolution.sourceLayout).toBe("configured");
    expect(resolution.existing?.folderPath).toBe("E:/workspace/002chara/Gyan_model");
    expect(resolution.existing?.structureJsonPath).toBe(
      "E:/workspace/002chara/Gyan_model_structure.json",
    );
    expect(resolution.existing?.hashHex).toBe("0xBDBE6FEA");
    expect(resolution.existing?.packKey).toBe("002chara/Gyan_model");
  });

  it("resolves a legacy custom-named pack by HashName metadata", async () => {
    withExistingPaths(["E:/workspace/Gyan_model", "E:/workspace/Gyan_model_structure.json"]);
    withDirectoryEntries({
      "E:/workspace/002chara": [],
      "E:/workspace": ["Gyan_model", "Gyan_model_structure.json"],
    });
    withTextFiles({
      "E:/workspace/Gyan_model_structure.json": JSON.stringify({
        Name: "Gyan_model",
        HashName: "0xBDBE6FEA",
      }),
    });

    const resolution = await resolveExistingFhm2dPack(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "unit.model",
      "0xBDBE6FEA",
    );

    expect(resolution.sourceLayout).toBe("legacy");
    expect(resolution.existing?.folderPath).toBe("E:/workspace/Gyan_model");
    expect(resolution.existing?.structureJsonPath).toBe("E:/workspace/Gyan_model_structure.json");
    expect(resolution.existing?.hashHex).toBe("0xBDBE6FEA");
    expect(resolution.existing?.packKey).toBe("Gyan_model");
  });

  it("does not read legacy flat packs when legacy fallback is disabled", async () => {
    withExistingPaths(["E:/workspace/0xBDBE6FEA", "E:/workspace/0xBDBE6FEA_structure.json"]);

    const resolution = await resolveExistingFhm2dPack(
      "E:/workspace",
      withoutLegacyFallback(),
      "unit.model",
      "0xBDBE6FEA",
    );

    expect(resolution.sourceLayout).toBe("missing");
    expect(resolution.existing).toBeNull();
  });

  it("does not mix a configured folder with a legacy structure file", async () => {
    withExistingPaths([
      "E:/workspace/002chara/0xBDBE6FEA",
      "E:/workspace/0xBDBE6FEA_structure.json",
    ]);

    const resolution = await resolveExistingFhm2dPack(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "unit.model",
      "0xBDBE6FEA",
    );

    expect(resolution.sourceLayout).toBe("missing");
    expect(resolution.existing).toBeNull();
    expect(resolution.folderExists).toBe(true);
    expect(resolution.structureJsonExists).toBe(false);
  });
});
