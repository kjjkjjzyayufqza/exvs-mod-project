import { describe, expect, it } from "vitest";
import {
  buildDrawListFromBundle,
  buildMatlLookup,
  resolveMaterialBinding,
  resolveMaterialTexturePaths,
} from "./meshFromSsbh";
import type { MatlDataJson, MeshDataJson, ModlDataJson } from "./types";

describe("buildMatlLookup", () => {
  it("merges split EXVS material entries by material label", () => {
    const matl: MatlDataJson = {
      major_version: 1,
      minor_version: 6,
      entries: [
        {
          material_label: "emi2Mtl",
          shader_label: "",
          textures: [
            { param_id: "Texture0", data: "../../textures/015_emi2_basecolor" },
            { param_id: "Texture4", data: "../../textures/015_emi2_roughnessandmask" },
            { param_id: "Texture6", data: "../../textures/015_emi2_normal" },
          ],
        },
        {
          material_label: "emi2Mtl",
          shader_label: "vsngCharaBasic",
          textures: [
            { param_id: "Texture1", data: "../../textures/015_emi2_ambientocclusion" },
            { param_id: "Texture2", data: "../../textures/015_emi2_roughness" },
            { param_id: "Texture3", data: "../../textures/015_emi2_emissive" },
            { param_id: "Texture5", data: "../../textures/015_emi2_metallic" },
            { param_id: "Texture7", data: "../../../share/textures/barispecular00_cubemap" },
          ],
        },
      ],
    };

    const lookup = buildMatlLookup(matl);
    const merged = lookup.get("emi2Mtl");

    expect(merged).toBeDefined();
    expect(merged?.shader_label).toBe("vsngCharaBasic");
    expect(merged?.textures).toHaveLength(8);
  });
});

describe("resolveMaterialTexturePaths", () => {
  it("maps EXVS PBR texture names to MeshStandardMaterial slots", () => {
    const matl: MatlDataJson = {
      major_version: 1,
      minor_version: 6,
      entries: [
        {
          material_label: "emi2Mtl",
          shader_label: "vsngCharaBasic",
          textures: [
            {
              param_id: "Texture0",
              data: "../../textures/015gndmuc_004deltpl_001_emi2_basecolor",
            },
            {
              param_id: "Texture1",
              data: "../../textures/015gndmuc_004deltpl_001_emi2_ambientocclusion",
            },
            {
              param_id: "Texture2",
              data: "../../textures/015gndmuc_004deltpl_001_emi2_roughness",
            },
            {
              param_id: "Texture3",
              data: "../../textures/015gndmuc_004deltpl_001_emi2_emissive",
            },
            {
              param_id: "Texture4",
              data: "../../textures/015gndmuc_004deltpl_001_emi2_roughnessandmask",
            },
            {
              param_id: "Texture5",
              data: "../../textures/015gndmuc_004deltpl_001_emi2_metallic",
            },
            {
              param_id: "Texture6",
              data: "../../textures/015gndmuc_004deltpl_001_emi2_normal",
            },
            {
              param_id: "Texture7",
              data: "../../../share/textures/barispecular00_cubemap",
            },
          ],
        },
      ],
    };
    const refToPath = new Map<string, string>([
      [
        "../../textures/015gndmuc_004deltpl_001_emi2_basecolor",
        "E:/XB/textures/015gndmuc_004deltpl_001_emi2_basecolor.nutexb",
      ],
      [
        "../../textures/015gndmuc_004deltpl_001_emi2_ambientocclusion",
        "E:/XB/textures/015gndmuc_004deltpl_001_emi2_ambientocclusion.nutexb",
      ],
      [
        "../../textures/015gndmuc_004deltpl_001_emi2_roughness",
        "E:/XB/textures/015gndmuc_004deltpl_001_emi2_roughness.nutexb",
      ],
      [
        "../../textures/015gndmuc_004deltpl_001_emi2_roughnessandmask",
        "E:/XB/textures/015gndmuc_004deltpl_001_emi2_roughnessandmask.nutexb",
      ],
      [
        "../../textures/015gndmuc_004deltpl_001_emi2_metallic",
        "E:/XB/textures/015gndmuc_004deltpl_001_emi2_metallic.nutexb",
      ],
      [
        "../../textures/015gndmuc_004deltpl_001_emi2_normal",
        "E:/XB/textures/015gndmuc_004deltpl_001_emi2_normal.nutexb",
      ],
      [
        "../../textures/015gndmuc_004deltpl_001_emi2_emissive",
        "E:/XB/textures/015gndmuc_004deltpl_001_emi2_emissive.nutexb",
      ],
      [
        "../../../share/textures/barispecular00_cubemap",
        "E:/XB/share/textures/barispecular00_cubemap.nutexb",
      ],
    ]);

    const lookup = buildMatlLookup(matl);
    const resolved = resolveMaterialTexturePaths("emi2Mtl", lookup, refToPath);

    expect(resolved.mapPath).toBe("E:/XB/textures/015gndmuc_004deltpl_001_emi2_basecolor.nutexb");
    expect(resolved.normalPath).toBe("E:/XB/textures/015gndmuc_004deltpl_001_emi2_normal.nutexb");
    expect(resolved.roughnessPath).toBe(
      "E:/XB/textures/015gndmuc_004deltpl_001_emi2_roughness.nutexb",
    );
    expect(resolved.metalnessPath).toBe(
      "E:/XB/textures/015gndmuc_004deltpl_001_emi2_metallic.nutexb",
    );
    expect(resolved.emissivePath).toBe(
      "E:/XB/textures/015gndmuc_004deltpl_001_emi2_emissive.nutexb",
    );
    expect(resolved.aoPath).toBe(
      "E:/XB/textures/015gndmuc_004deltpl_001_emi2_ambientocclusion.nutexb",
    );
    expect(resolved.cubePath).toBe("E:/XB/share/textures/barispecular00_cubemap.nutexb");
  });
});

describe("resolveMaterialBinding", () => {
  it("resolves shader family and render hints for sparkle materials", () => {
    const matl: MatlDataJson = {
      major_version: 1,
      minor_version: 6,
      entries: [
        {
          material_label: "sparkleMtl",
          shader_label: "vsngCharaSparkle",
          textures: [{ param_id: "Texture0", data: "../../textures/sparkle_base" }],
          samplers: [{ param_id: "Sampler0", data: { wraps: "MirroredRepeat", wrapt: "Repeat" } }],
          booleans: [{ param_id: "UseDiffuseUvTransform", data: true }],
          uv_transforms: [
            {
              param_id: "DiffuseUvTransform",
              data: {
                scale_u: -1,
                scale_v: 1,
                rotation: 0,
                translate_u: 1,
                translate_v: 0,
              },
            },
          ],
          type4_v16: [{ param_id: "Fresnel", data: [1, 2, 3, 4] }],
          floats: [{ param_id: "Roughness", data: 0.2 }],
        },
      ],
    };
    const lookup = buildMatlLookup(matl);
    const refToPath = new Map<string, string>([
      ["../../textures/sparkle_base", "E:/XB/textures/sparkle_base.nutexb"],
    ]);
    const binding = resolveMaterialBinding("sparkleMtl", lookup, refToPath);

    expect(binding.shaderFamily).toBe("vsngCharaSparkle");
    expect(binding.renderHints.isSparkle).toBe(true);
    expect(binding.uniforms.roughnessScalar).toBe(0.2);
    expect(binding.uniforms.fresnelType4V16Hex).toBe("01020304");
    expect(binding.sampling.map.wrapS).toBe("MirroredRepeat");
    expect(binding.sampling.map.wrapT).toBe("Repeat");
    expect(binding.sampling.map.uvTransform).toEqual({
      scale_u: -1,
      scale_v: 1,
      rotation: 0,
      translate_u: 1,
      translate_v: 0,
    });
  });
});

describe("buildDrawListFromBundle", () => {
  it("duplicates uv into uv2 when only one uv set exists", () => {
    const modl: ModlDataJson = {
      entries: [
        {
          mesh_object_name: "body",
          mesh_object_subindex: 0,
          material_label: "mat_body",
        },
      ],
    };
    const mesh: MeshDataJson = {
      major_version: 1,
      minor_version: 10,
      is_vs2: true,
      objects: [
        {
          name: "body",
          subindex: 0,
          parent_bone_name: "",
          vertex_indices: [0, 1, 2],
          positions: [
            {
              name: "Position0",
              data: { Vector3: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] },
            },
          ],
          normals: [
            {
              name: "Normal0",
              data: { Vector3: [[0, 0, 1], [0, 0, 1], [0, 0, 1]] },
            },
          ],
          texture_coordinates: [
            {
              name: "uvSet",
              data: { Vector2: [[0, 0], [1, 0], [0, 1]] },
            },
          ],
        },
      ],
    };

    const draws = buildDrawListFromBundle(modl, mesh, null);
    expect(draws).toHaveLength(1);
    expect(draws[0]?.key).toBe("body_0");

    const prefixed = buildDrawListFromBundle(modl, mesh, null, {
      drawKeyPrefix: "pi_a1",
      instanceLabel: "model.numdlb",
    });
    expect(prefixed).toHaveLength(1);
    expect(prefixed[0]?.key).toBe("pi_a1::body_0");
    expect(prefixed[0]?.previewInstanceId).toBe("pi_a1");
    expect(prefixed[0]?.label).toContain("model.numdlb");
    const geom = draws[0]?.geometry;
    const uv = geom?.getAttribute("uv");
    const uv2 = geom?.getAttribute("uv2");
    expect(uv).toBeDefined();
    expect(uv2).toBeDefined();
    expect(uv2?.array).toEqual(uv?.array);
  });
});
