import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(),
  remove: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join("/"))),
}));

import { readDir, remove, stat } from "@tauri-apps/plugin-fs";
import { buildDeletePreview, executeDelete } from "./sceneDeleteConfirm";

const mockReadDir = vi.mocked(readDir);
const mockRemove = vi.mocked(remove);
const mockStat = vi.mocked(stat);

describe("sceneDeleteConfirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildDeletePreview", () => {
    it("returns correct file list for a single folder", async () => {
      mockReadDir.mockResolvedValueOnce([
        { name: "model.numdlb", isDirectory: false, isFile: true, isSymlink: false },
        { name: "model.numshb", isDirectory: false, isFile: true, isSymlink: false },
      ]);
      mockStat
        .mockResolvedValueOnce({ size: 1024 } as any)
        .mockResolvedValueOnce({ size: 2048 } as any);

      const result = await buildDeletePreview("E:/stage", ["box01"]);
      expect(result.previews).toHaveLength(1);
      expect(result.previews[0].folderName).toBe("box01");
      expect(result.previews[0].files).toEqual(["model.numdlb", "model.numshb"]);
      expect(result.previews[0].totalSizeBytes).toBe(3072);
      expect(result.totalFiles).toBe(2);
      expect(result.totalSizeBytes).toBe(3072);
    });

    it("calculates total size across multiple folders", async () => {
      mockReadDir
        .mockResolvedValueOnce([
          { name: "a.bin", isDirectory: false, isFile: true, isSymlink: false },
        ])
        .mockResolvedValueOnce([
          { name: "b.bin", isDirectory: false, isFile: true, isSymlink: false },
        ]);
      mockStat
        .mockResolvedValueOnce({ size: 100 } as any)
        .mockResolvedValueOnce({ size: 200 } as any);

      const result = await buildDeletePreview("E:/stage", ["folderA", "folderB"]);
      expect(result.previews).toHaveLength(2);
      expect(result.totalFiles).toBe(2);
      expect(result.totalSizeBytes).toBe(300);
    });

    it("handles empty folder gracefully", async () => {
      mockReadDir.mockResolvedValueOnce([]);
      const result = await buildDeletePreview("E:/stage", ["empty"]);
      expect(result.previews[0].files).toEqual([]);
      expect(result.previews[0].totalSizeBytes).toBe(0);
      expect(result.totalFiles).toBe(0);
    });

    it("handles non-existent folder without throwing", async () => {
      mockReadDir.mockRejectedValueOnce(new Error("Not found"));
      const result = await buildDeletePreview("E:/stage", ["missing"]);
      expect(result.previews).toHaveLength(1);
      expect(result.previews[0].files).toEqual([]);
      expect(result.previews[0].totalSizeBytes).toBe(0);
    });

    it("recurses into subdirectories", async () => {
      mockReadDir
        .mockResolvedValueOnce([
          { name: "0", isDirectory: true, isFile: false, isSymlink: false },
        ])
        .mockResolvedValueOnce([
          { name: "mesh.numdlb", isDirectory: false, isFile: true, isSymlink: false },
        ]);
      mockStat.mockResolvedValueOnce({ size: 500 } as any);

      const result = await buildDeletePreview("E:/stage", ["model01"]);
      expect(result.previews[0].files).toEqual(["mesh.numdlb"]);
      expect(result.previews[0].totalSizeBytes).toBe(500);
      expect(result.totalFiles).toBe(1);
    });
  });

  describe("executeDelete", () => {
    it("removes each folder recursively", async () => {
      mockRemove.mockResolvedValue(undefined);
      await executeDelete("E:/stage", ["box01", "box02"]);
      expect(mockRemove).toHaveBeenCalledTimes(2);
      expect(mockRemove).toHaveBeenCalledWith("E:/stage/box01", { recursive: true });
      expect(mockRemove).toHaveBeenCalledWith("E:/stage/box02", { recursive: true });
    });
  });
});
