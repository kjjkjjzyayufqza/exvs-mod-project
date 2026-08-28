import { describe, expect, it, vi } from "vitest";

import {
  getMscConvertLogPath,
  getMscConvertOutputPath,
  getMscRepackOutputPath,
  isMscFolderMarkerFile,
  resolveMscWorkspaceFolderPathForSelection,
  shouldAutoActivateMscWorkspaceTab,
} from "./mscWorkspaceUtils";

describe("unit MSC pack slots", () => {
  const folder = "E:/workspace/040msc/0x605245CC";

  it("converts 0/1/2 scripts to sibling .c and .txt", () => {
    expect(getMscConvertOutputPath(`${folder}/0.bscex`)).toBe(`${folder}/0.c`);
    expect(getMscConvertLogPath(`${folder}/0.bscex`)).toBe(`${folder}/0.txt`);
    expect(getMscConvertOutputPath(`${folder}/1.cscex`)).toBe(`${folder}/1.c`);
    expect(getMscConvertLogPath(`${folder}/1.cscex`)).toBe(`${folder}/1.txt`);
    expect(getMscConvertOutputPath(`${folder}/2.dscex`)).toBe(`${folder}/2.c`);
    expect(getMscConvertLogPath(`${folder}/2.dscex`)).toBe(`${folder}/2.txt`);
  });

  it("repacks 0.c/1.c/2.c back onto the Unit MSC script extensions", () => {
    expect(getMscRepackOutputPath(`${folder}/0.c`)).toBe(`${folder}/0.bscex`);
    expect(getMscRepackOutputPath(`${folder}/1.c`)).toBe(`${folder}/1.cscex`);
    expect(getMscRepackOutputPath(`${folder}/2.c`)).toBe(`${folder}/2.dscex`);
  });

  it("rejects helper C files that are not pack-root slots", () => {
    expect(() => getMscRepackOutputPath(`${folder}/func_143.c`)).toThrow(
      "unsupported repack file name",
    );
  });
});

describe("traditional MSC paths", () => {
  it("accepts arbitrary bin names and creates same-basename sidecars", () => {
    const source = "E:/workspace/0x67AF23FA/000triad_battle_b004_001_r2.bin";

    expect(isMscFolderMarkerFile("000triad_battle_b004_001_r2.bin", "traditional")).toBe(true);
    expect(getMscConvertOutputPath(source, "traditional")).toBe(
      "E:/workspace/0x67AF23FA/000triad_battle_b004_001_r2.c",
    );
    expect(getMscConvertLogPath(source, "traditional")).toBe(
      "E:/workspace/0x67AF23FA/000triad_battle_b004_001_r2.txt",
    );
  });

  it("repacks any C file to a same-basename bin", () => {
    expect(getMscRepackOutputPath("E:/workspace/side7_battle.c", "traditional")).toBe(
      "E:/workspace/side7_battle.bin",
    );
  });
});

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
