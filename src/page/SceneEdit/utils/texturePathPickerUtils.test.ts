import { describe, expect, it } from "vitest";
import { recommendDdsFormat, textureBasename, isNutexbFile } from "./texturePathPickerUtils";

describe("texturePathPickerUtils", () => {
  describe("recommendDdsFormat", () => {
    it("recommends BC5 for normal maps", () => {
      expect(recommendDdsFormat("NormalMap")).toBe("BC5_UNORM");
      expect(recommendDdsFormat("normalMap")).toBe("BC5_UNORM");
    });

    it("recommends BC4 for roughness/metalness/AO", () => {
      expect(recommendDdsFormat("RoughnessMap")).toBe("BC4_UNORM");
      expect(recommendDdsFormat("MetalnessMap")).toBe("BC4_UNORM");
      expect(recommendDdsFormat("AmbientOcclusionMap")).toBe("BC4_UNORM");
    });

    it("recommends BC7_SRGB for diffuse/basecolor/emissive", () => {
      expect(recommendDdsFormat("DiffuseMap")).toBe("BC7_UNORM_SRGB");
      expect(recommendDdsFormat("BaseColorMap")).toBe("BC7_UNORM_SRGB");
      expect(recommendDdsFormat("EmissiveMap")).toBe("BC7_UNORM_SRGB");
    });

    it("defaults to BC7_UNORM for unknown params", () => {
      expect(recommendDdsFormat("UnknownParam")).toBe("BC7_UNORM");
      expect(recommendDdsFormat("Texture1")).toBe("BC7_UNORM");
    });
  });

  describe("textureBasename", () => {
    it("extracts basename from Windows paths", () => {
      expect(textureBasename("D:\\output\\gundamV\\diffuse.png")).toBe("diffuse.png");
      expect(textureBasename("C:\\Users\\test\\model_normal.nutexb")).toBe("model_normal.nutexb");
    });

    it("extracts basename from Unix paths", () => {
      expect(textureBasename("/home/user/textures/albedo.png")).toBe("albedo.png");
    });

    it("handles filenames without path", () => {
      expect(textureBasename("diffuse.png")).toBe("diffuse.png");
    });

    it("handles complex EXVS naming", () => {
      expect(textureBasename("D:\\output\\gundamV\\001gundam_001gundam_001_pbr1_diffuse.png")).toBe("001gundam_001gundam_001_pbr1_diffuse.png");
    });
  });

  describe("isNutexbFile", () => {
    it("returns true for .nutexb files", () => {
      expect(isNutexbFile("texture.nutexb")).toBe(true);
      expect(isNutexbFile("TEXTURE.NUTEXB")).toBe(true);
    });

    it("returns false for other extensions", () => {
      expect(isNutexbFile("texture.png")).toBe(false);
      expect(isNutexbFile("texture.dds")).toBe(false);
      expect(isNutexbFile("nutexb.txt")).toBe(false);
    });
  });
});
