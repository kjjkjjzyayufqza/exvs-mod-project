import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFhm2dPackStem, removeMatchingModVgsht2 } from "./modVgsht2";

const { existsMock, readDirMock, removeMock, joinMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
  readDirMock: vi.fn(),
  removeMock: vi.fn(),
  joinMock: vi.fn(async (...parts: string[]) => parts.filter(Boolean).join("/")),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: joinMock,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: existsMock,
  readDir: readDirMock,
  remove: removeMock,
}));

describe("getFhm2dPackStem", () => {
  it("strips path and .fhm2d extension", () => {
    expect(getFhm2dPackStem("E:\\mod\\0x49235031.fhm2d")).toBe("0x49235031");
    expect(getFhm2dPackStem("0x49235031.fhm2d")).toBe("0x49235031");
    expect(getFhm2dPackStem("0x49235031")).toBe("0x49235031");
    expect(getFhm2dPackStem("Gyan_model")).toBe("Gyan_model");
  });
});

describe("removeMatchingModVgsht2", () => {
  beforeEach(() => {
    existsMock.mockReset();
    readDirMock.mockReset();
    removeMock.mockReset();
    joinMock.mockImplementation(async (...parts: string[]) => parts.filter(Boolean).join("/"));
    existsMock.mockResolvedValue(false);
    readDirMock.mockResolvedValue([]);
    removeMock.mockResolvedValue(undefined);
  });

  it("removes via direct path using output fhm2d stem (HashName)", async () => {
    existsMock.mockResolvedValueOnce(true);

    const removed = await removeMatchingModVgsht2(
      "E:/mod",
      "E:/mod/0x49235031.fhm2d",
    );

    expect(removed).toBe(true);
    expect(joinMock).toHaveBeenCalledWith("E:/mod", "0x49235031.vgsht2");
    expect(removeMock).toHaveBeenCalledWith("E:/mod/0x49235031.vgsht2");
    expect(readDirMock).not.toHaveBeenCalled();
  });

  it("falls back to case-insensitive scan when direct path misses", async () => {
    existsMock.mockResolvedValue(false);
    readDirMock.mockResolvedValue([
      { name: "0x49235031.VGSHT2", isDirectory: false },
      { name: "other.fhm2d", isDirectory: false },
    ]);

    const removed = await removeMatchingModVgsht2("E:/mod", "0x49235031");

    expect(removed).toBe(true);
    expect(removeMock).toHaveBeenCalledWith("E:/mod/0x49235031.VGSHT2");
  });

  it("still matches when isFile is unset (only isDirectory false)", async () => {
    existsMock.mockResolvedValue(false);
    readDirMock.mockResolvedValue([{ name: "0xABCDEF01.vgsht2" }]);

    const removed = await removeMatchingModVgsht2("E:/mod", "0xABCDEF01.fhm2d");
    expect(removed).toBe(true);
  });

  it("returns false when no matching vgsht2 exists", async () => {
    existsMock.mockResolvedValue(false);
    readDirMock.mockResolvedValue([{ name: "0x11111111.vgsht2", isDirectory: false }]);

    await expect(removeMatchingModVgsht2("E:/mod", "0x22222222")).resolves.toBe(false);
    expect(removeMock).not.toHaveBeenCalled();
  });
});
