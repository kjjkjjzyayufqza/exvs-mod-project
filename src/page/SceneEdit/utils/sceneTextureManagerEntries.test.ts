import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(),
  readDir: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join("/"))),
}));

import { exists, readDir } from "@tauri-apps/plugin-fs";
import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";
import type { TextureManagerEntry } from "../store/sceneTextureManagerStore";
import {
  collectSceneTextureManagerEntries,
  listStageTextureFilePaths,
} from "./sceneTextureManagerEntries.ts";

const mockExists = vi.mocked(exists);
const mockReadDir = vi.mocked(readDir);

function makeBundle(overrides: Partial<SsbhModelPreviewBundle> = {}): SsbhModelPreviewBundle {
  return {
    rootFolder: "E:/stage/base",
    modlPath: "E:/stage/base/model.numdlb",
    meshPath: "E:/stage/base/model.numshb",
    skelPath: null,
    matlPaths: [],
    modl: {},
    mesh: {},
    skel: null,
    matl: null,
    matlProfiles: null,
    textureRefs: [],
    resolvedNutexbPaths: [],
    textureResolve: [],
    warnings: [],
    sourceKind: "disk",
    sourceSessionId: null,
    virtualModlPath: null,
    ...overrides,
  };
}

function makeDirEntry(name: string, isDirectory = false) {
  return {
    name,
    isDirectory,
    isFile: !isDirectory,
    isSymlink: false,
  };
}

describe("sceneTextureManagerEntries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("collectSceneTextureManagerEntries", () => {
    it("includes unreferenced textures from the shared textures folder", () => {
      const baseModel = makeBundle({
        resolvedNutexbPaths: ["E:/stage/textures/stage_wall_alb.nutexb"],
        textureResolve: [
          {
            reference: "stage_wall_alb",
            nutexbPath: "E:/stage/textures/stage_wall_alb.nutexb",
          },
        ],
      });

      const entries = collectSceneTextureManagerEntries(baseModel, [], [
        "E:/stage/textures/stage_wall_alb.nutexb",
        "E:/stage/textures/unused_clouds.nutexb",
      ]);

      expect(entries.map((entry: TextureManagerEntry) => entry.filename)).toEqual([
        "stage_wall_alb.nutexb",
        "unused_clouds.nutexb",
      ]);
      expect(entries[0]?.referencedBy).toEqual(["base"]);
      expect(entries[1]?.referencedBy).toEqual([]);
      expect(entries[0]?.scope).toBe("model");
      expect(entries[1]?.scope).toBe("model");
    });

    it("keeps info textures separate from model textures", () => {
      const entries = collectSceneTextureManagerEntries(null, [], [], [
        {
          path: "E:/stage/info/fog/fog_lut.nutexb",
          category: "fog",
        },
        {
          path: "E:/stage/info/light/light_map.nutexb",
          category: "light",
        },
      ]);

      expect(entries.map((entry: TextureManagerEntry) => ({
        filename: entry.filename,
        scope: entry.scope,
        infoCategory: entry.infoCategory,
      }))).toEqual([
        { filename: "fog_lut.nutexb", scope: "info", infoCategory: "fog" },
        { filename: "light_map.nutexb", scope: "info", infoCategory: "light" },
      ]);
    });
  });

  describe("listStageTextureFilePaths", () => {
    it("skips virtual memory stage roots", async () => {
      await expect(listStageTextureFilePaths("memory://stage")).resolves.toEqual({
        modelTexturePaths: [],
        infoTexturePaths: [],
      });
      expect(mockExists).not.toHaveBeenCalled();
      expect(mockReadDir).not.toHaveBeenCalled();
    });

    it("returns nutexb files under shared textures and info folders", async () => {
      mockExists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      mockReadDir
        .mockResolvedValueOnce([
        makeDirEntry("stage_wall_alb.nutexb"),
        makeDirEntry("unused_clouds.nutexb"),
        makeDirEntry("preview.png"),
        ] as Awaited<ReturnType<typeof readDir>>)
        .mockResolvedValueOnce([
          makeDirEntry("light_map.nutexb"),
          makeDirEntry("readme.txt"),
        ] as Awaited<ReturnType<typeof readDir>>)
        .mockResolvedValueOnce([
          makeDirEntry("bloom_lut.nutexb"),
        ] as Awaited<ReturnType<typeof readDir>>);

      await expect(listStageTextureFilePaths("E:/stage")).resolves.toEqual({
        modelTexturePaths: [
          "E:/stage/textures/stage_wall_alb.nutexb",
          "E:/stage/textures/unused_clouds.nutexb",
        ],
        infoTexturePaths: [
          { path: "E:/stage/info/light/light_map.nutexb", category: "light" },
          { path: "E:/stage/info/post_effect/bloom_lut.nutexb", category: "post_effect" },
        ],
      });
    });
  });
});
