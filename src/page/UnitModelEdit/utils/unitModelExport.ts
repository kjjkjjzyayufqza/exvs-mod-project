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

export function filterUnitModelInstancesByLabel(
  instances: readonly SsbhModelPreviewInstance[],
  modelLabel: string,
): SsbhModelPreviewInstance[] {
  const key = modelLabel.trim().toLowerCase();
  if (!key) return [];
  return instances.filter(
    (inst) => resolveUnitModelInstanceLabel(inst).toLowerCase() === key,
  );
}

export function resolveUnitModelInstanceLabel(inst: SsbhModelPreviewInstance): string {
  const fromLabel = inst.displayLabel?.trim();
  if (fromLabel) return fromLabel;
  const fromRoot = inst.bundle.rootFolder.replace(/[/\\]+$/, "").split(/[/\\]/).pop();
  if (fromRoot) return fromRoot;
  return inst.id;
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
