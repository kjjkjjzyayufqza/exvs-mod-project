import {
  cloneNumatbFile,
  createEmptyMaterialEntry,
  createEmptyNumatbFile,
  getNumatbEntries,
  getNumatbAttributeKind,
  type NumatbAttribute,
  type NumatbAttributeData,
  type NumatbAttributeDataKind,
  type NumatbFileJson,
  type NumatbMaterialEntry,
  type NumatbProfileKind,
  type NumdlbMappingRow,
} from "../daeSsbhTypes";

export const COMMON_NUMATB_PARAM_IDS = [
  "BlendState0",
  "RasterizerState0",
  "Diffuse",
  "DiffuseMap",
  "DiffuseSampler",
  "DiffuseUvTransform",
  "UseDiffuseUvTransform",
  "Specular",
  "SpecularMap",
  "SpecularSampler",
  "SpecularUvTransform",
  "UseSpecularUvTransform",
  "NormalMap",
  "NormalSampler",
  "NormalUvTransform",
  "UseNormalUvTransform",
  "BaseColorMap",
  "MetallicMap",
  "RoughnessMap",
  "AmbientOcclusionMap",
  "EmissiveMap",
  "DiffuseCubeMap",
  "Texture1",
  "UseMetallicMap",
  "UseAmbientOcclusionMap",
  "UseRoughnessMap",
  "UseNormalMap",
  "UseEmissiveMap",
  "ReceiveShadow",
  "NormalMapBc5",
  "EmissiveScale",
  "CosinePower",
  "CustomInteger0",
  "CustomFloat0",
  "CustomFloat1",
  "CustomFloat2",
  "CustomFloat3",
  "CustomFloat4",
  "CustomFloat5",
  "CustomFloat7",
  "CustomFloat8",
  "CustomFloat9",
  "CustomVector0",
  "CustomVector2",
  "CustomVector3",
  "CustomColor0",
  "CustomColor1",
  "CustomColor2",
  "Fresnel",
] as const;

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

export function cloneEntryWithLabel(entry: NumatbMaterialEntry, materialLabel: string): NumatbMaterialEntry {
  const next = JSON.parse(JSON.stringify(entry)) as NumatbMaterialEntry;
  next.material_label = materialLabel;
  return next;
}

export function ensureMaterialEntriesForLabels(
  file: NumatbFileJson,
  labels: string[],
  profile: NumatbProfileKind,
): NumatbFileJson {
  const next = cloneNumatbFile(file);
  const currentEntries = getNumatbEntries(next);
  const templateEntry = currentEntries[0] ? JSON.parse(JSON.stringify(currentEntries[0])) as NumatbMaterialEntry : null;
  const nextEntries = labels.map((label) => {
    const existing = currentEntries.find((entry) => entry.material_label === label);
    if (existing) {
      return JSON.parse(JSON.stringify(existing)) as NumatbMaterialEntry;
    }
    if (templateEntry) {
      return cloneEntryWithLabel(templateEntry, label);
    }
    return createEmptyMaterialEntry(label, profile);
  });
  next.Matl.V16.entries = nextEntries;
  return next;
}

export function replaceMaterialLabelInProfiles(
  mayaFile: NumatbFileJson,
  nustFile: NumatbFileJson,
  previousLabel: string,
  nextLabel: string,
): { mayaFile: NumatbFileJson; nustFile: NumatbFileJson } {
  const updateFile = (file: NumatbFileJson) => {
    const next = cloneNumatbFile(file);
    for (const entry of next.Matl.V16.entries) {
      if (entry.material_label === previousLabel) {
        entry.material_label = nextLabel;
      }
    }
    return next;
  };
  return {
    mayaFile: updateFile(mayaFile),
    nustFile: updateFile(nustFile),
  };
}

export function syncProfilesWithMappings(
  mayaFile: NumatbFileJson,
  nustFile: NumatbFileJson,
  rows: NumdlbMappingRow[],
): { mayaFile: NumatbFileJson; nustFile: NumatbFileJson } {
  const labels = Array.from(new Set(rows.map((row) => row.materialLabel.trim()).filter(Boolean)));
  return {
    mayaFile: ensureMaterialEntriesForLabels(mayaFile, labels, "maya"),
    nustFile: ensureMaterialEntriesForLabels(nustFile, labels, "nust"),
  };
}

export function upsertProfileEntriesFromTemplate(
  existingFile: NumatbFileJson,
  templateFile: NumatbFileJson,
  rows: NumdlbMappingRow[],
  profile: NumatbProfileKind,
): NumatbFileJson {
  const labels = Array.from(new Set(rows.map((row) => row.materialLabel.trim()).filter(Boolean)));
  if (labels.length === 0) {
    return createEmptyNumatbFile();
  }
  const templateEntries = getNumatbEntries(templateFile);
  const fallbackTemplate = templateEntries[0] ? JSON.parse(JSON.stringify(templateEntries[0])) as NumatbMaterialEntry : null;
  const currentEntries = getNumatbEntries(existingFile);
  return {
    Matl: {
      V16: {
        entries: labels.map((label) => {
          const existing = currentEntries.find((entry) => entry.material_label === label);
          if (existing) {
            return JSON.parse(JSON.stringify(existing)) as NumatbMaterialEntry;
          }
          const exactTemplate = templateEntries.find((entry) => entry.material_label === label);
          if (exactTemplate) {
            return cloneEntryWithLabel(exactTemplate, label);
          }
          if (fallbackTemplate) {
            return cloneEntryWithLabel(fallbackTemplate, label);
          }
          return createEmptyMaterialEntry(label, profile);
        }),
      },
    },
  };
}

export function updateEntryAttribute(
  file: NumatbFileJson,
  materialIndex: number,
  attributeIndex: number,
  data: NumatbAttributeData,
): NumatbFileJson {
  const next = cloneNumatbFile(file);
  const entry = next.Matl.V16.entries[materialIndex];
  if (!entry?.attributes[attributeIndex]) {
    throw new Error("Attribute index is out of range");
  }
  entry.attributes[attributeIndex].param.data = data;
  return next;
}

export function addEntryAttribute(
  file: NumatbFileJson,
  materialIndex: number,
  paramId: string,
  kind?: NumatbAttributeDataKind,
): NumatbFileJson {
  const next = cloneNumatbFile(file);
  const entry = next.Matl.V16.entries[materialIndex];
  if (!entry) {
    throw new Error("Material index is out of range");
  }
  if (entry.attributes.some((attribute) => attribute.param_id === paramId)) {
    return next;
  }
  entry.attributes.push(createAttribute(paramId, kind));
  return next;
}

export function removeEntryAttribute(
  file: NumatbFileJson,
  materialIndex: number,
  attributeIndex: number,
): NumatbFileJson {
  const next = cloneNumatbFile(file);
  const entry = next.Matl.V16.entries[materialIndex];
  if (!entry?.attributes[attributeIndex]) {
    throw new Error("Attribute index is out of range");
  }
  entry.attributes.splice(attributeIndex, 1);
  return next;
}

export function updateMaterialLabel(
  file: NumatbFileJson,
  materialIndex: number,
  materialLabel: string,
): NumatbFileJson {
  const next = cloneNumatbFile(file);
  const entry = next.Matl.V16.entries[materialIndex];
  if (!entry) {
    throw new Error("Material index is out of range");
  }
  entry.material_label = materialLabel;
  return next;
}

export function updateShaderLabel(
  file: NumatbFileJson,
  materialIndex: number,
  shaderLabel: string,
): NumatbFileJson {
  const next = cloneNumatbFile(file);
  const entry = next.Matl.V16.entries[materialIndex];
  if (!entry) {
    throw new Error("Material index is out of range");
  }
  entry.shader_label = shaderLabel;
  return next;
}

export function addMaterialEntry(
  file: NumatbFileJson,
  materialLabel: string,
  profile: NumatbProfileKind,
): NumatbFileJson {
  const next = cloneNumatbFile(file);
  next.Matl.V16.entries.push(createEmptyMaterialEntry(materialLabel, profile));
  return next;
}

export function removeMaterialEntry(file: NumatbFileJson, materialIndex: number): NumatbFileJson {
  const next = cloneNumatbFile(file);
  next.Matl.V16.entries.splice(materialIndex, 1);
  return next;
}

export function cloneProfile(file: NumatbFileJson): NumatbFileJson {
  return cloneNumatbFile(file);
}

export function getAttributeKindLabel(attribute: NumatbAttribute): NumatbAttributeDataKind {
  return getNumatbAttributeKind(attribute.param.data);
}
