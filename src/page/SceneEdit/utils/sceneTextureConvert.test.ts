import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  copyFile: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  appLocalDataDir: vi.fn(() => Promise.resolve("C:/AppData/Local/app")),
  dirname: vi.fn(() => Promise.resolve("C:/AppData/Local/app/__convert")),
  join: vi.fn((...parts: string[]) => parts.join("/")),
}));

import { invoke } from "@tauri-apps/api/core";
import { copyFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { applySceneTextureReplace, ddsFormatToRust, replaceNutexbInPlace } from "./sceneTextureConvert";

const mockInvoke = vi.mocked(invoke);
const mockCopyFile = vi.mocked(copyFile);
const mockExists = vi.mocked(exists);
const mockMkdir = vi.mocked(mkdir);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ddsFormatToRust", () => {
  it("passes through rust DDS format strings unchanged", () => {
    expect(ddsFormatToRust("BC7RgbaUnormSrgb")).toBe("BC7RgbaUnormSrgb");
    expect(ddsFormatToRust("Rgba8Unorm")).toBe("Rgba8Unorm");
    expect(ddsFormatToRust("BC6hRgbUfloat")).toBe("BC6hRgbUfloat");
  });
});

describe("replaceNutexbInPlace", () => {
  it("copies a selected nutexb over the target path", async () => {
    await expect(
      replaceNutexbInPlace({
        sourcePath: "D:/incoming/fog_lut.nutexb",
        targetNutexbPath: "D:/stage/info/fog/fog_lut.nutexb",
        ddsFormat: "BC7RgbaUnormSrgb",
      }),
    ).resolves.toBeNull();

    expect(mockCopyFile).toHaveBeenCalledWith(
      "D:/incoming/fog_lut.nutexb",
      "D:/stage/info/fog/fog_lut.nutexb",
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("converts an image directly into the target nutexb path", async () => {
    mockExists.mockResolvedValue(false);
    mockInvoke.mockResolvedValue({
      outputNutexbPath: "D:/stage/info/light/light_map.nutexb",
      previewPngPath: "C:/AppData/Local/app/preview.png",
      nutexbName: "light_map",
    });

    await replaceNutexbInPlace({
      sourcePath: "D:/incoming/light_map.png",
      targetNutexbPath: "D:/stage/info/light/light_map.nutexb",
      ddsFormat: "BC7RgbaUnormSrgb",
    });

    expect(mockMkdir).toHaveBeenCalledWith("C:/AppData/Local/app/scene_texture_convert", {
      recursive: true,
    });
    expect(mockInvoke).toHaveBeenCalledWith("card_icon_replace_from_png_with_dds_format", {
      nutexbPath: "D:/stage/info/light/light_map.nutexb",
      convertDir: "C:/AppData/Local/app/scene_texture_convert",
      pngPath: "D:/incoming/light_map.png",
      ddsFormat: "BC7RgbaUnormSrgb",
    });
  });
});

describe("applySceneTextureReplace", () => {
  it("overwrites an existing stage nutexb instead of a convert-dir copy", async () => {
    mockExists.mockResolvedValue(true);
    mockInvoke.mockResolvedValue({
      outputNutexbPath: "E:/stage/0/0/textures/map.nutexb",
      previewPngPath: "C:/AppData/Local/app/scene_texture_convert/map.png",
      nutexbName: "map",
    });

    await expect(
      applySceneTextureReplace({
        targetNutexbPath: "E:/stage/0/0/textures/map.nutexb",
        sourcePath: "D:/incoming/map.png",
        ddsFormat: "BC3RgbaUnormSrgb",
      }),
    ).resolves.toEqual({
      nutexbPath: "E:/stage/0/0/textures/map.nutexb",
      wroteInPlace: true,
    });

    expect(mockInvoke).toHaveBeenCalledWith("card_icon_replace_from_png_with_dds_format", {
      nutexbPath: "E:/stage/0/0/textures/map.nutexb",
      convertDir: "C:/AppData/Local/app/scene_texture_convert",
      pngPath: "D:/incoming/map.png",
      ddsFormat: "BC3RgbaUnormSrgb",
    });
  });

  it("copies a replacement nutexb onto the existing stage file", async () => {
    await expect(
      applySceneTextureReplace({
        targetNutexbPath: "E:/stage/0/0/textures/map.nutexb",
        sourcePath: "D:/incoming/map.nutexb",
        ddsFormat: "BC7RgbaUnormSrgb",
      }),
    ).resolves.toEqual({
      nutexbPath: "E:/stage/0/0/textures/map.nutexb",
      wroteInPlace: true,
    });

    expect(mockCopyFile).toHaveBeenCalledWith(
      "D:/incoming/map.nutexb",
      "E:/stage/0/0/textures/map.nutexb",
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("keeps a not-yet-saved image in the convert dir", async () => {
    mockExists.mockResolvedValue(false);
    mockInvoke.mockResolvedValue({
      outputNutexbPath: "C:/AppData/Local/app/scene_texture_convert/new.nutexb",
      previewPngPath: "C:/AppData/Local/app/scene_texture_convert/new.png",
      nutexbName: "new",
    });

    await expect(
      applySceneTextureReplace({
        targetNutexbPath: null,
        sourcePath: "D:/incoming/new.png",
        ddsFormat: "BC3RgbaUnormSrgb",
      }),
    ).resolves.toEqual({
      nutexbPath: "C:/AppData/Local/app/scene_texture_convert/new.nutexb",
      wroteInPlace: false,
    });
  });
});
