import type { DaeExportTarget } from "../components/DaeExportDialog";
import type { SceneExportObject } from "../components/MapViewport";
import { SSBH_MODEL_ROLES } from "../components/detail-view/sceneDetailViewTypes";
import type { StageTreeNode } from "../components/StageHierarchyTree";

export function canExportNodeRoleToDae(role: StageTreeNode["role"]): boolean {
  return (SSBH_MODEL_ROLES as readonly string[]).includes(role);
}

export interface BuildDaeExportDialogStateParams {
  nodeIds: string[];
  baseModel: { rootFolder: string } | null;
  subModels: Array<{ folderName: string; bundle: { rootFolder: string } }>;
  importedDaeIds: ReadonlySet<string>;
  exportObjects: SceneExportObject[];
}

export interface DaeExportDialogState {
  targets: DaeExportTarget[];
  threeObjects: SceneExportObject[];
}

export function buildDaeExportDialogState(
  params: BuildDaeExportDialogStateParams,
): DaeExportDialogState | null {
  const { nodeIds, baseModel, subModels, importedDaeIds, exportObjects } = params;
  const exportByName = new Map(exportObjects.map((entry) => [entry.name, entry]));
  const targets: DaeExportTarget[] = [];
  const threeObjects: SceneExportObject[] = [];
  const seen = new Set<string>();

  for (const nodeId of nodeIds) {
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);

    const safeName = nodeId.replace(/[\\/:*?"<>|]/g, "_");
    const exportEntry = exportByName.get(nodeId);

    const sub = subModels.find((model) => model.folderName === nodeId);
    if (sub) {
      targets.push({
        nodeId,
        name: safeName,
        rootPath: sub.bundle.rootFolder,
        type: "ssbh",
      });
      if (exportEntry) threeObjects.push(exportEntry);
      continue;
    }

    if (nodeId === "base" && baseModel) {
      targets.push({
        nodeId: "base",
        name: "base",
        rootPath: baseModel.rootFolder,
        type: "ssbh",
      });
      if (exportEntry) threeObjects.push(exportEntry);
      continue;
    }

    if (importedDaeIds.has(nodeId)) {
      targets.push({
        nodeId,
        name: safeName,
        rootPath: null,
        type: "imported-dae",
      });
      if (exportEntry) {
        threeObjects.push({ object: exportEntry.object, name: safeName });
      }
    }
  }

  if (targets.length === 0) return null;
  return { targets, threeObjects };
}
