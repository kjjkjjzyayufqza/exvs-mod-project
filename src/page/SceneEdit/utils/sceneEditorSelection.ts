import type { PlacementRow } from "../types/placement";
import {
  formatPlacementViewportNodeId,
  parsePlacementViewportNodeId,
} from "./placementNodeId";

export interface SceneSelectionSubModel {
  folderName: string;
  objectIndex: number;
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
