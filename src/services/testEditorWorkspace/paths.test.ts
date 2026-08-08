import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "./defaults";
import {
  clearFhm2dPackResolutionCache,
  resolveExistingFhm2dPack,
  resolveFhm2dPackPaths,
} from "./paths";
import type { TestEditorWorkspaceDocument } from "./types";

const { existsMock, readDirMock, readTextFileMock, writeTextFileMock, removeMock } = vi.hoisted(
  () => ({
    existsMock: vi.fn(),
    readDirMock: vi.fn(),
    readTextFileMock: vi.fn(),
    writeTextFileMock: vi.fn(),
    removeMock: vi.fn(),
  }),
);

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.filter(Boolean).join("/")),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
  readDir: readDirMock,
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
  remove: removeMock,
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
    clearFhm2dPackResolutionCache();
    existsMock.mockReset();
    readDirMock.mockReset();
    readTextFileMock.mockReset();
    writeTextFileMock.mockReset();
    removeMock.mockReset();
    readDirMock.mockResolvedValue([]);
    readTextFileMock.mockRejectedValue(new Error("Missing mock file"));
    writeTextFileMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
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

  it("reuses the named pack index for repeated lookups in the same route root", async () => {
    const document = withoutLegacyFallback();
    withExistingPaths([
      "E:/workspace/002chara/Gyan_model",
      "E:/workspace/002chara/Zaku_model",
    ]);
    withDirectoryEntries({
      "E:/workspace/002chara": [
        "Gyan_model",
        "Gyan_model_structure.json",
        "Zaku_model",
        "Zaku_model_structure.json",
      ],
    });
    withTextFiles({
      "E:/workspace/002chara/Gyan_model_structure.json": JSON.stringify({
        Name: "Gyan_model",
        HashName: "0xBDBE6FEA",
      }),
      "E:/workspace/002chara/Zaku_model_structure.json": JSON.stringify({
        Name: "Zaku_model",
        HashName: "0x036B9E67",
      }),
    });

    const [gyan, zaku] = await Promise.all([
      resolveExistingFhm2dPack("E:/workspace", document, "unit.model", "0xBDBE6FEA"),
      resolveExistingFhm2dPack("E:/workspace", document, "unit.model", "0x036B9E67"),
    ]);

    expect(gyan.existing?.folderPath).toBe("E:/workspace/002chara/Gyan_model");
    expect(zaku.existing?.folderPath).toBe("E:/workspace/002chara/Zaku_model");
    expect(readDirMock).toHaveBeenCalledTimes(1);
    // Two custom-name structure files; disk index miss uses readTextFile once each.
    // (Sidecar index path may also be probed and rejected — count >= 2.)
    expect(readTextFileMock.mock.calls.filter((c) => String(c[0]).endsWith("_structure.json")).length).toBe(2);
  });

  it("indexes hash-stem packs without reading structure JSON content", async () => {
    // Custom-named hit for 0xBDBE6FEA; sibling 0xDEADBEEF is hash-stem and must
    // not trigger a content read when building the named index.
    withExistingPaths([
      "E:/workspace/006effect/Gyan_effect",
      "E:/workspace/006effect/0xDEADBEEF",
    ]);
    withDirectoryEntries({
      "E:/workspace/006effect": [
        "Gyan_effect",
        "Gyan_effect_structure.json",
        "0xDEADBEEF",
        "0xDEADBEEF_structure.json",
        "other.bin",
      ],
    });
    withTextFiles({
      "E:/workspace/006effect/Gyan_effect_structure.json": JSON.stringify({
        Name: "Gyan_effect",
        HashName: "0xBDBE6FEA",
        SubFileData: new Array(5000).fill({ fileUrl: "./x.bin" }),
      }),
    });

    const resolution = await resolveExistingFhm2dPack(
      "E:/workspace",
      withoutLegacyFallback(),
      "unit.effect",
      "0xBDBE6FEA",
    );

    expect(resolution.existing?.folderPath).toBe("E:/workspace/006effect/Gyan_effect");
    const structureReads = readTextFileMock.mock.calls.filter((c) =>
      String(c[0]).endsWith("_structure.json"),
    );
    expect(structureReads).toHaveLength(1);
    expect(String(structureReads[0]?.[0])).toContain("Gyan_effect_structure.json");
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
