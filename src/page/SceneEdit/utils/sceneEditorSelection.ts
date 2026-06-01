import type { PlacementRow } from "../types/placement";
import {
  formatPlacementViewportNodeId,
  parsePlacementViewportNodeId,
} from "./placementNodeId";

export interface SceneSelectionSubModel {
  folderName: string;
  objectIndex: number;
}

type ObjectIndexSource = {
  objectIndex?: number | null;
  object_index?: number | null;
};

export type SubModelPlacementSource = ObjectIndexSource & {
  folderName?: string | null;
  folder_name?: string | null;
  bundle?: { rootFolder?: string | null } | null;
};

function lastPathSegment(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const slash = normalized.lastIndexOf("/");
  return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function readFolderName(source: SubModelPlacementSource): string | undefined {
  const camel = source.folderName?.trim();
  if (camel) return camel;
  const snake = source.folder_name?.trim();
  if (snake) return snake;
  const rootFolder = source.bundle?.rootFolder?.trim();
  if (rootFolder) return lastPathSegment(rootFolder);
  return undefined;
}

/** Resolve folderName + objectIndex for placement UI (Channel payloads may use snake_case). */
export function resolveSubModelPlacementRef(
  source: SubModelPlacementSource,
  manifest: readonly SceneSelectionSubModel[],
  streamIndex: number,
): SceneSelectionSubModel {
  const manifestByOrder = manifest[streamIndex];
  let folderName = readFolderName(source);
  let objectIndex = source.objectIndex ?? source.object_index;

  if (folderName) {
    const fromManifest = manifest.find((entry) => entry.folderName === folderName);
    if (fromManifest && (objectIndex === undefined || !Number.isFinite(objectIndex))) {
      objectIndex = fromManifest.objectIndex;
    }
  }

  if (typeof objectIndex === "number" && Number.isFinite(objectIndex) && !folderName) {
    const fromManifest = manifest.find((entry) => entry.objectIndex === objectIndex);
    if (fromManifest) folderName = fromManifest.folderName;
  }

  if (!folderName && manifestByOrder) {
    folderName = manifestByOrder.folderName;
    if (objectIndex === undefined || !Number.isFinite(objectIndex)) {
      objectIndex = manifestByOrder.objectIndex;
    }
  }

  const resolvedIndex =
    typeof objectIndex === "number" && Number.isFinite(objectIndex)
      ? objectIndex
      : streamIndex;

  return {
    folderName: folderName ?? `sub_model_${streamIndex}`,
    objectIndex: resolvedIndex,
  };
}

/** Resolve a stable sub-model object index (Channel payloads may omit camelCase fields). */
export function resolveSubModelObjectIndex(
  folderName: string,
  source: ObjectIndexSource,
  manifest: readonly SceneSelectionSubModel[],
  fallbackIndex: number,
): number {
  return resolveSubModelPlacementRef(
    { ...source, folderName: folderName || undefined },
    manifest,
    fallbackIndex,
  ).objectIndex;
}

export function normalizePlacementObjectNumber(
  value: number | null | undefined,
): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export interface SceneSelectionState {
  selectedNodeId: string | null;
  selectedPlacementIdx: number | null;
}

export function resolveSelectionForSceneNode(
  id: string | null,
  subModels: readonly SceneSelectionSubModel[],
  placementEntries: readonly PlacementRow[],
): SceneSelectionState {
  if (!id) {
    return { selectedNodeId: null, selectedPlacementIdx: null };
  }

  const effectMatch = id.match(/^__effect__(\d+)$/);
  if (effectMatch) {
    return {
      selectedNodeId: id,
      selectedPlacementIdx: Number(effectMatch[1]),
    };
  }

  const parsed = parsePlacementViewportNodeId(id);
  if (parsed) {
    return {
      selectedNodeId: id,
      selectedPlacementIdx: parsed.placementEntryIndex,
    };
  }

  const sub = subModels.find((entry) => entry.folderName === id);
  if (!sub) {
    return { selectedNodeId: id, selectedPlacementIdx: null };
  }

  const placementIdx = placementEntries.findIndex(
    (entry) =>
      entry.vdkType.toUpperCase() === "OBJECT" &&
      entry.objectNumber === sub.objectIndex,
  );

  return {
    selectedNodeId: id,
    selectedPlacementIdx: placementIdx >= 0 ? placementIdx : null,
  };
}

export function resolveNodeIdForPlacementIndex(
  placementIndex: number,
  placementEntries: readonly PlacementRow[],
  subModels: readonly SceneSelectionSubModel[],
): string | null {
  const entry = placementEntries[placementIndex];
  if (!entry) return null;
  if (entry.vdkType.toUpperCase() !== "OBJECT") return `__effect__${placementIndex}`;
  if (entry.objectNumber === null) return null;
  const sub = subModels.find((item) => item.objectIndex === entry.objectNumber);
  return sub ? formatPlacementViewportNodeId(sub.folderName, placementIndex) : null;
}

export function getRequestedSceneNodeIds({
  explicitIds,
  storeSelectedIds,
  selectedNodeId,
  selectedPlacementIdx,
  nodeIdForPlacementIndex,
}: {
  explicitIds?: readonly string[];
  storeSelectedIds: readonly string[];
  selectedNodeId: string | null;
  selectedPlacementIdx: number | null;
  nodeIdForPlacementIndex: (idx: number) => string | null;
}): string[] {
  if (explicitIds && explicitIds.length > 0) {
    return [...explicitIds];
  }

  if (storeSelectedIds.length > 0) {
    return [...storeSelectedIds];
  }

  if (selectedNodeId) {
    return [selectedNodeId];
  }

  if (selectedPlacementIdx !== null) {
    const nodeId = nodeIdForPlacementIndex(selectedPlacementIdx);
    return nodeId ? [nodeId] : [];
  }

  return [];
}
