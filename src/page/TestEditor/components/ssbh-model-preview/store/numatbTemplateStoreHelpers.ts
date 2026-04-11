import {
  cloneNumatbFile,
  createEmptyMaterialEntry,
  createEmptyNumatbFile,
  getNumatbAttributeKind,
  getNumatbEntries,
  type MatlDataJson,
  type MatlEntryJson,
  type NumatbAttribute,
  type NumatbAttributeData,
  type NumatbAttributeDataKind,
  type NumatbProfileKind,
  type NumdlbMappingRow,
} from "../daeSsbhTypes";
import {
  addAttributeToMatlEntry,
  flattenEntryToAttributes,
  removeAttributeAtFlatIndex,
  replaceAttributeAtFlatIndex,
} from "./matlEntryFlat";
import { produce } from "immer";

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

export { createAttribute, createDefaultAttributeData, inferParamKind } from "./numatbAttributeDefaults";

export function cloneEntryWithLabel(entry: MatlEntryJson, materialLabel: string): MatlEntryJson {
  const next = JSON.parse(JSON.stringify(entry)) as MatlEntryJson;
  next.material_label = materialLabel;
  return next;
}

export function ensureMaterialEntriesForLabels(
  file: MatlDataJson,
  labels: string[],
  profile: NumatbProfileKind,
): MatlDataJson {
  const next = cloneNumatbFile(file);
  const currentEntries = getNumatbEntries(next);
  const templateEntry = currentEntries[0] ? (JSON.parse(JSON.stringify(currentEntries[0])) as MatlEntryJson) : null;
  next.entries = labels.map((label) => {
    const existing = currentEntries.find((entry) => entry.material_label === label);
    if (existing) {
      return JSON.parse(JSON.stringify(existing)) as MatlEntryJson;
    }
    if (templateEntry) {
      return cloneEntryWithLabel(templateEntry, label);
    }
    return createEmptyMaterialEntry(label, profile);
  });
  return next;
}

export function replaceMaterialLabelInProfiles(
  mayaFile: MatlDataJson,
  nustFile: MatlDataJson,
  previousLabel: string,
  nextLabel: string,
): { mayaFile: MatlDataJson; nustFile: MatlDataJson } {
  const updateFile = (file: MatlDataJson) => {
    const next = cloneNumatbFile(file);
    for (const entry of next.entries) {
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
  mayaFile: MatlDataJson,
  nustFile: MatlDataJson,
  rows: NumdlbMappingRow[],
): { mayaFile: MatlDataJson; nustFile: MatlDataJson } {
  const labels = Array.from(new Set(rows.map((row) => row.materialLabel.trim()).filter(Boolean)));
  return {
    mayaFile: ensureMaterialEntriesForLabels(mayaFile, labels, "maya"),
    nustFile: ensureMaterialEntriesForLabels(nustFile, labels, "nust"),
  };
}

export function isTexturePathParamId(paramId: string): boolean {
  if (paramId === "Texture1" || paramId.includes("CubeMap")) {
    return true;
  }
  if (
    paramId.endsWith("Map") ||
    paramId.endsWith("CubeMap") ||
    paramId.startsWith("Texture") ||
    paramId === "DiffuseMap" ||
    paramId === "SpecularMap"
  ) {
    return true;
  }
  return false;
}

function texturePathStringFromData(data: NumatbAttributeData): string | undefined {
  if (data.String !== undefined) {
    return data.String;
  }
  if (data.String1 !== undefined) {
    return data.String1;
  }
  return undefined;
}

function applyTexturePathStringToData(target: NumatbAttributeData, path: string): NumatbAttributeData {
  const next = { ...target };
  if (target.String !== undefined) {
    next.String = path;
    return next;
  }
  if (target.String1 !== undefined) {
    next.String1 = path;
    return next;
  }
  return target;
}

/**
 * Copies the texture path from sourceData onto the matching param in targetFile (same material_label + param_id).
 * No-op if the param is missing on the target or is not a texture path id.
 */
export function mirrorTexturePathOntoOtherProfile(
  targetFile: MatlDataJson,
  materialLabel: string,
  paramId: string,
  sourceData: NumatbAttributeData,
): MatlDataJson {
  if (!isTexturePathParamId(paramId) || paramId.startsWith("Use")) {
    return targetFile;
  }
  const path = texturePathStringFromData(sourceData);
  if (path === undefined) {
    return targetFile;
  }
  const entryIndex = targetFile.entries.findIndex((item) => item.material_label === materialLabel);
  if (entryIndex < 0) {
    return targetFile;
  }
  const entry = targetFile.entries[entryIndex];
  const attributes = flattenEntryToAttributes(entry);
  const attributeIndex = attributes.findIndex((attribute) => attribute.param_id === paramId);
  if (attributeIndex < 0) {
    return targetFile;
  }
  const current = attributes[attributeIndex].param.data;
  const merged = applyTexturePathStringToData(current, path);
  return produce(targetFile, (draft) => {
    const targetEntry = draft.entries[entryIndex];
    if (!targetEntry) {
      throw new Error("Material index is out of range");
    }
    draft.entries[entryIndex] = replaceAttributeAtFlatIndex(targetEntry, attributeIndex, merged);
  });
}

function collectMissingTexturePathSlotsImpl(
  file: MatlDataJson,
  materialLabelFilter: Set<string> | null,
): string[] {
  const missing: string[] = [];
  for (const entry of getNumatbEntries(file)) {
    if (materialLabelFilter !== null && !materialLabelFilter.has(entry.material_label)) {
      continue;
    }
    for (const row of entry.textures ?? []) {
      const paramId = String(row.param_id);
      if (!isTexturePathParamId(paramId) || paramId.startsWith("Use")) {
        continue;
      }
      const raw = row.data;
      const path = raw == null ? "" : String(raw).trim();
      if (!path) {
        missing.push(`${entry.material_label} → ${paramId}`);
      }
    }
    for (const row of entry.textures2 ?? []) {
      const paramId = String(row.param_id);
      if (!isTexturePathParamId(paramId) || paramId.startsWith("Use")) {
        continue;
      }
      const raw = row.data;
      const path = raw == null ? "" : String(raw).trim();
      if (!path) {
        missing.push(`${entry.material_label} → ${paramId} (textures2)`);
      }
    }
  }
  return missing;
}

export function collectMissingTexturePathSlots(file: MatlDataJson): string[] {
  return collectMissingTexturePathSlotsImpl(file, null);
}

export function areNumatbTexturePathsComplete(file: MatlDataJson): boolean {
  return collectMissingTexturePathSlots(file).length === 0;
}

export function collectMissingTexturePathsForExportSession(
  mayaFile: MatlDataJson,
  nustFile: MatlDataJson,
  options: {
    writeNumatb: boolean;
    writeMayaProfile: boolean;
    /** Only validate materials referenced by NUMDLB mapping (trimmed labels). */
    materialLabels?: readonly string[];
  },
): string[] {
  const trimmed = (options.materialLabels ?? []).map((label) => label.trim()).filter(Boolean);
  const labelFilter = trimmed.length > 0 ? new Set(trimmed) : null;

  const missing: string[] = [];
  if (options.writeMayaProfile) {
    for (const line of collectMissingTexturePathSlotsImpl(mayaFile, labelFilter)) {
      missing.push(`Maya profile: ${line}`);
    }
  }
  if (options.writeNumatb) {
    for (const line of collectMissingTexturePathSlotsImpl(nustFile, labelFilter)) {
      missing.push(`Nust profile: ${line}`);
    }
  }
  return missing;
}

export function stripTextureUrlStringsFromNumatbFile(file: MatlDataJson): MatlDataJson {
  const next = cloneNumatbFile(file);
  for (const entry of next.entries) {
    for (const row of entry.textures ?? []) {
      row.data = "";
    }
    for (const row of entry.textures2 ?? []) {
      row.data = "";
    }
  }
  return next;
}

export function ensureShaderLabelsOnEntries(file: MatlDataJson): MatlDataJson {
  const next = cloneNumatbFile(file);
  for (const entry of next.entries) {
    if (entry.shader_label === undefined) {
      entry.shader_label = "";
    }
  }
  return next;
}

export function ensureMissingMappingLabelsInProfiles(
  mayaFile: MatlDataJson,
  nustFile: MatlDataJson,
  rows: NumdlbMappingRow[],
): { mayaFile: MatlDataJson; nustFile: MatlDataJson } {
  const labels = Array.from(new Set(rows.map((row) => row.materialLabel.trim()).filter(Boolean)));
  const addMissing = (file: MatlDataJson): MatlDataJson => {
    const entries = getNumatbEntries(file);
    const existing = new Set(entries.map((entry) => entry.material_label));
    const base = entries.find((entry) => entry.material_label === "pbr1Mtl") ?? entries[0];
    if (!base) {
      return file;
    }
    const next = cloneNumatbFile(file);
    const out = next.entries;
    for (const label of labels) {
      if (!existing.has(label)) {
        out.push(cloneEntryWithLabel(base, label));
        existing.add(label);
      }
    }
    return next;
  };
  return {
    mayaFile: addMissing(mayaFile),
    nustFile: addMissing(nustFile),
  };
}

export function upsertProfileEntriesFromTemplate(
  existingFile: MatlDataJson,
  templateFile: MatlDataJson,
  rows: NumdlbMappingRow[],
  profile: NumatbProfileKind,
): MatlDataJson {
  const labels = Array.from(new Set(rows.map((row) => row.materialLabel.trim()).filter(Boolean)));
  if (labels.length === 0) {
    return createEmptyNumatbFile();
  }
  const templateEntries = getNumatbEntries(templateFile);
  const fallbackTemplate = templateEntries[0]
    ? (JSON.parse(JSON.stringify(templateEntries[0])) as MatlEntryJson)
    : null;
  const currentEntries = getNumatbEntries(existingFile);
  return {
    major_version: 1,
    minor_version: 6,
    entries: labels.map((label) => {
      const existing = currentEntries.find((entry) => entry.material_label === label);
      if (existing) {
        return JSON.parse(JSON.stringify(existing)) as MatlEntryJson;
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
  };
}

export function updateEntryAttribute(
  file: MatlDataJson,
  materialIndex: number,
  attributeIndex: number,
  data: NumatbAttributeData,
): MatlDataJson {
  const entry = file.entries[materialIndex];
  if (!entry) {
    throw new Error("Material index is out of range");
  }
  return produce(file, (draft) => {
    const targetEntry = draft.entries[materialIndex];
    if (!targetEntry) {
      throw new Error("Material index is out of range");
    }
    draft.entries[materialIndex] = replaceAttributeAtFlatIndex(targetEntry, attributeIndex, data);
  });
}

export function addEntryAttribute(
  file: MatlDataJson,
  materialIndex: number,
  paramId: string,
  kind?: NumatbAttributeDataKind,
): MatlDataJson {
  const entry = file.entries[materialIndex];
  if (!entry) {
    throw new Error("Material index is out of range");
  }
  return produce(file, (draft) => {
    const targetEntry = draft.entries[materialIndex];
    if (!targetEntry) {
      throw new Error("Material index is out of range");
    }
    draft.entries[materialIndex] = addAttributeToMatlEntry(targetEntry, paramId, kind);
  });
}

export function removeEntryAttribute(
  file: MatlDataJson,
  materialIndex: number,
  attributeIndex: number,
): MatlDataJson {
  const entry = file.entries[materialIndex];
  if (!entry) {
    throw new Error("Material index is out of range");
  }
  return produce(file, (draft) => {
    const targetEntry = draft.entries[materialIndex];
    if (!targetEntry) {
      throw new Error("Material index is out of range");
    }
    draft.entries[materialIndex] = removeAttributeAtFlatIndex(targetEntry, attributeIndex);
  });
}

export function updateMaterialLabel(
  file: MatlDataJson,
  materialIndex: number,
  materialLabel: string,
): MatlDataJson {
  if (!file.entries[materialIndex]) {
    throw new Error("Material index is out of range");
  }
  return produce(file, (draft) => {
    const entry = draft.entries[materialIndex];
    if (!entry) {
      throw new Error("Material index is out of range");
    }
    entry.material_label = materialLabel;
  });
}

export function updateShaderLabel(
  file: MatlDataJson,
  materialIndex: number,
  shaderLabel: string,
): MatlDataJson {
  if (!file.entries[materialIndex]) {
    throw new Error("Material index is out of range");
  }
  return produce(file, (draft) => {
    const entry = draft.entries[materialIndex];
    if (!entry) {
      throw new Error("Material index is out of range");
    }
    entry.shader_label = shaderLabel;
  });
}

export function addMaterialEntry(
  file: MatlDataJson,
  materialLabel: string,
  profile: NumatbProfileKind,
): MatlDataJson {
  return produce(file, (draft) => {
    draft.entries.push(createEmptyMaterialEntry(materialLabel, profile));
  });
}

export function removeMaterialEntry(file: MatlDataJson, materialIndex: number): MatlDataJson {
  return produce(file, (draft) => {
    draft.entries.splice(materialIndex, 1);
  });
}

export function cloneProfile(file: MatlDataJson): MatlDataJson {
  return cloneNumatbFile(file);
}

export function getAttributeKindLabel(attribute: NumatbAttribute): NumatbAttributeDataKind {
  return getNumatbAttributeKind(attribute.param.data);
}
