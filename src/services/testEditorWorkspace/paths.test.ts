import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "./defaults";
import { resolveExistingFhm2dPack, resolveFhm2dPackPaths } from "./paths";
import type { TestEditorWorkspaceDocument } from "./types";

const { existsMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.filter(Boolean).join("/")),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
}));

function withExistingPaths(paths: string[]) {
  const existing = new Set(paths);
  existsMock.mockImplementation(async (path: string) => existing.has(path));
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
