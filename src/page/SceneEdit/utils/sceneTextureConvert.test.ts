import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  appLocalDataDir: vi.fn(() => Promise.resolve("C:/AppData/Local/app")),
}));

import { ddsFormatToRust } from "./sceneTextureConvert";
import type { DdsFormat } from "../components/TextureFormatSelect";

describe("ddsFormatToRust", () => {
  const cases: [DdsFormat, string][] = [
    ["BC7_UNORM", "BC7RgbaUnorm"],
    ["BC7_UNORM_SRGB", "BC7RgbaUnormSrgb"],
    ["BC5_UNORM", "BC5RgUnorm"],
    ["BC4_UNORM", "BC4RUnorm"],
    ["BC1_UNORM", "BC1RgbaUnorm"],
    ["BC3_UNORM", "BC3RgbaUnorm"],
  ];

  it.each(cases)("maps %s to %s", (input, expected) => {
    expect(ddsFormatToRust(input)).toBe(expected);
  });
});
