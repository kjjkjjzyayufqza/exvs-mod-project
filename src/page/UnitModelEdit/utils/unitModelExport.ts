import type { Object3D } from "three";

import type { DaeExportTarget } from "@/page/SceneEdit/components/DaeExportDialog";
import type { SceneExportObject } from "@/page/SceneEdit/components/MapViewport";
import type { SsbhModelPreviewInstance } from "@/components/ssbh-model-preview/types";

export type UnitModelExportSkipReason = "no_disk_root" | "no_viewport_object";

export type UnitModelExportSkippedInstance = {
  instanceId: string;
  label: string;
  reason: UnitModelExportSkipReason;
};

export type UnitModelExportDialogState = {
  targets: DaeExportTarget[];
  threeObjects: SceneExportObject[];
  skipped: UnitModelExportSkippedInstance[];
};

export type UnitModelExportCapabilities = {
  daeCount: number;
  fbxCount: number;
  canExport: boolean;
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

export function resolveUnitModelInstanceLabel(inst: SsbhModelPreviewInstance): string {
  const fromLabel = inst.displayLabel?.trim();
  if (fromLabel) return fromLabel;
  const fromRoot = inst.bundle.rootFolder.replace(/[/\\]+$/, "").split(/[/\\]/).pop();
  if (fromRoot) return fromRoot;
  return inst.id;
}

export function isUnitModelInstanceDaeExportable(inst: SsbhModelPreviewInstance): boolean {
  return inst.bundle.sourceKind === "disk" && Boolean(inst.bundle.rootFolder?.trim());
}

export function getUnitModelExportCapabilities(
  instances: readonly SsbhModelPreviewInstance[],
  exportObjectIds: ReadonlySet<string>,
): UnitModelExportCapabilities {
  let daeCount = 0;
  let fbxCount = 0;
  for (const inst of instances) {
    if (isUnitModelInstanceDaeExportable(inst)) {
      daeCount += 1;
    }
    if (exportObjectIds.has(inst.id)) {
      fbxCount += 1;
    }
  }
  return {
    daeCount,
    fbxCount,
    canExport: daeCount > 0 || fbxCount > 0,
  };
}

export function buildUnitModelExportDialogState(
  instances: readonly SsbhModelPreviewInstance[],
  exportObjectsByInstanceId: ReadonlyMap<string, { object: Object3D }>,
): UnitModelExportDialogState | null {
  const targets: DaeExportTarget[] = [];
  const threeObjects: SceneExportObject[] = [];
  const skipped: UnitModelExportSkippedInstance[] = [];
  const usedNames = new Set<string>();

  for (const inst of instances) {
    const label = resolveUnitModelInstanceLabel(inst);
    const daeExportable = isUnitModelInstanceDaeExportable(inst);
    const viewportObject = exportObjectsByInstanceId.get(inst.id)?.object ?? null;

    if (!daeExportable && !viewportObject) {
      skipped.push({
        instanceId: inst.id,
        label,
        reason: inst.bundle.sourceKind !== "disk" ? "no_disk_root" : "no_viewport_object",
      });
      continue;
    }

    const exportName = nextUniqueExportName(label, usedNames);

    if (daeExportable) {
      targets.push({
        nodeId: inst.id,
        name: exportName,
        rootPath: inst.bundle.rootFolder,
        type: "ssbh",
      });
    } else {
      targets.push({
        nodeId: inst.id,
        name: exportName,
        rootPath: null,
        type: "ssbh",
      });
    }

    if (viewportObject) {
      threeObjects.push({ object: viewportObject, name: inst.id });
    }
  }

  if (targets.length === 0 && threeObjects.length === 0) {
    return null;
  }

  return { targets, threeObjects, skipped };
}
