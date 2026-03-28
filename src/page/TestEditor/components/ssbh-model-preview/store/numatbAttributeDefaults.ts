import type {
  NumatbAttribute,
  NumatbAttributeData,
  NumatbAttributeDataKind,
} from "../daeSsbhTypes";

export function createDefaultAttributeData(kind: NumatbAttributeDataKind): NumatbAttributeData {
  switch (kind) {
    case "Boolean":
      return { Boolean: 0 };
    case "Float":
      return { Float: 0 };
    case "Float1":
      return { Float1: 0 };
    case "String":
      return { String: "" };
    case "String1":
      return { String1: "" };
    case "Vector4":
      return { Vector4: { x: 0, y: 0, z: 0, w: 0 } };
    case "Unk7":
      return { Unk7: { r: 0, g: 0, b: 0, a: 0 } };
    case "Sampler":
      return {
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
      };
    case "BlendState":
      return {
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
      };
    case "RasterizerState":
      return {
        RasterizerState: {
          fill_mode: "Solid",
          cull_mode: "Back",
          depth_bias: 0,
          unk4: 0,
          unk5: 0,
          unk6: 16777217,
        },
      };
    case "UvTransform":
      return {
        UvTransform: {
          scale_u: 1,
          scale_v: 1,
          rotation: 0,
          translate_u: 0,
          translate_v: 0,
        },
      };
    case "Type4":
      return { Type4: new Array(16).fill(0) };
  }
}

export function inferParamKind(paramId: string): NumatbAttributeDataKind {
  if (paramId.startsWith("Use") || paramId === "ReceiveShadow" || paramId === "NormalMapBc5") {
    return "Boolean";
  }
  if (paramId.endsWith("Sampler")) {
    return "Sampler";
  }
  if (paramId.endsWith("UvTransform")) {
    return "UvTransform";
  }
  if (paramId === "BlendState0") {
    return "BlendState";
  }
  if (paramId === "RasterizerState0") {
    return "RasterizerState";
  }
  if (
    paramId.endsWith("Map") ||
    paramId.endsWith("CubeMap") ||
    paramId.startsWith("Texture") ||
    paramId === "DiffuseMap" ||
    paramId === "SpecularMap"
  ) {
    return "String";
  }
  if (paramId.startsWith("CustomVector")) {
    return "Vector4";
  }
  if (paramId.startsWith("CustomColor") || paramId === "Diffuse" || paramId === "Specular") {
    return "Unk7";
  }
  if (paramId === "Fresnel") {
    return "Type4";
  }
  if (paramId === "CustomInteger0") {
    return "Float";
  }
  return "Float1";
}

export function createAttribute(paramId: string, kind?: NumatbAttributeDataKind): NumatbAttribute {
  const resolvedKind = kind ?? inferParamKind(paramId);
  return {
    param_id: paramId,
    param: {
      data: createDefaultAttributeData(resolvedKind),
    },
  };
}
