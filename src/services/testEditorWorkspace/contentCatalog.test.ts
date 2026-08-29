import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "./defaults";
import {
  getWorkspaceContentDescriptor,
  resolveWorkspaceContent,
} from "./contentCatalog";

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

describe("workspace content catalog", () => {
  beforeEach(() => {
    existsMock.mockReset();
    readDirMock.mockReset();
    readTextFileMock.mockReset();
    readDirMock.mockResolvedValue([]);
    readTextFileMock.mockRejectedValue(new Error("Missing mock file"));
  });

  it.each([
    ["character-id-table", "list.character", "0x036B9E67", "character_id_table.bin"],
    ["character-list", "list.character", "0xDFD38C70", "character_list.bin"],
    ["series-list", "list.series", "0xB7367090", "series_list.bin"],
    ["navi-list", "list.navi", "0x6FCC0FBA", "navi_list.bin"],
    ["character-cost", "param.for-outgame", "0xFF832E7F", null],
    ["striker-table", "unit.param", "0xFEEB79F0", "strikertable.vgsht1"],
    ["card-icons", "gui.card-icons", "0x49235031", null],
    ["series-icons", "gui.series-icons", "0xA0253AA0", null],
    ["stage-list", "list.stage", "0xCE74091E", "stage_list.bin"],
    ["stage-icons-primary", "gui.stage-icons", "0x3CC8B10B", null],
    ["stage-icons-secondary", "gui.stage-icons", "0x0CEE3991", null],
    ["raw-path-id", "unit.sound", "0x264D1CA7", null],
    ["pilot-voice-resource", "unit.sound", "0x8C428AF2", "pilotvoiceresourcetable.vrtbl"],
    ["bgm-table", "unit.sound", "0x5E92AAEC", "bgm_table.vgsht2"],
    ["bgm-bank-update-02", "unit.sound", "0x0C568109", null],
  ] as const)("defines %s", (id, routeId, hashHex, relativeFilePath) => {
    expect(getWorkspaceContentDescriptor(id)).toMatchObject({
      id,
      routeId,
      hashHex,
      relativeFilePath,
    });
  });

  it("resolves Character ID table under its mapped configured 012list folder", async () => {
    withExistingPaths([
      "E:/workspace/012list/characteridtable",
      "E:/workspace/012list/characteridtable_structure.json",
    ]);

    const result = await resolveWorkspaceContent(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "character-id-table",
    );

    expect(result.configured.filePath).toBe(
      "E:/workspace/012list/characteridtable/character_id_table.bin",
    );
    expect(result.existing?.filePath).toBe(
      "E:/workspace/012list/characteridtable/character_id_table.bin",
    );
    expect(result.sourceLayout).toBe("configured");
    expect(result.writable).toBe(true);
  });

  it("uses the generated FHM2D name map for fixed content write targets", async () => {
    withExistingPaths([]);

    const result = await resolveWorkspaceContent(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "character-cost",
    );

    expect(result.configured.folderPath).toBe("E:/workspace/041cpm/for_outgame");
    expect(result.configured.structureJsonPath).toBe(
      "E:/workspace/041cpm/for_outgame_structure.json",
    );
    expect(result.configured.packKey).toBe("041cpm/for_outgame");
    expect(result.existing).toBeNull();
    expect(result.sourceLayout).toBe("missing");
  });

  it("resolves Striker Table under 041cpm/strikertable", async () => {
    withExistingPaths([]);

    const result = await resolveWorkspaceContent(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "striker-table",
    );

    expect(result.descriptor.defaultPackName).toBe("strikertable");
    expect(result.configured.folderPath).toBe("E:/workspace/041cpm/strikertable");
    expect(result.configured.filePath).toBe(
      "E:/workspace/041cpm/strikertable/strikertable.vgsht1",
    );
    expect(result.configured.structureJsonPath).toBe(
      "E:/workspace/041cpm/strikertable_structure.json",
    );
    expect(result.configured.packKey).toBe("041cpm/strikertable");
    expect(result.sourceLayout).toBe("missing");
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

    expect(result.configured.folderPath).toBe("E:/workspace/012list/characteridtable");
    expect(result.configured.filePath).toBe(
      "E:/workspace/012list/characteridtable/character_id_table.bin",
    );
    expect(result.existing?.folderPath).toBe("E:/workspace/0x036B9E67");
    expect(result.existing?.filePath).toBe(
      "E:/workspace/0x036B9E67/character_id_table.bin",
    );
    expect(result.sourceLayout).toBe("legacy");
    expect(result.writable).toBe(false);
  });

  it("resolves Raw Path ID under 090sound/raw_path_id", async () => {
    withExistingPaths([]);

    const result = await resolveWorkspaceContent(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "raw-path-id",
    );

    expect(result.descriptor.defaultPackName).toBe("raw_path_id");
    expect(result.configured.folderPath).toBe("E:/workspace/090sound/raw_path_id");
    expect(result.configured.structureJsonPath).toBe(
      "E:/workspace/090sound/raw_path_id_structure.json",
    );
    expect(result.configured.packKey).toBe("090sound/raw_path_id");
    expect(result.sourceLayout).toBe("missing");
  });

  it("resolves Pilot Voice Table under 090sound/090sound", async () => {
    withExistingPaths([]);

    const result = await resolveWorkspaceContent(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "pilot-voice-resource",
    );

    expect(result.descriptor.defaultPackName).toBe("090sound");
    expect(result.configured.folderPath).toBe("E:/workspace/090sound/090sound");
    expect(result.configured.filePath).toBe(
      "E:/workspace/090sound/090sound/pilotvoiceresourcetable.vrtbl",
    );
    expect(result.configured.structureJsonPath).toBe(
      "E:/workspace/090sound/090sound_structure.json",
    );
    expect(result.sourceLayout).toBe("missing");
  });

  it("resolves BGM Table under 090sound/bgm_table", async () => {
    withExistingPaths([]);

    const result = await resolveWorkspaceContent(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "bgm-table",
    );

    expect(result.descriptor.defaultPackName).toBe("bgm_table");
    expect(result.configured.folderPath).toBe("E:/workspace/090sound/bgm_table");
    expect(result.configured.filePath).toBe(
      "E:/workspace/090sound/bgm_table/bgm_table.vgsht2",
    );
    expect(result.sourceLayout).toBe("missing");
  });

  it("resolves BGM AC27 Update 02 bank under 090sound/bgm_ac27_update_02", async () => {
    withExistingPaths([]);

    const result = await resolveWorkspaceContent(
      "E:/workspace",
      DEFAULT_TEST_EDITOR_WORKSPACE,
      "bgm-bank-update-02",
    );

    expect(result.descriptor.defaultPackName).toBe("bgm_ac27_update_02");
    expect(result.configured.folderPath).toBe("E:/workspace/090sound/bgm_ac27_update_02");
    expect(result.configured.filePath).toBeNull();
    expect(result.sourceLayout).toBe("missing");
  });
});
