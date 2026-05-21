import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(),
  exists: vi.fn(),
  copyFile: vi.fn(),
  remove: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join("/"))),
}));

import { readDir, exists } from "@tauri-apps/plugin-fs";
import { detectOldTextureFormat, migrateTexturesToSharedFolder } from "./sceneTextureMigration";

const mockReadDir = vi.mocked(readDir);
const mockExists = vi.mocked(exists);

function makeEntry(name: string, isDir = false) {
  return { name, isDirectory: isDir, isFile: !isDir, isSymlink: false };
}

describe("sceneTextureMigration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("detectOldTextureFormat", () => {
    it("detects old format when numbered subdir has nutexb", async () => {
      mockReadDir
        .mockResolvedValueOnce([makeEntry("box01", true), makeEntry("info", true)])
        .mockResolvedValueOnce([makeEntry("0", true)])
        .mockResolvedValueOnce([
          makeEntry("0", true),
          makeEntry("model.numdlb"),
        ])
        .mockResolvedValueOnce([makeEntry("diffuse.nutexb")]);

      expect(await detectOldTextureFormat("E:/stage")).toBe(true);
    });

    it("returns false when no numbered subdirs have nutexb", async () => {
      mockReadDir
        .mockResolvedValueOnce([makeEntry("box01", true)])
        .mockResolvedValueOnce([makeEntry("0", true)])
        .mockResolvedValueOnce([makeEntry("model.numdlb")]);

      expect(await detectOldTextureFormat("E:/stage")).toBe(false);
    });

    it("skips reserved folders", async () => {
      mockReadDir.mockResolvedValueOnce([
        makeEntry("base", true),
        makeEntry("info", true),
        makeEntry("textures", true),
      ]);

      expect(await detectOldTextureFormat("E:/stage")).toBe(false);
      expect(mockReadDir).toHaveBeenCalledTimes(1);
    });
  });

  describe("migrateTexturesToSharedFolder", () => {
    it("creates textures dir and migrates nutexb files", async () => {
      mockExists.mockResolvedValueOnce(false);
      mockReadDir
        .mockResolvedValueOnce([makeEntry("box01", true)])
        .mockResolvedValueOnce([makeEntry("0", true)])
        .mockResolvedValueOnce([makeEntry("0", true), makeEntry("model.numdlb")])
        .mockResolvedValueOnce([makeEntry("diffuse.nutexb")])
        .mockResolvedValueOnce([makeEntry("0", true)])
        .mockResolvedValueOnce([makeEntry("0", true), makeEntry("model.numdlb")])
        .mockResolvedValueOnce([makeEntry("diffuse.nutexb")]);

      const result = await migrateTexturesToSharedFolder("E:/stage");
      expect(result.migratedCount).toBe(1);
    });

    it("returns zero counts for stage with no model folders", async () => {
      mockExists.mockResolvedValueOnce(true);
      mockReadDir
        .mockResolvedValueOnce([makeEntry("info", true), makeEntry("textures", true)])
        .mockResolvedValueOnce([]);

      const result = await migrateTexturesToSharedFolder("E:/stage");
      expect(result.migratedCount).toBe(0);
      expect(result.deduplicatedCount).toBe(0);
      expect(result.conflicts).toEqual([]);
    });
  });
});
