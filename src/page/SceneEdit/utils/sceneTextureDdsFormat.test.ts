import { describe, expect, it } from "vitest";
import {
  rustDdsFormatToSceneFormat,
  sceneFormatFromEntryFormat,
  sceneFormatMatchesRust,
} from "./sceneTextureDdsFormat";

describe("rustDdsFormatToSceneFormat", () => {
  it("maps BC7RgbaUnorm to BC7_UNORM", () => {
    expect(rustDdsFormatToSceneFormat("BC7RgbaUnorm")).toBe("BC7_UNORM");
  });

  it("maps BC5RgUnorm to BC5_UNORM", () => {
    expect(rustDdsFormatToSceneFormat("BC5RgUnorm")).toBe("BC5_UNORM");
  });

  it("returns null for unknown formats", () => {
    expect(rustDdsFormatToSceneFormat("Rgba8Unorm")).toBeNull();
  });
});

describe("sceneFormatFromEntryFormat", () => {
  it("accepts scene DdsFormat strings", () => {
    expect(sceneFormatFromEntryFormat("BC7_UNORM_SRGB")).toBe("BC7_UNORM_SRGB");
  });
});

describe("sceneFormatMatchesRust", () => {
  it("compares via ddsFormatToRust", () => {
    expect(sceneFormatMatchesRust("BC7_UNORM", "BC7RgbaUnorm")).toBe(true);
    expect(sceneFormatMatchesRust("BC5_UNORM", "BC7RgbaUnorm")).toBe(false);
  });
});
