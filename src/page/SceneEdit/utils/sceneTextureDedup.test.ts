import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join("/"))),
}));

import { readDir, readFile, rename } from "@tauri-apps/plugin-fs";
import { compareNutexbContent, deduplicateTextureFolder } from "./sceneTextureDedup";

const mockReadDir = vi.mocked(readDir);
const mockReadFile = vi.mocked(readFile);
const mockRename = vi.mocked(rename);

function makeEntry(name: string, isDir = false) {
  return { name, isDirectory: isDir, isFile: !isDir, isSymlink: false };
}

describe("sceneTextureDedup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("compareNutexbContent", () => {
    it("returns true for identical content", async () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      mockReadFile.mockResolvedValueOnce(data).mockResolvedValueOnce(data);
      expect(await compareNutexbContent("a.nutexb", "b.nutexb")).toBe(true);
    });

    it("returns false for different content", async () => {
      mockReadFile
        .mockResolvedValueOnce(new Uint8Array([1, 2, 3]))
        .mockResolvedValueOnce(new Uint8Array([1, 2, 4]));
      expect(await compareNutexbContent("a.nutexb", "b.nutexb")).toBe(false);
    });

    it("returns false for different lengths", async () => {
      mockReadFile
        .mockResolvedValueOnce(new Uint8Array([1, 2]))
        .mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
      expect(await compareNutexbContent("a.nutexb", "b.nutexb")).toBe(false);
    });
  });

  describe("deduplicateTextureFolder", () => {
    it("keeps unique filenames unchanged", async () => {
      mockReadDir.mockResolvedValueOnce([
        makeEntry("diffuse.nutexb"),
        makeEntry("normal.nutexb"),
      ]);
      const result = await deduplicateTextureFolder("E:/stage/textures");
      expect(result.kept).toEqual(["diffuse.nutexb", "normal.nutexb"]);
      expect(result.duplicatesRemoved).toBe(0);
      expect(result.conflicts).toEqual([]);
    });

    it("handles empty folder", async () => {
      mockReadDir.mockResolvedValueOnce([]);
      const result = await deduplicateTextureFolder("E:/stage/textures");
      expect(result.kept).toEqual([]);
      expect(result.duplicatesRemoved).toBe(0);
    });

    it("handles non-existent folder", async () => {
      mockReadDir.mockRejectedValueOnce(new Error("Not found"));
      const result = await deduplicateTextureFolder("E:/stage/textures");
      expect(result.kept).toEqual([]);
    });

    it("ignores non-nutexb files", async () => {
      mockReadDir.mockResolvedValueOnce([
        makeEntry("readme.txt"),
        makeEntry("diffuse.nutexb"),
      ]);
      const result = await deduplicateTextureFolder("E:/stage/textures");
      expect(result.kept).toEqual(["diffuse.nutexb"]);
    });
  });
});
