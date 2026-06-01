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

/** Map param_id -> boolean param_id that enables sampling (aligned with numatbStore COMMON_ATTRIBUTES).
 * SpecularMap and DiffuseCubeMap are intentionally omitted: profile-specific UV toggle rules apply instead. */
export const TEXTURE_MAP_USE_TOGGLES: Readonly<Record<string, string>> = {
  MetallicMap: "UseMetallicMap",
  RoughnessMap: "UseRoughnessMap",
  AmbientOcclusionMap: "UseAmbientOcclusionMap",
  NormalMap: "UseNormalMap",
  EmissiveMap: "UseEmissiveMap",
};

const BASE_COLOR_MAP_PARAM_IDS = [
  "BaseColorMap",
  "BaseColorMapLayer1",
  "DiffuseMap",
  "DiffuseMapLayer1",
] as const;

function readEntryBoolean(entry: MatlEntryJson, paramId: string): boolean | undefined {
  for (const row of entry.booleans ?? []) {
    if (String(row.param_id) !== paramId) {
      continue;
    }
    const data = row.data;
    if (typeof data === "boolean") {
      return data;
    }
    if (typeof data === "number") {
      return data !== 0;
    }
    return Boolean(data);
  }
  return undefined;
}

function entryHasTextureParam(entry: MatlEntryJson, paramId: string): boolean {
  for (const row of entry.textures ?? []) {
    if (String(row.param_id) === paramId) {
      return true;
    }
  }
  for (const row of entry.textures2 ?? []) {
    if (String(row.param_id) === paramId) {
      return true;
    }
  }
  return false;
}

function isBaseColorMapPathRequired(entry: MatlEntryJson): boolean {
  const useBase = readEntryBoolean(entry, "UseBaseColorMap");
  const useDiffuse = readEntryBoolean(entry, "UseDiffuseMap");
  if (useBase === true || useDiffuse === true) {
    return true;
  }
  if (useBase === false || useDiffuse === false) {
    return false;
  }
  return BASE_COLOR_MAP_PARAM_IDS.some((id) => entryHasTextureParam(entry, id));
}

/**
 * EXVS Maya materials may declare UseSpecularUvTransform without a SpecularMap slot.
 * Do not treat the UV toggle as a blanket SpecularMap requirement on the Maya profile;
 * only flag when the slot row exists and UseSpecularUvTransform is true.
 */
function shouldRequireMayaSpecularMapPath(entry: MatlEntryJson): boolean {
  return (
    readEntryBoolean(entry, "UseSpecularUvTransform") === true &&
    entryHasTextureParam(entry, "SpecularMap")
  );
}

/**
 * EXVS materials may declare UseDiffuseUvTransform without a DiffuseCubeMap slot.
 * Do not treat the UV toggle as a blanket DiffuseCubeMap requirement;
 * only flag when the slot row exists and UseDiffuseUvTransform is true.
 */
function shouldRequireDiffuseCubeMapPath(entry: MatlEntryJson): boolean {
  return (
    readEntryBoolean(entry, "UseDiffuseUvTransform") === true &&
    entryHasTextureParam(entry, "DiffuseCubeMap")
  );
}

/**
 * Whether a texture path must be non-empty for export validation.
 * Texture1 is required only when the entry actually declares it; PBR maps require their Use* flag;
 * base color follows UseBaseColorMap / implicit slot rules.
 */
export function isTextureMapPathRequired(
  entry: MatlEntryJson,
  mapParamId: string,
  profile: NumatbProfileKind,
): boolean {
  if (mapParamId === "Texture1") {
    return entryHasTextureParam(entry, "Texture1");
  }
  if (mapParamId === "SpecularMap") {
    return profile === "maya" && shouldRequireMayaSpecularMapPath(entry);
  }
  if (mapParamId === "DiffuseCubeMap") {
    return shouldRequireDiffuseCubeMapPath(entry);
  }
  const useToggle = TEXTURE_MAP_USE_TOGGLES[mapParamId];
  if (useToggle) {
    return readEntryBoolean(entry, useToggle) === true && entryHasTextureParam(entry, mapParamId);
  }
  if ((BASE_COLOR_MAP_PARAM_IDS as readonly string[]).includes(mapParamId)) {
    return isBaseColorMapPathRequired(entry);
  }
  return false;
}

function defaultTextureDataKindForParam(paramId: string): "String" | "String1" {
  if (
    paramId === "Texture1" ||
    paramId === "BaseColorMap" ||
    paramId === "BaseColorMapLayer1" ||
    paramId === "EmissiveMap" ||
    paramId === "NormalMap" ||
    paramId === "AmbientOcclusionMap" ||
    paramId === "RoughnessMap" ||
    paramId === "MetallicMap" ||
    paramId === "DiffuseCubeMap"
  ) {
    return "String1";
  }
  return "String";
}

function collectRequiredTextureMapParamIds(entry: MatlEntryJson, profile: NumatbProfileKind): string[] {
  const required = new Set<string>();

  // Texture1 is validated only when the entry actually declares it (textures or textures2),
  // never forced onto materials that never had a Texture1 param.
  if (entryHasTextureParam(entry, "Texture1")) {
    required.add("Texture1");
  }

  for (const [mapId, useId] of Object.entries(TEXTURE_MAP_USE_TOGGLES)) {
    if (readEntryBoolean(entry, useId) === true) {
      required.add(mapId);
    }
  }

  if (profile === "maya" && shouldRequireMayaSpecularMapPath(entry)) {
    required.add("SpecularMap");
  }

  if (shouldRequireDiffuseCubeMapPath(entry)) {
    required.add("DiffuseCubeMap");
  }

  if (isBaseColorMapPathRequired(entry)) {
    const useExplicit =
      readEntryBoolean(entry, "UseBaseColorMap") === true || readEntryBoolean(entry, "UseDiffuseMap") === true;
    if (useExplicit) {
      const present = BASE_COLOR_MAP_PARAM_IDS.filter((id) => entryHasTextureParam(entry, id));
      if (present.length > 0) {
        for (const id of present) {
          required.add(id);
        }
      } else {
        required.add("BaseColorMap");
      }
    } else {
      for (const id of BASE_COLOR_MAP_PARAM_IDS) {
        if (entryHasTextureParam(entry, id)) {
          required.add(id);
        }
      }
    }
  }

  return Array.from(required);
}

type TexturePathSlotLookup = {
  path: string;
  attributeIndex: number;
  textureDataKind: "String" | "String1";
};

type PresentTexturePathSlot = TexturePathSlotLookup & {
  paramId: string;
};

export function missingTexturePathSlotKey(slot: MissingTexturePathSlotRef): string {
  return `${slot.profile}:${slot.materialLabel}:${slot.paramId}:${slot.materialIndex}:${slot.attributeIndex}`;
}

export function resolveTexturePathValueForSlot(
  mayaFile: MatlDataJson,
  nustFile: MatlDataJson,
  slot: MissingTexturePathSlotRef,
): string {
  const file = slot.profile === "maya" ? mayaFile : nustFile;
  const entry = file.entries[slot.materialIndex];
  if (!entry) {
    return "";
  }
  return lookupTexturePathSlot(entry, slot.paramId)?.path ?? "";
}

/** Re-resolve attribute index / bucket after the param row is created or edited. */
export function refreshTexturePathSlotRef(
  mayaFile: MatlDataJson,
  nustFile: MatlDataJson,
  slot: MissingTexturePathSlotRef,
): MissingTexturePathSlotRef {
  const file = slot.profile === "maya" ? mayaFile : nustFile;
  const entry = file.entries[slot.materialIndex];
  if (!entry) {
    return slot;
  }
  const lookup = lookupTexturePathSlot(entry, slot.paramId);
  if (!lookup) {
    return slot;
  }
  return {
    ...slot,
    attributeIndex: lookup.attributeIndex,
    textureDataKind: lookup.textureDataKind,
    value: lookup.path,
  };
}

export type TexturePathProfileFiles = {
  mayaFile: MatlDataJson;
  nustFile: MatlDataJson;
};

export function applyTexturePathFillToProfiles(
  updateProfileAttribute: (
    profile: NumatbProfileKind,
    materialIndex: number,
    attributeIndex: number,
    data: NumatbAttributeData,
  ) => void,
  addProfileAttribute: (
    profile: NumatbProfileKind,
    materialIndex: number,
    paramId: string,
    kind: NumatbAttributeDataKind,
  ) => void,
  readProfileFiles: () => TexturePathProfileFiles,
  slot: MissingTexturePathSlotRef,
  basename: string,
): void {
  const dataKindForSlot = (resolved: MissingTexturePathSlotRef): NumatbAttributeData =>
    resolved.textureDataKind === "String1" ? { String1: basename } : { String: basename };

  let files = readProfileFiles();
  let resolved = refreshTexturePathSlotRef(files.mayaFile, files.nustFile, slot);
  const data = dataKindForSlot(resolved);

  if (resolved.attributeIndex < 0) {
    addProfileAttribute(resolved.profile, resolved.materialIndex, resolved.paramId, resolved.textureDataKind);
    files = readProfileFiles();
    resolved = refreshTexturePathSlotRef(files.mayaFile, files.nustFile, slot);
    if (resolved.attributeIndex < 0) {
      return;
    }
    updateProfileAttribute(resolved.profile, resolved.materialIndex, resolved.attributeIndex, dataKindForSlot(resolved));
    return;
  }

  updateProfileAttribute(resolved.profile, resolved.materialIndex, resolved.attributeIndex, data);
}

function lookupTexturePathSlot(entry: MatlEntryJson, paramId: string): TexturePathSlotLookup | null {
  const flatAttributes = flattenEntryToAttributes(entry);
  const attributeIndex = flatAttributes.findIndex((attribute) => attribute.param_id === paramId);
  if (attributeIndex < 0) {
    return null;
  }
  const data = flatAttributes[attributeIndex].param.data;
  if (data.String !== undefined) {
    return {
      path: String(data.String ?? "").trim(),
      attributeIndex,
      textureDataKind: "String",
    };
  }
  if (data.String1 !== undefined) {
    return {
      path: String(data.String1 ?? "").trim(),
      attributeIndex,
      textureDataKind: "String1",
    };
  }
  return {
    path: "",
    attributeIndex,
    textureDataKind: defaultTextureDataKindForParam(paramId),
  };
}

function collectPresentTexturePathSlots(entry: MatlEntryJson): PresentTexturePathSlot[] {
  return flattenEntryToAttributes(entry).flatMap((attribute, attributeIndex) => {
    const paramId = String(attribute.param_id);
    if (!isTexturePathParamId(paramId) || paramId.startsWith("Use")) {
      return [];
    }

    const data = attribute.param.data;
    if (data.String !== undefined) {
      return [{
        paramId,
        path: String(data.String ?? "").trim(),
        attributeIndex,
        textureDataKind: "String",
      }];
    }
    if (data.String1 !== undefined) {
      return [{
        paramId,
        path: String(data.String1 ?? "").trim(),
        attributeIndex,
        textureDataKind: "String1",
      }];
    }
    return [{
      paramId,
      path: "",
      attributeIndex,
      textureDataKind: defaultTextureDataKindForParam(paramId),
    }];
  });
}

function textureSlotMissingKey(paramId: string, textureDataKind: "String" | "String1"): string {
  return `${paramId}:${textureDataKind}`;
}

function collectMissingTexturePathsForEntry(
  entry: MatlEntryJson,
  profile: NumatbProfileKind,
  formatMissing: (paramId: string, textureDataKind: "String" | "String1") => string,
): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();

    for (const slot of collectPresentTexturePathSlots(entry)) {
    if (slot.path) {
      continue;
    }
    if (!isTextureMapPathRequired(entry, slot.paramId, profile)) {
      continue;
    }
    const key = textureSlotMissingKey(slot.paramId, slot.textureDataKind);
    if (!seen.has(key)) {
      seen.add(key);
      missing.push(formatMissing(slot.paramId, slot.textureDataKind));
    }
  }
  return missing;
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
  profile: NumatbProfileKind,
  materialLabelFilter: Set<string> | null,
): string[] {
  const missing: string[] = [];
  for (const entry of getNumatbEntries(file)) {
    if (materialLabelFilter !== null && !materialLabelFilter.has(entry.material_label)) {
      continue;
    }
    missing.push(
      ...collectMissingTexturePathsForEntry(entry, profile, (paramId, textureDataKind) => {
        const textures2Suffix = textureDataKind === "String1" ? " (textures2)" : "";
        return `${entry.material_label} → ${paramId}${textures2Suffix}`;
      }),
    );
  }
  return missing;
}

export function collectMissingTexturePathSlots(
  file: MatlDataJson,
  profile: NumatbProfileKind,
): string[] {
  return collectMissingTexturePathSlotsImpl(file, profile, null);
}

export function areNumatbTexturePathsComplete(file: MatlDataJson, profile: NumatbProfileKind): boolean {
  return collectMissingTexturePathSlots(file, profile).length === 0;
}

export interface MissingTexturePathSlotRef {
  profile: NumatbProfileKind;
  materialLabel: string;
  paramId: string;
  materialIndex: number;
  attributeIndex: number;
  value: string;
  textureDataKind: "String" | "String1";
}

function collectMissingTexturePathSlotRefsImpl(
  profile: NumatbProfileKind,
  file: MatlDataJson,
  materialLabelFilter: Set<string> | null,
): MissingTexturePathSlotRef[] {
  const missing: MissingTexturePathSlotRef[] = [];
  const entries = getNumatbEntries(file);
  for (let materialIndex = 0; materialIndex < entries.length; materialIndex += 1) {
    const entry = entries[materialIndex];
    if (materialLabelFilter !== null && !materialLabelFilter.has(entry.material_label)) {
      continue;
    }
    const seen = new Set<string>();
    const pushMissing = (
      paramId: string,
      attributeIndex: number,
      textureDataKind: "String" | "String1",
    ) => {
      const key = textureSlotMissingKey(paramId, textureDataKind);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      missing.push({
        profile,
        materialLabel: entry.material_label,
        paramId,
        materialIndex,
        attributeIndex,
        value: "",
        textureDataKind,
      });
    };

    for (const slot of collectPresentTexturePathSlots(entry)) {
      if (slot.path) {
        continue;
      }
      if (!isTextureMapPathRequired(entry, slot.paramId, profile)) {
        continue;
      }
      pushMissing(slot.paramId, slot.attributeIndex, slot.textureDataKind);
    }
  }
  return missing;
}

export function collectMissingTexturePathSlotRefsForExportSession(
  mayaFile: MatlDataJson,
  nustFile: MatlDataJson,
  options: {
    writeNumatb: boolean;
    writeMayaProfile: boolean;
    /**
     * Optional subset of material_label values to validate.
     * When omitted, every entry in each profile file that will be exported is checked.
     */
    materialLabels?: readonly string[];
  },
): MissingTexturePathSlotRef[] {
  const trimmed = (options.materialLabels ?? []).map((label) => label.trim()).filter(Boolean);
  const labelFilter = trimmed.length > 0 ? new Set(trimmed) : null;

  const missing: MissingTexturePathSlotRef[] = [];
  if (options.writeMayaProfile) {
    missing.push(...collectMissingTexturePathSlotRefsImpl("maya", mayaFile, labelFilter));
  }
  if (options.writeNumatb) {
    missing.push(...collectMissingTexturePathSlotRefsImpl("nust", nustFile, labelFilter));
  }
  return missing;
}

export function collectMissingTexturePathsForExportSession(
  mayaFile: MatlDataJson,
  nustFile: MatlDataJson,
  options: {
    writeNumatb: boolean;
    writeMayaProfile: boolean;
    /**
     * Optional subset of material_label values to validate.
     * When omitted, every entry in each profile file that will be exported is checked.
     */
    materialLabels?: readonly string[];
  },
): string[] {
  return collectMissingTexturePathSlotRefsForExportSession(mayaFile, nustFile, options).map((slot) => {
    const profileLabel = slot.profile === "maya" ? "Maya profile" : "Nust profile";
    const textures2Suffix = slot.textureDataKind === "String1" ? " (textures2)" : "";
    return `${profileLabel}: ${slot.materialLabel} → ${slot.paramId}${textures2Suffix}`;
  });
}

export interface NumatbEmptyTexturePathError {
  profile: NumatbProfileKind;
  materialLabel: string;
  paramId: string;
  isTextures2: boolean;
  numatbName: string | null;
  message: string;
}

/**
 * Empty texture path errors for a single model's numatb profiles, formatted to match the
 * backend save/repack pre-flight gate (`exvs_stage_validate_numatb_empty_params`). A profile
 * is only validated when its numatb file is present, mirroring the gate that reads the files
 * actually on disk. Reuses the same required-param logic as the export gate so the live Material
 * view and the save/repack block stay in lockstep.
 */
export function collectNumatbEmptyTexturePathErrors(
  files: { mayaFile: MatlDataJson; nustFile: MatlDataJson },
  context: { modelName: string; mayaNumatbName: string | null; nustNumatbName: string | null },
): NumatbEmptyTexturePathError[] {
  const slots = collectMissingTexturePathSlotRefsForExportSession(files.mayaFile, files.nustFile, {
    writeMayaProfile: Boolean(context.mayaNumatbName),
    writeNumatb: Boolean(context.nustNumatbName),
  });
  return slots.map((slot) => {
    const isTextures2 = slot.textureDataKind === "String1";
    const suffix = isTextures2 ? " (textures2)" : "";
    const numatbName = slot.profile === "maya" ? context.mayaNumatbName : context.nustNumatbName;
    return {
      profile: slot.profile,
      materialLabel: slot.materialLabel,
      paramId: slot.paramId,
      isTextures2,
      numatbName,
      message: `Model '${context.modelName}': material '${slot.materialLabel}' texture parameter '${slot.paramId}'${suffix} has an empty path (${numatbName}).`,
    };
  });
}

export function stripTextureUrlStringsFromNumatbFile(
  file: MatlDataJson,
  options: { removeEmptyDiffuseCubeMap?: boolean } = {},
): MatlDataJson {
  const next = cloneNumatbFile(file);
  for (const entry of next.entries) {
    if (options.removeEmptyDiffuseCubeMap) {
      entry.textures = (entry.textures ?? []).filter((row) => String(row.param_id) !== "DiffuseCubeMap");
      entry.textures2 = (entry.textures2 ?? []).filter((row) => String(row.param_id) !== "DiffuseCubeMap");
    }
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
