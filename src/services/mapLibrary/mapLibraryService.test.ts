import { describe, expect, it, vi, beforeEach } from "vitest";

const readDir = vi.fn();
const exists = vi.fn();
const loadTestEditorWorkspace = vi.fn();
const resolveWorkspaceContent = vi.fn();
const resolveWorkspaceRouteRoot = vi.fn();

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: (path: string) => readDir(path),
  exists: (path: string) => exists(path),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@/services/testEditorWorkspace/persistence", () => ({
  loadTestEditorWorkspace: (root: string) => loadTestEditorWorkspace(root),
}));

vi.mock("@/services/testEditorWorkspace/contentCatalog", () => ({
  resolveWorkspaceContent: (root: string, doc: unknown, id: string) =>
    resolveWorkspaceContent(root, doc, id),
}));

vi.mock("@/services/testEditorWorkspace/paths", () => ({
  resolveWorkspaceRouteRoot: (root: string, doc: unknown, routeId: string) =>
    resolveWorkspaceRouteRoot(root, doc, routeId),
}));

import type { StageListEntry } from "@/models/stageListEntry";
import {
  buildMapLibraryRows,
  findRowByMapHash,
  mapPackFolderName,
  resolveMapWorkspace,
  toPackHashName,
} from "./mapLibraryService";

/** Side 7: map hash 0xFE67F4F9, geometry pack 0x4D1F5138 (`201stage201`). */
function stageEntry(overrides: Partial<StageListEntry>): StageListEntry {
  return {
    entryId: 0xfe67f4f9,
    recordLookupId: 0x1,
    randomSelectWeightDefault: 0,
    randomSelectWeightAlt: 0,
    unk0x0c: 0,
    seriesAltGroupId: 0,
    unk0x14: 0,
    vsSD: 0,
    fileName: 0x4d1f5138,
    selectOrderAlt: 0,
    vsSL: 0,
    seriesDefaultGroupId: 0,
    name: "サイド7",
    unk0x34: 0,
    unk0x38: 0,
    selectOrderDefault: 0,
    vsSn: 0,
    iconIndex: 0,
    ...overrides,
  };
}

beforeEach(() => {
  readDir.mockReset();
  exists.mockReset();
  loadTestEditorWorkspace.mockReset();
  resolveWorkspaceContent.mockReset();
  resolveWorkspaceRouteRoot.mockReset();
});

describe("path helpers", () => {
  it("formats a pack hash the way the dplcache names its files", () => {
    expect(toPackHashName(0x4d1f5138)).toBe("0x4D1F5138");
    expect(toPackHashName(0x00772d33)).toBe("0x00772D33");
  });

  it("names a known pack after its researched package name", () => {
    expect(mapPackFolderName(0x4d1f5138)).toBe("201stage201");
  });

  it("falls back to the hash name for a pack the name map does not know", () => {
    expect(mapPackFolderName(0x1234abcd)).toBe("0x1234ABCD");
  });
});

describe("resolveMapWorkspace", () => {
  it("resolves both paths through the workspace, not a fixed layout", async () => {
    // Regression: the first build keyed off `extractOutputPath`, which is a
    // different (and often empty) setting from the EXVS2 Workspace folder the
    // Stage List view actually reads.
    const stageListPath = "E:\\XB\\mod\\012list\\stage_list\\stage_list.bin";
    loadTestEditorWorkspace.mockResolvedValue({ document: { assetRoutes: {} } });
    resolveWorkspaceContent.mockResolvedValue({
      existing: { filePath: stageListPath },
      configured: { filePath: stageListPath },
    });
    resolveWorkspaceRouteRoot.mockResolvedValue("E:\\XB\\mod\\001stage");

    const workspace = await resolveMapWorkspace("E:\\XB\\mod\\");

    expect(workspace).toEqual({
      workspaceRoot: "E:\\XB\\mod",
      stageListPath,
      libraryRoot: "E:\\XB\\mod\\001stage",
    });
    expect(resolveWorkspaceContent).toHaveBeenCalledWith(
      "E:\\XB\\mod",
      { assetRoutes: {} },
      "stage-list",
    );
    expect(resolveWorkspaceRouteRoot).toHaveBeenCalledWith(
      "E:\\XB\\mod",
      { assetRoutes: {} },
      "stage.model",
    );
  });

  it("honours a workspace that remapped its stage routes", async () => {
    loadTestEditorWorkspace.mockResolvedValue({ document: { assetRoutes: {} } });
    resolveWorkspaceContent.mockResolvedValue({
      existing: null,
      configured: { filePath: "D:\\ws\\lists\\stage_list\\stage_list.bin" },
    });
    resolveWorkspaceRouteRoot.mockResolvedValue("D:\\ws\\stages");

    const workspace = await resolveMapWorkspace("D:\\ws");

    expect(workspace.stageListPath).toBe("D:\\ws\\lists\\stage_list\\stage_list.bin");
    expect(workspace.libraryRoot).toBe("D:\\ws\\stages");
  });

  it("names the workspace folder when it is not open", async () => {
    await expect(resolveMapWorkspace("   ")).rejects.toThrow(/Workspace folder is not open/);
    expect(loadTestEditorWorkspace).not.toHaveBeenCalled();
  });
});

describe("buildMapLibraryRows", () => {
  it("resolves the pack path and the extracted folder for each stage row", async () => {
    readDir.mockImplementation(async (path: string) =>
      path.endsWith("dplcache")
        ? [{ name: "0x4D1F5138.fhm2d" }]
        : [{ name: "201stage201" }],
    );
    exists.mockResolvedValue(true);

    const rows = await buildMapLibraryRows({
      entries: [stageEntry({})],
      dplCacheDir: "E:\\OB\\dplcache",
      libraryRoot: "E:\\XB\\mod\\001stage",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      stageName: "サイド7",
      mapHash: 0xfe67f4f9,
      packHash: 0x4d1f5138,
      packHashName: "0x4D1F5138",
      packFolderName: "201stage201",
      packSourcePath: "E:\\OB\\dplcache\\0x4D1F5138.fhm2d",
      packAvailable: true,
      extractedPath: "E:\\XB\\mod\\001stage\\201stage201",
      extracted: true,
    });
  });

  it("reports a pack the dplcache does not hold rather than offering to extract it", async () => {
    readDir.mockImplementation(async (path: string) =>
      path.endsWith("dplcache") ? [{ name: "0xDEADBEEF.fhm2d" }] : [],
    );
    exists.mockResolvedValue(true);

    const rows = await buildMapLibraryRows({
      entries: [stageEntry({})],
      dplCacheDir: "E:\\OB\\dplcache",
      libraryRoot: "E:\\XB\\mod\\001stage",
    });

    expect(rows[0].packAvailable).toBe(false);
    expect(rows[0].extracted).toBe(false);
  });

  it("treats a library root that has never been written to as empty", async () => {
    readDir.mockImplementation(async () => [{ name: "0x4D1F5138.fhm2d" }]);
    exists.mockResolvedValue(false);

    const rows = await buildMapLibraryRows({
      entries: [stageEntry({})],
      dplCacheDir: "E:\\OB\\dplcache",
      libraryRoot: "E:\\XB\\mod\\001stage",
    });

    expect(rows[0].extracted).toBe(false);
    expect(rows[0].packAvailable).toBe(true);
  });

  it("refuses an unconfigured dplcache path", async () => {
    await expect(
      buildMapLibraryRows({
        entries: [stageEntry({})],
        dplCacheDir: "  ",
        libraryRoot: "E:\\XB\\mod\\001stage",
      }),
    ).rejects.toThrow(/not configured/);
  });
});

describe("findRowByMapHash", () => {
  it("matches a mission script's sys_0(0x40e) hash against entryId", async () => {
    readDir.mockImplementation(async () => [{ name: "0x4d1f5138.fhm2d" }]);
    exists.mockResolvedValue(false);

    const rows = await buildMapLibraryRows({
      entries: [stageEntry({ entryId: 0x04620c93, recordLookupId: 0x21, name: "ニュー・ホンコン" }), stageEntry({})],
      dplCacheDir: "E:\\OB\\dplcache",
      libraryRoot: "E:\\XB\\mod\\001stage",
    });

    expect(findRowByMapHash(rows, 0xfe67f4f9)?.stageName).toBe("サイド7");
    expect(findRowByMapHash(rows, 0x04620c93)?.stageName).toBe("ニュー・ホンコン");
    expect(findRowByMapHash(rows, 0x12345678)).toBeNull();
  });
});
