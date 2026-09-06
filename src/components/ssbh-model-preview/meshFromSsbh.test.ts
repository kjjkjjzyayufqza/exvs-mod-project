import { describe, expect, it } from "vitest";
import {
  buildDrawListFromBundle,
  buildMatlLookup,
  cloneBuiltMeshDrawsForInstance,
  decodeExportedMeshObjectIdentity,
  resolveMaterialBinding,
  resolveMaterialTexturePaths,
  createStageSafeTextureSlotLoadEnabled,
  createUniformTextureSlotLoadEnabled,
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

  it("resolves stage diffuse textures as base color maps", () => {
    const matl: MatlDataJson = {
      major_version: 1,
      minor_version: 6,
      entries: [
        {
          material_label: "m_panel_02",
          shader_label: "generic",
          textures: [],
          textures2: [
            { param_id: "Param0", data: "../../textures/stage001_panel_02_normal" },
            { param_id: "Param1", data: "../../textures/stage001_panel_02_roughness" },
            { param_id: "Param2", data: "../../textures/stage001_panel_02_diffuse" },
          ],
        },
      ],
    };
    const refToPath = new Map<string, string>([
      [
        "../../textures/stage001_panel_02_diffuse",
        "E:/XB/textures/stage001_panel_02_diffuse.nutexb",
      ],
      [
        "../../textures/stage001_panel_02_normal",
        "E:/XB/textures/stage001_panel_02_normal.nutexb",
      ],
      [
        "../../textures/stage001_panel_02_roughness",
        "E:/XB/textures/stage001_panel_02_roughness.nutexb",
      ],
    ]);

    const lookup = buildMatlLookup(matl);
    const resolved = resolveMaterialTexturePaths("m_panel_02", lookup, refToPath);

    expect(resolved.mapPath).toBe("E:/XB/textures/stage001_panel_02_diffuse.nutexb");
    expect(resolved.normalPath).toBe("E:/XB/textures/stage001_panel_02_normal.nutexb");
    expect(resolved.roughnessPath).toBe("E:/XB/textures/stage001_panel_02_roughness.nutexb");
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
    const pooled = cloneBuiltMeshDrawsForInstance(prefixed, "pi_a2", "model.numdlb");
    expect(pooled[0]?.key).toBe("pi_a2::body_0");
    expect(pooled[0]?.previewInstanceId).toBe("pi_a2");
    expect(pooled[0]?.geometry).toBe(prefixed[0]?.geometry);
    expect(pooled[0]?.skin).toBe(prefixed[0]?.skin);
    const geom = draws[0]?.geometry;
    const uv = geom?.getAttribute("uv");
    const uv2 = geom?.getAttribute("uv2");
    expect(uv).toBeDefined();
    expect(uv2).toBeDefined();
    expect(uv2?.array).toEqual(uv?.array);
  });

  it("matches Smash-style numdlb subindex entries to VS2 __subN mesh names", () => {
    expect(decodeExportedMeshObjectIdentity("SHAPE_ROOTShape__sub1", 0)).toEqual({
      name: "SHAPE_ROOTShape",
      subindex: 1,
    });
    expect(decodeExportedMeshObjectIdentity("SHAPE_ROOTShape__sub1__part0", 0)).toEqual({
      name: "SHAPE_ROOTShape__sub1__part0",
      subindex: 0,
    });

    const triangle = {
      parent_bone_name: "",
      vertex_indices: [0, 1, 2],
      positions: [
        {
          name: "Position0",
          data: { Vector3: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] as [number, number, number][] },
        },
      ],
      normals: [
        {
          name: "Normal0",
          data: { Vector3: [[0, 0, 1], [0, 0, 1], [0, 0, 1]] as [number, number, number][] },
        },
      ],
    };
    const modl: ModlDataJson = {
      entries: [
        { mesh_object_name: "SHAPE_ROOTShape", mesh_object_subindex: 0, material_label: "emiMtl" },
        { mesh_object_name: "SHAPE_ROOTShape", mesh_object_subindex: 1, material_label: "pbr1Mtl" },
      ],
    };
    const mesh: MeshDataJson = {
      major_version: 1,
      minor_version: 8,
      is_vs2: true,
      objects: [
        { name: "SHAPE_ROOTShape", subindex: 0, ...triangle },
        { name: "SHAPE_ROOTShape__sub1", subindex: 0, ...triangle },
      ],
    };

    const draws = buildDrawListFromBundle(modl, mesh, null);
    expect(draws).toHaveLength(2);
    expect(draws[0]?.materialLabel).toBe("emiMtl");
    expect(draws[1]?.materialLabel).toBe("pbr1Mtl");
    expect(draws[1]?.meshObjectName).toBe("SHAPE_ROOTShape");
    expect(draws[1]?.meshObjectSubindex).toBe(1);
  });

  it("builds geometry from binary __bin views without inline arrays", () => {
    const modl: ModlDataJson = {
      entries: [
        { mesh_object_name: "body", mesh_object_subindex: 0, material_label: "mat_body" },
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
          __bin: {
            positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
            normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
            uv0: new Float32Array([0, 0, 1, 0, 0, 1]),
            uv1: null,
            indices: new Uint32Array([0, 1, 2]),
          },
        },
      ],
    };

    const draws = buildDrawListFromBundle(modl, mesh, null);
    expect(draws).toHaveLength(1);
    const geom = draws[0]?.geometry;
    const position = geom?.getAttribute("position");
    expect(position?.count).toBe(3);
    expect(Array.from(position!.array as Float32Array)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    // uv duplicated into uv2 when the second channel is absent (same as inline path).
    expect(geom?.getAttribute("uv2")?.array).toEqual(geom?.getAttribute("uv")?.array);
  });

  it("keeps non-skinned geometry indexed (shared vertices, no de-index expansion)", () => {
    const modl: ModlDataJson = {
      entries: [
        { mesh_object_name: "quad", mesh_object_subindex: 0, material_label: "mat_quad" },
      ],
    };
    // A quad: 4 unique vertices, 6 indices (two triangles reuse two corners).
    const mesh: MeshDataJson = {
      major_version: 1,
      minor_version: 10,
      is_vs2: true,
      objects: [
        {
          name: "quad",
          subindex: 0,
          parent_bone_name: "",
          __bin: {
            positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
            normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
            uv0: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
            uv1: null,
            indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
          },
        },
      ],
    };

    const draws = buildDrawListFromBundle(modl, mesh, null);
    const geom = draws[0]?.geometry;
    // Indexed geometry preserves the 4 logical vertices instead of expanding to 6.
    expect(geom?.getAttribute("position")?.count).toBe(4);
    expect(geom?.getIndex()?.count).toBe(6);
    // Non-skinned meshes carry no CPU-skin payload.
    expect(draws[0]?.skin).toBeNull();
  });

  it("writes skinIndex and skinWeight attributes for skinned draws", () => {
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
          parent_bone_name: "Root",
          vertex_indices: [0, 1, 2],
          positions: [
            {
              name: "Position0",
              data: { Vector3: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] },
            },
          ],
          normals: [],
          texture_coordinates: [],
          bone_influences: [
            {
              bone_name: "Root",
              vertex_weights: [
                { vertex_index: 0, vertex_weight: 1 },
                { vertex_index: 1, vertex_weight: 1 },
                { vertex_index: 2, vertex_weight: 1 },
              ],
            },
          ],
        },
      ],
    };
    const skel = {
      bones: [
        {
          name: "Root",
          transform: [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
          ],
          parent_index: null,
          billboard_type: null,
        },
      ],
    };

    const draws = buildDrawListFromBundle(modl, mesh, skel);
    const draw = draws[0];
    expect(draw?.skin?.gpuAttributesReady).toBe(true);
    const skinIndex = draw?.geometry.getAttribute("skinIndex");
    const skinWeight = draw?.geometry.getAttribute("skinWeight");
    expect(skinIndex).toBeDefined();
    expect(skinWeight).toBeDefined();
    expect(skinIndex?.itemSize).toBe(4);
    expect(skinWeight?.itemSize).toBe(4);
    expect(skinIndex?.count).toBe(3);
    expect(skinWeight?.count).toBe(3);
  });

  it("resolves duplicate bone names using mesh parent branch", () => {
    const modl: ModlDataJson = {
      entries: [{ mesh_object_name: "body", mesh_object_subindex: 0, material_label: "mat_body" }],
    };
    const mesh: MeshDataJson = {
      major_version: 1,
      minor_version: 10,
      is_vs2: true,
      objects: [
        {
          name: "body",
          subindex: 0,
          parent_bone_name: "Arm_R",
          vertex_indices: [0, 1, 2],
          positions: [{ name: "Position0", data: { Vector3: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] } }],
          normals: [],
          texture_coordinates: [],
          bone_influences: [
            {
              bone_name: "Joint",
              vertex_weights: [
                { vertex_index: 0, vertex_weight: 1 },
                { vertex_index: 1, vertex_weight: 1 },
                { vertex_index: 2, vertex_weight: 1 },
              ],
            },
          ],
        },
      ],
    };
    const skel = {
      bones: [
        {
          name: "Root",
          transform: [[1, 0, 0, 0],[0, 1, 0, 0],[0, 0, 1, 0],[0, 0, 0, 1]],
          parent_index: null,
          billboard_type: null,
        },
        {
          name: "Arm_L",
          transform: [[1, 0, 0, 0],[0, 1, 0, 0],[0, 0, 1, 0],[0, 0, 0, 1]],
          parent_index: 0,
          billboard_type: null,
        },
        {
          name: "Joint",
          transform: [[1, 0, 0, 0],[0, 1, 0, 0],[0, 0, 1, 0],[0, 0, 0, 1]],
          parent_index: 1,
          billboard_type: null,
        },
        {
          name: "Arm_R",
          transform: [[1, 0, 0, 0],[0, 1, 0, 0],[0, 0, 1, 0],[0, 0, 0, 1]],
          parent_index: 0,
          billboard_type: null,
        },
        {
          name: "Joint",
          transform: [[1, 0, 0, 0],[0, 1, 0, 0],[0, 0, 1, 0],[0, 0, 0, 1]],
          parent_index: 3,
          billboard_type: null,
        },
      ],
    };

    const draws = buildDrawListFromBundle(modl, mesh, skel);
    const draw = draws[0];
    expect(draw?.skin).not.toBeNull();
    const idx = draw?.skin?.boneIndices;
    expect(idx?.[0]).toBe(4);
    expect(idx?.[4]).toBe(4);
    expect(idx?.[8]).toBe(4);
  });
});

describe("texture slot load presets", () => {
  it("stage safe enables core maps and disables emissive, metalness, cube", () => {
    const s = createStageSafeTextureSlotLoadEnabled();
    expect(s.map).toBe(true);
    expect(s.normalMap).toBe(true);
    expect(s.roughnessMap).toBe(true);
    expect(s.aoMap).toBe(true);
    expect(s.emissiveMap).toBe(false);
    expect(s.metalnessMap).toBe(false);
    expect(s.cubeMap).toBe(false);
  });

  it("uniform preset sets every slot to the same flag", () => {
    const on = createUniformTextureSlotLoadEnabled(true);
    const off = createUniformTextureSlotLoadEnabled(false);
    expect(on.map && on.emissiveMap && on.cubeMap).toBe(true);
    expect(off.map || off.emissiveMap || off.cubeMap).toBe(false);
  });
});
