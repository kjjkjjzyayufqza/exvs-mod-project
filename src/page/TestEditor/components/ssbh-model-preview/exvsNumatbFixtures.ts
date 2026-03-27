import type { NumatbFileJson } from "./daeSsbhTypes";

export const EXVS_MAYA_TEMPLATE_FIXTURE: NumatbFileJson = {
  Matl: {
    V16: {
      entries: [
        {
          material_label: "emiMtl",
          shader_label: "",
          attributes: [
            {
              param_id: "BlendState0",
              param: {
                data: {
                  BlendState: {
                    source_color: "One",
                    color_operation: "Add",
                    destination_color: "Zero",
                    source_alpha: "One",
                    alpha_operation: "Add",
                    destination_alpha: "Zero",
                    alpha_sample_to_coverage: 0,
                    unk8: 0,
                    unk9: 0,
                    unk10: 5,
                  },
                },
              },
            },
            {
              param_id: "RasterizerState0",
              param: {
                data: {
                  RasterizerState: {
                    fill_mode: "Solid",
                    cull_mode: "Back",
                    depth_bias: 0,
                    unk4: 0,
                    unk5: 0,
                    unk6: 16777217,
                  },
                },
              },
            },
            {
              param_id: "DiffuseMap",
              param: {
                data: {
                  String: "../../textures/015gndmuc_004deltpl_001_emi_basecolor",
                },
              },
            },
            {
              param_id: "DiffuseSampler",
              param: {
                data: {
                  Sampler: {
                    wraps: "Repeat",
                    wrapt: "Repeat",
                    wrapr: "ClampToEdge",
                    min_filter: "LinearMipmapLinear",
                    mag_filter: "Linear",
                    texture_filtering_type: "Default2",
                    border_color: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
                    unk11: 0,
                    unk12: 2139095022,
                    lod_bias: 0,
                    max_anisotropy: "One",
                  },
                },
              },
            },
          ],
        },
      ],
    },
  },
};

export const EXVS_NUST_TEMPLATE_FIXTURE: NumatbFileJson = {
  Matl: {
    V16: {
      entries: [
        {
          material_label: "pbr1Mtl",
          shader_label: "vsngCharaBasic",
          attributes: [
            {
              param_id: "DiffuseCubeMap",
              param: {
                data: {
                  String: "../../../share/textures/barispecular00_cubemap",
                },
              },
            },
            {
              param_id: "BaseColorMap",
              param: {
                data: {
                  String: "../../textures/015gndmuc_004deltpl_001_pbr1_basecolor",
                },
              },
            },
            {
              param_id: "DiffuseSampler",
              param: {
                data: {
                  Sampler: {
                    wraps: "Repeat",
                    wrapt: "Repeat",
                    wrapr: "Repeat",
                    min_filter: "LinearMipmapLinear",
                    mag_filter: "Linear",
                    texture_filtering_type: "Default2",
                    border_color: { r: 0, g: 0, b: 0, a: 0 },
                    unk11: 0,
                    unk12: 1098907648,
                    lod_bias: -1,
                    max_anisotropy: "One",
                  },
                },
              },
            },
            {
              param_id: "EmissiveScale",
              param: {
                data: {
                  Float1: 4,
                },
              },
            },
          ],
        },
      ],
    },
  },
};
