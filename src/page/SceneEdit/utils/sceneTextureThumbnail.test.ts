import { describe, expect, it } from "vitest";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";
import {
  extractRgbaFromTextureData,
  lookupSceneTextureData,
} from "./sceneTextureThumbnail";

describe("sceneTextureThumbnail", () => {
  it("lookupSceneTextureData matches exact and normalized keys", () => {
    const map: NutexbTextureDataMap = new Map([
      [
        "D:/stage/textures/Wall.nutexb",
        { kind: "rgba", width: 128, height: 64, rgba: new Uint8Array(128 * 64 * 4) },
      ],
      [
        "d:/stage/textures/wall.nutexb",
        { kind: "rgba", width: 128, height: 64, rgba: new Uint8Array(128 * 64 * 4) },
      ],
    ]);

    expect(lookupSceneTextureData(map, "D:/stage/textures/Wall.nutexb")?.width).toBe(128);
    expect(lookupSceneTextureData(map, "d:/stage/textures/wall.nutexb")?.width).toBe(128);
  });

  it("extractRgbaFromTextureData reads rgba and compressed rgba fallback", () => {
    const rgba = new Uint8Array(16);
    expect(
      extractRgbaFromTextureData({
        kind: "rgba",
        width: 2,
        height: 2,
        rgba,
      }),
    ).toEqual({ width: 2, height: 2, rgba });

    expect(
      extractRgbaFromTextureData({
        kind: "compressed",
        width: 2,
        height: 2,
        formatId: 0,
        data: rgba,
      }),
    ).toEqual({ width: 2, height: 2, rgba });

    expect(
      extractRgbaFromTextureData({
        kind: "compressed",
        width: 2,
        height: 2,
        formatId: 7,
        data: rgba,
      }),
    ).toBeNull();
  });
});
