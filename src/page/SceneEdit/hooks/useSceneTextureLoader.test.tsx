import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSceneTextureLoader } from "./useSceneTextureLoader";
import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";
import type { TexturePreviewSlotKey } from "@/components/ssbh-model-preview/meshFromSsbh";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getMemoryNutexbPreviewIdentity: vi.fn(),
  getOrDecodeNutexbRgba: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
}));

vi.mock("@/components/ssbh-model-preview/fhm2dMemoryPreviewService", () => ({
  getMemoryNutexbPreviewIdentity: mocks.getMemoryNutexbPreviewIdentity,
}));

vi.mock("@/components/ssbh-model-preview/nutexbPreviewCache", () => ({
  COMPRESSED_FORMAT_MAP: {},
  parseIdentityAndCompressedResponse: vi.fn(),
  getOrDecodeNutexbRgba: mocks.getOrDecodeNutexbRgba,
}));

const textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean> = {
  map: true,
  normalMap: true,
  roughnessMap: true,
  metalnessMap: true,
  emissiveMap: true,
  aoMap: true,
  cubeMap: true,
};

function makeImportedMemoryBundle(diskTexturePath: string): SsbhModelPreviewBundle {
  return {
    rootFolder: "memory://scene-session/imported",
    modlPath: "memory://scene-session/imported/0/imported.numdlb",
    meshPath: "memory://scene-session/imported/0/imported.numshb",
    skelPath: null,
    matlPaths: ["memory://scene-session/imported/0/imported__nust__.numatb"],
    modl: {
      entries: [
        {
          mesh_object_name: "mesh_a",
          mesh_object_subindex: 0,
          material_label: "mat_a",
        },
      ],
    },
    mesh: {
      major_version: 1,
      minor_version: 0,
      objects: [
        {
          name: "mesh_a",
          subindex: 0,
          parent_bone_name: "",
          vertex_indices: [0, 1, 2],
          positions: [{ name: "Position0", data: { Vector3: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }],
          normals: [{ name: "Normal0", data: { Vector3: [[0, 0, 1], [0, 0, 1], [0, 0, 1]] } }],
          texture_coordinates: [{ name: "map1", data: { Vector2: [[0, 0], [1, 0], [0, 1]] } }],
        },
      ],
      is_vs2: true,
    },
    skel: null,
    matl: {
      major_version: 1,
      minor_version: 0,
      entries: [
        {
          material_label: "mat_a",
          shader_label: "SFX_PBS_0000000008800100_opaque",
          textures: [{ param_id: "Texture0", data: "stage_wall_alb" }],
          samplers: [],
          floats: [],
          booleans: [],
          vectors: [],
          colors: [],
          rasterizer_states: [],
          blend_states: [],
        },
      ],
    },
    textureRefs: ["stage_wall_alb"],
    resolvedNutexbPaths: [diskTexturePath],
    textureResolve: [
      {
        reference: "stage_wall_alb",
        nutexbPath: diskTexturePath,
      },
    ],
    warnings: [],
    sourceKind: "memory",
    sourceSessionId: "scene-session",
    virtualModlPath: "memory://scene-session/imported/0/imported.numdlb",
  };
}

describe("useSceneTextureLoader", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.getMemoryNutexbPreviewIdentity.mockReset();
    mocks.getOrDecodeNutexbRgba.mockReset();
    mocks.invoke.mockImplementation((command: string, args?: { paths?: string[] }) => {
      if (command === "ensure_scene_nutexb_png_cache") {
        return Promise.resolve(
          (args?.paths ?? []).map((nutexbPath) => ({
            nutexbPath,
            pngPath: `${nutexbPath}.cache.png`,
            width: 1,
            height: 1,
            cacheHit: true,
            error: null,
          })),
        );
      }
      return Promise.reject(new Error(`unexpected command: ${command}`));
    });
    mocks.getOrDecodeNutexbRgba.mockImplementation(async (_versionId: string, decodeFn: () => Promise<unknown>) => {
      await decodeFn();
      return { width: 1, height: 1, rgba: new Uint8Array([255, 255, 255, 255]) };
    });
  });

  it("decodes disk-resolved nutexb paths from imported memory bundles through disk IPC", async () => {
    const diskTexturePath = "D:/stage/textures/stage_wall_alb.nutexb";
    const bundle = makeImportedMemoryBundle(diskTexturePath);
    const subModels: Parameters<typeof useSceneTextureLoader>[1] = [];
    const importedBundles = [bundle];
    const placementEntries: Parameters<typeof useSceneTextureLoader>[3] = [];
    const objectTextureLoadState = {};

    const { result } = renderHook(() =>
      useSceneTextureLoader(
        null,
        subModels,
        importedBundles,
        placementEntries,
        "scene-session",
        textureSlotLoadEnabled,
        objectTextureLoadState,
        true,
      ),
    );

    await waitFor(() => {
      expect(result.current.textureDataMap.get(diskTexturePath)?.width).toBe(1);
    });

    expect(result.current.textureDataMap.get(diskTexturePath)?.kind).toBe("png");
    expect(mocks.invoke).toHaveBeenCalledWith("ensure_scene_nutexb_png_cache", {
      paths: [diskTexturePath],
      force: false,
    });
    expect(mocks.invoke).not.toHaveBeenCalledWith("nutexb_rgba_bytes", expect.anything());
    expect(mocks.invoke).not.toHaveBeenCalledWith(
      "fhm2d_memory_nutexb_rgba_bytes",
      expect.anything(),
    );
    expect(mocks.getMemoryNutexbPreviewIdentity).not.toHaveBeenCalled();
  });

  it("still decodes disk sky textures when an import adds a memory path and no session is open", async () => {
    const skyPath = "D:/stage/textures/sky_alb.nutexb";
    const memoryPath = "memory://scene-session/prop/prop_alb.nutexb";
    const skyBundle = makeImportedMemoryBundle(skyPath);
    const memoryBundle = makeImportedMemoryBundle(memoryPath);
    memoryBundle.resolvedNutexbPaths = [memoryPath];
    memoryBundle.textureResolve = [{ reference: "stage_wall_alb", nutexbPath: memoryPath }];
    const importedBundles = [memoryBundle];
    const subModels: Parameters<typeof useSceneTextureLoader>[1] = [];
    const placementEntries: Parameters<typeof useSceneTextureLoader>[3] = [];
    const objectTextureLoadState = {};

    const { result } = renderHook(() =>
      useSceneTextureLoader(
        skyBundle,
        subModels,
        importedBundles,
        placementEntries,
        null,
        textureSlotLoadEnabled,
        objectTextureLoadState,
        true,
      ),
    );

    await waitFor(() => {
      expect(result.current.textureDataMap.get(skyPath)?.width).toBe(1);
    });
    expect(result.current.textureDataMap.has(memoryPath)).toBe(false);
    expect(mocks.getMemoryNutexbPreviewIdentity).not.toHaveBeenCalled();
  });
});
