import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import { probeResourcePaths } from "./probeResourcePaths";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";

const { existsMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts: string[]) => parts.filter(Boolean).join("/")),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
}));

describe("probeResourcePaths", () => {
  beforeEach(() => {
    existsMock.mockReset();
  });

  it("uses the workspace document route prefix for unit assets", async () => {
    const workspaceDocument: TestEditorWorkspaceDocument = {
      ...DEFAULT_TEST_EDITOR_WORKSPACE,
      legacyReadFallback: false,
      assetRoutes: {
        ...DEFAULT_TEST_EDITOR_WORKSPACE.assetRoutes,
        "unit.model": {
          ...DEFAULT_TEST_EDITOR_WORKSPACE.assetRoutes["unit.model"],
          prefix: "custom-chara",
        },
      },
    };
    existsMock.mockImplementation(async (path: string) =>
      path === "E:/workspace/custom-chara/0xBDBE6FEA" ||
      path === "E:/workspace/custom-chara/0xBDBE6FEA_structure.json",
    );

    const probe = await probeResourcePaths({
      category: "unit",
      slot: "model",
      hashInt32: -1111592982,
      obDplCachePath: "E:/OB/dplcache",
      obModPath: "E:/OB/mod",
      workspacePath: "E:/workspace",
      workspaceDocument,
    });

    expect(probe.workspaceExists).toBe(true);
    expect(existsMock).toHaveBeenCalledWith("E:/workspace/custom-chara/0xBDBE6FEA");
    expect(existsMock).not.toHaveBeenCalledWith("E:/workspace/0xBDBE6FEA");
  });
});
