import { describe, expect, it, vi } from "vitest";

import {
  resolveMscWorkspaceFolderPathForSelection,
  shouldAutoActivateMscWorkspaceTab,
} from "./mscWorkspaceUtils";

describe("resolveMscWorkspaceFolderPathForSelection", () => {
  it("uses the selected MSC pack folder when it contains script files", async () => {
    const contains = vi.fn(async (path: string) => path === "E:/workspace/040msc/0xFEEA714A");

    await expect(
      resolveMscWorkspaceFolderPathForSelection({
        currentDir: "E:/workspace",
        selectedNode: {
          path: "E:/workspace/040msc/0xFEEA714A",
          isDir: true,
        },
        dirnameOfFile: vi.fn(),
        containsMscScriptFiles: contains,
      }),
    ).resolves.toBe("E:/workspace/040msc/0xFEEA714A");
  });

  it("falls back to the current folder when the opened TestEditor root is an MSC pack", async () => {
    const contains = vi.fn(async (path: string) => path === "E:/workspace/040msc/0xFEEA714A");

    await expect(
      resolveMscWorkspaceFolderPathForSelection({
        currentDir: "E:/workspace/040msc/0xFEEA714A",
        selectedNode: null,
        dirnameOfFile: vi.fn(),
        containsMscScriptFiles: contains,
      }),
    ).resolves.toBe("E:/workspace/040msc/0xFEEA714A");
  });

  it("checks the parent folder for selected MSC script files", async () => {
    const dirnameOfFile = vi.fn(async () => "E:/workspace/040msc/0xFEEA714A");
    const contains = vi.fn(async (path: string) => path === "E:/workspace/040msc/0xFEEA714A");

    await expect(
      resolveMscWorkspaceFolderPathForSelection({
        currentDir: "E:/workspace",
        selectedNode: {
          path: "E:/workspace/040msc/0xFEEA714A/0.bscex",
          isDir: false,
        },
        dirnameOfFile,
        containsMscScriptFiles: contains,
      }),
    ).resolves.toBe("E:/workspace/040msc/0xFEEA714A");

    expect(dirnameOfFile).toHaveBeenCalledWith("E:/workspace/040msc/0xFEEA714A/0.bscex");
  });
});

describe("shouldAutoActivateMscWorkspaceTab", () => {
  it("activates the MSC tab when a new MSC folder is found from the default structure tab", () => {
    expect(
      shouldAutoActivateMscWorkspaceTab({
        activeTab: "folder-structure",
        mscWorkspaceFolderPath: "E:/workspace/040msc/0xFEEA714A",
        lastAutoActivatedFolderPath: null,
      }),
    ).toBe(true);
  });

  it("does not hijack another active tool tab", () => {
    expect(
      shouldAutoActivateMscWorkspaceTab({
        activeTab: "param-editor",
        mscWorkspaceFolderPath: "E:/workspace/040msc/0xFEEA714A",
        lastAutoActivatedFolderPath: null,
      }),
    ).toBe(false);
  });
});
