import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "./defaults";
import {
  getWorkspaceContentDescriptor,
  resolveWorkspaceContent,
} from "./contentCatalog";

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

describe("workspace content catalog", () => {
  beforeEach(() => {
    existsMock.mockReset();
  });

  it.each([
    ["character-id-table", "list.character", "0x036B9E67", "character_id_table.bin"],
    ["character-list", "list.character", "0xDFD38C70", "character_list.bin"],
    ["series-list", "list.series", "0xB7367090", "series_list.bin"],
    ["character-cost", "param.for-outgame", "0xFF832E7F", null],
    ["card-icons", "gui.card-icons", "0x49235031", null],
    ["series-icons", "gui.series-icons", "0xA0253AA0", null],
    ["stage-list", "list.stage", "0xCE74091E", "stage_list.bin"],
    ["stage-icons-primary", "gui.stage-icons", "0x3CC8B10B", null],
    ["stage-icons-secondary", "gui.stage-icons", "0x0CEE3991", null],
  ] as const)("defines %s", (id, routeId, hashHex, relativeFilePath) => {
    expect(getWorkspaceContentDescriptor(id)).toMatchObject({
      id,
      routeId,
      hashHex,
      relativeFilePath,
    });
  });

  it("resolves Character ID table under the configured 012list route", async () => {
    withExistingPaths([
      "E:/workspace/012list/0x036B9E67",
      "E:/workspace/012list/0x036B9E67_structure.json",
    ]);

    const result = await resolveWorkspaceContent(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "character-id-table",
    );

    expect(result.configured.filePath).toBe(
      "E:/workspace/012list/0x036B9E67/character_id_table.bin",
    );
    expect(result.existing?.filePath).toBe(
      "E:/workspace/012list/0x036B9E67/character_id_table.bin",
    );
    expect(result.sourceLayout).toBe("configured");
    expect(result.writable).toBe(true);
  });

  it("reads a complete legacy flat fixed package but keeps the configured write target", async () => {
    withExistingPaths([
      "E:/workspace/0x036B9E67",
      "E:/workspace/0x036B9E67_structure.json",
    ]);

    const result = await resolveWorkspaceContent(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "character-id-table",
    );

    expect(result.configured.folderPath).toBe("E:/workspace/012list/0x036B9E67");
    expect(result.configured.filePath).toBe(
      "E:/workspace/012list/0x036B9E67/character_id_table.bin",
    );
    expect(result.existing?.folderPath).toBe("E:/workspace/0x036B9E67");
    expect(result.existing?.filePath).toBe(
      "E:/workspace/0x036B9E67/character_id_table.bin",
    );
    expect(result.sourceLayout).toBe("legacy");
    expect(result.writable).toBe(false);
  });
});
