import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  appLocalDataDir: vi.fn(() => Promise.resolve("C:/AppData/Local/app")),
  dirname: vi.fn(() => Promise.resolve("C:/AppData/Local/app/__convert")),
  join: vi.fn((...parts: string[]) => parts.join("/")),
}));

import { ddsFormatToRust } from "./sceneTextureConvert";

describe("ddsFormatToRust", () => {
  it("passes through rust DDS format strings unchanged", () => {
    expect(ddsFormatToRust("BC7RgbaUnormSrgb")).toBe("BC7RgbaUnormSrgb");
    expect(ddsFormatToRust("Rgba8Unorm")).toBe("Rgba8Unorm");
    expect(ddsFormatToRust("BC6hRgbUfloat")).toBe("BC6hRgbUfloat");
  });
});
