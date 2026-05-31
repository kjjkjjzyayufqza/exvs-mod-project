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
    });
  });

  describe("listStageTextureFilePaths", () => {
    it("skips virtual memory stage roots", async () => {
      await expect(listStageTextureFilePaths("memory://stage")).resolves.toEqual([]);
      expect(mockExists).not.toHaveBeenCalled();
      expect(mockReadDir).not.toHaveBeenCalled();
    });

    it("returns every nutexb file under the shared textures folder", async () => {
      mockExists.mockResolvedValueOnce(true);
      mockReadDir.mockResolvedValueOnce([
        makeDirEntry("stage_wall_alb.nutexb"),
        makeDirEntry("unused_clouds.nutexb"),
        makeDirEntry("preview.png"),
        makeDirEntry("nested", true),
      ] as Awaited<ReturnType<typeof readDir>>);

      await expect(listStageTextureFilePaths("E:/stage")).resolves.toEqual([
        "E:/stage/textures/stage_wall_alb.nutexb",
        "E:/stage/textures/unused_clouds.nutexb",
      ]);
    });
  });
});
