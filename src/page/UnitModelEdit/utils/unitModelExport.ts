import { invoke } from "@tauri-apps/api/core";

import type { DaeExportTarget } from "@/page/SceneEdit/components/DaeExportDialog";
import type { SsbhModelPreviewInstance } from "@/components/ssbh-model-preview/types";

export type UnitModelExportSkipReason = "memory_source" | "missing_modl_path";

export type UnitModelExportSkippedInstance = {
  instanceId: string;
  label: string;
  reason: UnitModelExportSkipReason;
};

export type UnitModelExportDialogState = {
  targets: DaeExportTarget[];
  skipped: UnitModelExportSkippedInstance[];
};

export type UnitModelExportCapabilities = {
  fbxCount: number;
  canExport: boolean;
};

export type UnitModelFbxExportEntry = {
  rootPath: string;
  outputName: string;
};

export type UnitModelFbxExportedFile = {
  name: string;
  path: string;
  meshCount: number;
  vertexCount: number;
  textureCount: number;
};

export type UnitModelFbxExportResult = {
  exported: UnitModelFbxExportedFile[];
  errors: string[];
  totalExported: number;
  totalFailed: number;
};

function sanitizeExportBaseName(value: string): string {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]/g, "_");
  return cleaned || "export";
}

export function nextUniqueExportName(baseName: string, usedNames: Set<string>): string {
  let candidate = sanitizeExportBaseName(baseName);
  const keyOf = (name: string) => name.toLowerCase();
  if (!usedNames.has(keyOf(candidate))) {
    usedNames.add(keyOf(candidate));
    return candidate;
  }
  const extIdx = candidate.lastIndexOf(".");
  const stem = extIdx > 0 ? candidate.slice(0, extIdx) : candidate;
  const ext = extIdx > 0 ? candidate.slice(extIdx) : "";
  let index = 1;
  do {
    candidate = `${stem}_${index}${ext}`;
    index += 1;
  } while (usedNames.has(keyOf(candidate)));
  usedNames.add(keyOf(candidate));
  return candidate;
}

/**
 * Extract the Unit model package identity: the `models/<folder>/` directory name.
 * Structure-JSON model groups and the Model Manager list use this name. The `.numdlb`
 * stem can differ after renames (e.g. folder `015gndmuc_…_body_normal` with
 * `026gnbelt_….numdlb` inside) and must not be treated as the package identity.
 */
export function resolveUnitModelFolderNameFromPath(path: string): string | null {
  const parts = path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
  const modelsIdx = parts.findIndex((part) => part.toLowerCase() === "models");
  if (modelsIdx >= 0 && modelsIdx + 1 < parts.length) {
    const folder = parts[modelsIdx + 1];
    return folder.length > 0 ? folder : null;
  }
  // Fallback: parent directory of a .numdlb, or the last path segment for a folder path.
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1]!;
  if (/\.numdlb$/i.test(last) && parts.length >= 2) {
    return parts[parts.length - 2] ?? null;
  }
  return last;
}

function collectUnitModelInstanceIdentityKeys(inst: SsbhModelPreviewInstance): string[] {
  const keys: string[] = [];
  const push = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (keys.includes(lower)) return;
    keys.push(lower);
  };

  // Package identity first (structure / Model Manager label).
  push(resolveUnitModelFolderNameFromPath(inst.bundle.rootFolder));
  push(resolveUnitModelFolderNameFromPath(inst.modlPath));
  // Preview display label is usually the .numdlb stem — keep as secondary match.
  push(inst.displayLabel);
  push(inst.id);
  return keys;
}

export function filterUnitModelInstancesByLabel(
  instances: readonly SsbhModelPreviewInstance[],
  modelLabel: string,
): SsbhModelPreviewInstance[] {
  const key = modelLabel.trim().toLowerCase();
  if (!key) return [];
  return instances.filter((inst) => collectUnitModelInstanceIdentityKeys(inst).includes(key));
}

/**
 * Canonical export / list identity for a Unit model preview instance.
 * Prefers the `models/<folder>/` name over the `.numdlb` stem so it matches
 * Model Manager labels from `_structure.json`.
 */
export function resolveUnitModelInstanceLabel(inst: SsbhModelPreviewInstance): string {
  const fromModelsPath =
    resolveUnitModelFolderNameFromPath(inst.bundle.rootFolder) ??
    resolveUnitModelFolderNameFromPath(inst.modlPath);
  if (fromModelsPath) return fromModelsPath;
  const fromLabel = inst.displayLabel?.trim();
  if (fromLabel) return fromLabel;
  return inst.id;
}

/** Absolute folder path for `{modelRoot}/models/{modelLabel}` (export accepts a folder). */
export function resolveUnitModelDiskModelFolderPath(
  modelRoot: string,
  modelLabel: string,
): string | null {
  const root = modelRoot.trim().replace(/[\\/]+$/, "");
  const label = modelLabel.trim();
  if (!root || !label) return null;
  if (/[\\/]/.test(label) || label === "." || label === "..") return null;
  const sep = root.includes("\\") ? "\\" : "/";
  return `${root}${sep}models${sep}${label}`;
}

export function buildUnitModelDiskExportDialogState(
  modelRoot: string,
  modelLabel: string,
): UnitModelExportDialogState | null {
  const folderPath = resolveUnitModelDiskModelFolderPath(modelRoot, modelLabel);
  if (!folderPath) return null;
  const label = modelLabel.trim();
  return {
    targets: [
      {
        nodeId: `disk:${label}`,
        name: nextUniqueExportName(label, new Set()),
        rootPath: folderPath,
        type: "ssbh",
      },
    ],
    skipped: [],
  };
}

export function isUnitModelInstanceFbxExportable(inst: SsbhModelPreviewInstance): boolean {
  return inst.bundle.sourceKind === "disk" && Boolean(inst.modlPath.trim());
}

export function getUnitModelExportCapabilities(
  instances: readonly SsbhModelPreviewInstance[],
): UnitModelExportCapabilities {
  const fbxCount = instances.filter(isUnitModelInstanceFbxExportable).length;
  return {
    fbxCount,
    canExport: fbxCount > 0,
  };
}

export function buildUnitModelExportDialogState(
  instances: readonly SsbhModelPreviewInstance[],
): UnitModelExportDialogState | null {
  const targets: DaeExportTarget[] = [];
  const skipped: UnitModelExportSkippedInstance[] = [];
  const usedNames = new Set<string>();

  for (const inst of instances) {
    const label = resolveUnitModelInstanceLabel(inst);
    if (inst.bundle.sourceKind !== "disk") {
      skipped.push({ instanceId: inst.id, label, reason: "memory_source" });
      continue;
    }
    const modlPath = inst.modlPath.trim();
    if (!modlPath) {
      skipped.push({ instanceId: inst.id, label, reason: "missing_modl_path" });
      continue;
    }

    targets.push({
      nodeId: inst.id,
      name: nextUniqueExportName(label, usedNames),
      rootPath: modlPath,
      type: "ssbh",
    });
  }

  return targets.length > 0 ? { targets, skipped } : null;
}

export async function exportUnitModelsAsFbx(
  entries: UnitModelFbxExportEntry[],
  outputDir: string,
  options: {
    scaleFactor: number;
    upAxis: "y_up" | "z_up";
    exportTextures: boolean;
  },
): Promise<UnitModelFbxExportResult> {
  return invoke<UnitModelFbxExportResult>("unit_model_batch_export_fbx", {
    outputDir,
    entries,
    scaleFactor: options.scaleFactor,
    upAxis: options.upAxis,
    exportTextures: options.exportTextures,
  });
}
