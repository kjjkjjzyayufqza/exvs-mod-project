import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import { getAssetRefInfo, getCharacterAssetRouteId } from "./assetRef";

const { existsMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.filter(Boolean).join("/")),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
  readDir: vi.fn(),
}));

describe("character asset routes", () => {
  beforeEach(() => {
    existsMock.mockImplementation(async (path: string) => path.startsWith("E:/workspace/"));
  });

  it.each([
    ["Model", "unit.model", "002chara"],
    ["Effect", "unit.effect", "006effect"],
    ["Sound", "unit.sound", "090sound"],
    ["Param", "unit.param", "041cpm"],
    ["Msc", "unit.msc", "040msc"],
    ["Motion", "unit.motion", "003motion"],
  ])("maps %s to %s", async (fieldKey, routeId, prefix) => {
    expect(getCharacterAssetRouteId(fieldKey)).toBe(routeId);

    const ref = await getAssetRefInfo({
      fieldKey,
      value: -1111592982,
      obDplCachePath: "E:/OB/dplcache",
      obModPath: "E:/OB/mod",
      workspaceRoot: "E:/workspace",
      workspaceDocument: DEFAULT_TEST_EDITOR_WORKSPACE,
    });

    expect(ref.routeId).toBe(routeId);
    expect(ref.workspacePack.configured.prefix).toBe(prefix);
    expect(ref.workspacePack.configured.folderPath).toBe(
      `E:/workspace/${prefix}/0xBDBE6FEA`,
    );
    expect(ref.workspacePack.configured.structureJsonPath).toBe(
      `E:/workspace/${prefix}/0xBDBE6FEA_structure.json`,
    );
  });
});
