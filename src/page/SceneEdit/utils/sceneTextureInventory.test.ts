import { describe, expect, test } from "vitest";
import {
  collectBundleTextureInventory,
  collectGlobalLoadedNutexbInventory,
  isTexturePathEnabledForObject,
  normalizeTexturePathKey,
  setTexturePathEnabledForObject,
} from "./sceneTextureInventory";
import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";

function makeBundle(): SsbhModelPreviewBundle {
  return {
    rootFolder: "stage",
    modlPath: "model.numdlb",
    meshPath: "model.nuhlpb",
    skelPath: null,
    matlPaths: ["model.numatb"],
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
          textures: [
            { param_id: "Texture0", data: "stage_wall_alb" },
            { param_id: "Texture4", data: "stage_wall_nrm" },
          ],
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
    textureRefs: ["stage_wall_alb", "stage_wall_nrm"],
    resolvedNutexbPaths: [
      "memory://stage/textures/stage_wall_alb.nutexb",
      "memory://stage/textures/stage_wall_nrm.nutexb",
    ],
    textureResolve: [
      {
        reference: "stage_wall_alb",
        nutexbPath: "memory://stage/textures/stage_wall_alb.nutexb",
      },
      {
        reference: "stage_wall_nrm",
        nutexbPath: "memory://stage/textures/stage_wall_nrm.nutexb",
      },
    ],
    warnings: [],
    sourceKind: "memory",
    sourceSessionId: "session-a",
  };
}

describe("scene texture inventory", () => {
  test("collects actual nutexb internal names instead of generic slot labels", () => {
    const textures = collectBundleTextureInventory(makeBundle(), new Map(), {
      map: true,
      normalMap: true,
      roughnessMap: true,
      metalnessMap: true,
      emissiveMap: true,
      aoMap: true,
      cubeMap: true,
    });

    expect(textures.map((entry) => entry.internalName)).toEqual([
      "stage_wall_alb",
      "stage_wall_nrm",
    ]);
    expect(textures[0]?.slots).toEqual(["map"]);
    expect(textures[1]?.slots).toContain("normalMap");
  });

  test("tracks object-level enabled state by normalized nutexb path", () => {
    const path = "memory://stage/textures/STAGE_WALL_ALB.nutexb";
    const state = setTexturePathEnabledForObject({}, "object-a", path, false);

    expect(normalizeTexturePathKey(path)).toBe("memory://stage/textures/stage_wall_alb.nutexb");
    expect(isTexturePathEnabledForObject(state, "object-a", path)).toBe(false);
    expect(isTexturePathEnabledForObject(state, "object-b", path)).toBe(true);
  });

  test("global loaded inventory deduplicates lowercase cache aliases", () => {
    const rgba = { width: 4, height: 8, rgba: new Uint8Array(4 * 8 * 4) };
    const textureDataMap: NutexbTextureDataMap = new Map([
      ["memory://stage/textures/stage_wall_alb.nutexb", rgba],
      ["memory://stage/textures/STAGE_WALL_ALB.nutexb".toLowerCase(), rgba],
    ]);
    const global = collectGlobalLoadedNutexbInventory([
      {
        objectId: "object-a",
        objectLabel: "Object A",
        textures: collectBundleTextureInventory(makeBundle(), textureDataMap, {
          map: true,
          normalMap: true,
          roughnessMap: true,
          metalnessMap: true,
          emissiveMap: true,
          aoMap: true,
          cubeMap: true,
        }),
      },
    ]);

    expect(global).toEqual([
      {
        path: "memory://stage/textures/stage_wall_alb.nutexb",
        internalName: "stage_wall_alb",
        resolution: "4x8",
        objectLabels: ["Object A"],
      },
    ]);
  });
});
