import { describe, expect, it } from "vitest";
import {
  DEFAULT_DDS_FORMAT,
  formatMatchesDetected,
  normalizeDdsFormat,
  resolveDetectedDdsFormat,
} from "./sceneTextureDdsFormat";

describe("normalizeDdsFormat", () => {
  it("accepts rust DDS format strings", () => {
    expect(normalizeDdsFormat("BC7RgbaUnorm")).toBe("BC7RgbaUnorm");
    expect(normalizeDdsFormat("Rgba8Unorm")).toBe("Rgba8Unorm");
  });

  it("maps legacy scene format aliases", () => {
    expect(normalizeDdsFormat("BC7_UNORM")).toBe("BC7RgbaUnorm");
    expect(normalizeDdsFormat("BC7_UNORM_SRGB")).toBe("BC7RgbaUnormSrgb");
    expect(normalizeDdsFormat("BC5_UNORM")).toBe("BC5RgUnorm");
  });

  it("falls back to default for unknown values", () => {
    expect(normalizeDdsFormat("unknown")).toBe(DEFAULT_DDS_FORMAT);
  });
});

describe("resolveDetectedDdsFormat", () => {
  it("returns known rust formats", () => {
    expect(resolveDetectedDdsFormat("BC5RgUnorm")).toBe("BC5RgUnorm");
  });

  it("returns null for unsupported values", () => {
    expect(resolveDetectedDdsFormat("NotAFormat")).toBeNull();
  });
});

describe("formatMatchesDetected", () => {
  it("compares exact rust format strings", () => {
    expect(formatMatchesDetected("BC7RgbaUnorm", "BC7RgbaUnorm")).toBe(true);
    expect(formatMatchesDetected("BC5RgUnorm", "BC7RgbaUnorm")).toBe(false);
  });
});
