import type { MatlDataJson, NumatbAttributeData, NumatbAttributeDataKind, NumatbProfileKind } from "./daeSsbhTypes";
import { createEmptyNumatbFile } from "./daeSsbhTypes";
import { flattenEntryToAttributes } from "./store/matlEntryFlat";
import { normalizeMatlDataJson } from "./store/numatbProfileMigration";
import {
  addEntryAttribute,
  addMaterialEntry,
  cloneProfile,
  ensureMissingMappingLabelsInProfiles,
  isTexturePathParamId,
  mirrorTexturePathOntoOtherProfile,
  removeEntryAttribute,
  removeMaterialEntry,
  updateEntryAttribute,
  updateMaterialLabel,
  updateShaderLabel,
} from "./store/numatbTemplateStoreHelpers";

export type NumatbModalBundle = {
  mayaFile: MatlDataJson;
  nustFile: MatlDataJson;
  mirrorTexturePathsAcrossProfiles: boolean;
};

export type NumatbProfilePaths = {
  maya: string | null;
  nust: string | null;
};

function cloneStructured<T>(data: T): T {
  return structuredClone(data);
}

export function cloneNumatbBundle(bundle: NumatbModalBundle): NumatbModalBundle {
  return cloneStructured(bundle);
}

export function isNumatbBundleDirty(
  base: NumatbModalBundle | null,
  draft: NumatbModalBundle | null,
): boolean {
  if (!base || !draft) return false;
  if (base.mirrorTexturePathsAcrossProfiles !== draft.mirrorTexturePathsAcrossProfiles) return true;
  return (
    JSON.stringify(normalizeMatlDataJson(base.mayaFile)) !==
      JSON.stringify(normalizeMatlDataJson(draft.mayaFile)) ||
    JSON.stringify(normalizeMatlDataJson(base.nustFile)) !==
      JSON.stringify(normalizeMatlDataJson(draft.nustFile))
  );
}

/** Heuristic: __maya__ in basename selects Maya profile; otherwise Nust. */
export function detectNumatbProfileFromPath(filePath: string): NumatbProfileKind {
  const lower = filePath.replace(/\\/g, "/").toLowerCase();
  const base = lower.split("/").pop() ?? lower;
  if (base.includes("__maya__")) {
    return "maya";
  }
  return "nust";
}

/**
 * Derive the sister numatb path by swapping __maya__ ↔ __nust__ in the filename.
 * Returns null when the path doesn't follow the naming convention.
 */
export function deriveNumatbSisterPath(
  filePath: string,
  targetProfile: NumatbProfileKind,
): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const currentProfile = detectNumatbProfileFromPath(normalized);
  if (currentProfile === targetProfile) return normalized;
  const marker = currentProfile === "maya" ? "__maya__" : "__nust__";
  const replacement = targetProfile === "maya" ? "__maya__" : "__nust__";
  const idx = normalized.toLowerCase().lastIndexOf(marker);
  if (idx < 0) return null;
  return normalized.slice(0, idx) + replacement + normalized.slice(idx + marker.length);
}

export function deriveNumatbSisterPathCandidates(
  filePath: string,
  targetProfile: NumatbProfileKind,
): string[] {
  const normalized = filePath.replace(/\\/g, "/");
  const direct = deriveNumatbSisterPath(normalized, targetProfile);
  const candidates = direct ? [direct] : [];

  if (targetProfile === "maya" && detectNumatbProfileFromPath(normalized) === "nust") {
    const baseVariantPath = normalized.replace(/_m\d+(?=__nust__)/i, "");
    if (baseVariantPath !== normalized) {
      const baseMayaPath = deriveNumatbSisterPath(baseVariantPath, "maya");
      if (baseMayaPath && !candidates.some((path) => path.toLowerCase() === baseMayaPath.toLowerCase())) {
        candidates.push(baseMayaPath);
      }
    }
  }

  return candidates;
}

function isVariantNustPath(filePath: string): boolean {
  const base = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  return /_m\d+__nust__\.numatb$/i.test(base);
}

export function resolveNumatbProfilePaths(matlPaths: string[]): NumatbProfilePaths {
  let maya: string | null = null;
  let nust: string | null = null;
  for (const path of matlPaths) {
    const profile = detectNumatbProfileFromPath(path);
    if (profile === "maya" && !maya) {
      maya = path;
    }
    if (profile === "nust" && (!nust || (isVariantNustPath(nust) && !isVariantNustPath(path)))) {
      nust = path;
    }
  }
  if (nust && !maya) {
    maya = deriveNumatbSisterPathCandidates(nust, "maya")[0] ?? null;
  }
  if (maya && !nust) {
    nust = deriveNumatbSisterPathCandidates(maya, "nust")[0] ?? null;
  }
  return { maya, nust };
}

export function buildNumatbModalBundleFromProfiles(
  mayaFile: MatlDataJson | null | undefined,
  nustFile: MatlDataJson | null | undefined,
): NumatbModalBundle {
  return {
    mayaFile: normalizeMatlDataJson(mayaFile ?? createEmptyNumatbFile()),
    nustFile: normalizeMatlDataJson(nustFile ?? createEmptyNumatbFile()),
    mirrorTexturePathsAcrossProfiles: true,
  };
}

export function buildNumatbModalBundleFromLoadedFile(
  matl: MatlDataJson,
  primaryProfile: NumatbProfileKind,
): NumatbModalBundle {
  return buildNumatbModalBundleFromProfiles(
    primaryProfile === "maya" ? matl : null,
    primaryProfile === "nust" ? matl : null,
  );
}

export function applySetMirror(bundle: NumatbModalBundle, value: boolean): NumatbModalBundle {
  return { ...bundle, mirrorTexturePathsAcrossProfiles: value };
}

export function applySetProfileFile(bundle: NumatbModalBundle, profile: NumatbProfileKind, file: MatlDataJson): NumatbModalBundle {
  const normalized = normalizeMatlDataJson(file);
  const maya = profile === "maya" ? normalized : bundle.mayaFile;
  const nust = profile === "nust" ? normalized : bundle.nustFile;
  const ensured = ensureMissingMappingLabelsInProfiles(maya, nust, []);
  return {
    ...bundle,
    mayaFile: ensured.mayaFile,
    nustFile: ensured.nustFile,
  };
}

export function applyUpdateProfileMaterialLabel(
  bundle: NumatbModalBundle,
  profile: NumatbProfileKind,
  materialIndex: number,
  nextLabel: string,
): NumatbModalBundle {
  const file = profile === "maya" ? bundle.mayaFile : bundle.nustFile;
  const nextFile = updateMaterialLabel(file, materialIndex, nextLabel);
  return profile === "maya" ? { ...bundle, mayaFile: nextFile } : { ...bundle, nustFile: nextFile };
}

export function applyUpdateProfileShaderLabel(
  bundle: NumatbModalBundle,
  profile: NumatbProfileKind,
  materialIndex: number,
  nextShaderLabel: string,
): NumatbModalBundle {
  const file = profile === "maya" ? bundle.mayaFile : bundle.nustFile;
  const nextFile = updateShaderLabel(file, materialIndex, nextShaderLabel);
  return profile === "maya" ? { ...bundle, mayaFile: nextFile } : { ...bundle, nustFile: nextFile };
}

export function applyUpdateProfileAttribute(
  bundle: NumatbModalBundle,
  profile: NumatbProfileKind,
  materialIndex: number,
  attributeIndex: number,
  data: NumatbAttributeData,
): NumatbModalBundle {
  const sourceFile = profile === "maya" ? bundle.mayaFile : bundle.nustFile;
  const entry = sourceFile.entries[materialIndex];
  if (!entry) {
    throw new Error("Material index is out of range");
  }
  const flatAttrs = flattenEntryToAttributes(entry);
  if (!flatAttrs[attributeIndex]) {
    throw new Error("Attribute index is out of range");
  }
  const paramId = flatAttrs[attributeIndex].param_id;
  const materialLabel = entry.material_label;

  let nextMaya =
    profile === "maya" ? updateEntryAttribute(bundle.mayaFile, materialIndex, attributeIndex, data) : bundle.mayaFile;
  let nextNust =
    profile === "nust" ? updateEntryAttribute(bundle.nustFile, materialIndex, attributeIndex, data) : bundle.nustFile;

  if (bundle.mirrorTexturePathsAcrossProfiles && isTexturePathParamId(paramId) && !paramId.startsWith("Use")) {
    if (profile === "maya") {
      nextNust = mirrorTexturePathOntoOtherProfile(nextNust, materialLabel, paramId, data);
    } else {
      nextMaya = mirrorTexturePathOntoOtherProfile(nextMaya, materialLabel, paramId, data);
    }
  }

  return { ...bundle, mayaFile: nextMaya, nustFile: nextNust };
}

export function applyAddProfileAttribute(
  bundle: NumatbModalBundle,
  profile: NumatbProfileKind,
  materialIndex: number,
  paramId: string,
  kind?: NumatbAttributeDataKind,
): NumatbModalBundle {
  const file = profile === "maya" ? bundle.mayaFile : bundle.nustFile;
  const nextFile = addEntryAttribute(file, materialIndex, paramId, kind);
  return profile === "maya" ? { ...bundle, mayaFile: nextFile } : { ...bundle, nustFile: nextFile };
}

export function applyRemoveProfileAttribute(
  bundle: NumatbModalBundle,
  profile: NumatbProfileKind,
  materialIndex: number,
  attributeIndex: number,
): NumatbModalBundle {
  const file = profile === "maya" ? bundle.mayaFile : bundle.nustFile;
  const nextFile = removeEntryAttribute(file, materialIndex, attributeIndex);
  return profile === "maya" ? { ...bundle, mayaFile: nextFile } : { ...bundle, nustFile: nextFile };
}

export function applyAddProfileMaterialEntry(
  bundle: NumatbModalBundle,
  profile: NumatbProfileKind,
  materialLabel: string,
): NumatbModalBundle {
  const file = profile === "maya" ? bundle.mayaFile : bundle.nustFile;
  const nextFile = addMaterialEntry(file, materialLabel, profile);
  return profile === "maya" ? { ...bundle, mayaFile: nextFile } : { ...bundle, nustFile: nextFile };
}

export function applyRemoveProfileMaterialEntry(
  bundle: NumatbModalBundle,
  profile: NumatbProfileKind,
  materialIndex: number,
): NumatbModalBundle {
  const file = profile === "maya" ? bundle.mayaFile : bundle.nustFile;
  const nextFile = removeMaterialEntry(file, materialIndex);
  return profile === "maya" ? { ...bundle, mayaFile: nextFile } : { ...bundle, nustFile: nextFile };
}

export function applyTemplateToBundle(
  bundle: NumatbModalBundle,
  mayaFile: MatlDataJson,
  nustFile: MatlDataJson,
): NumatbModalBundle {
  const ensured = ensureMissingMappingLabelsInProfiles(cloneProfile(mayaFile), cloneProfile(nustFile), []);
  return {
    ...bundle,
    mayaFile: ensured.mayaFile,
    nustFile: ensured.nustFile,
  };
}
