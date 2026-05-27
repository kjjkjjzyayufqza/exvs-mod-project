import type { PlacementRow } from "../types/placement";
import { updateObjectNumberInRawFields } from "./ensureSkyPlacementObjectNumber";

/**
 * SubModel reference used for mapping folder names to objectIndex values.
 */
export type SubModelRef = Readonly<{ folderName: string; objectIndex: number }>;

/**
 * Describes a planned change to the sub-model list.
 */
export type SubModelChange =
  | { type: "add"; folderName: string; insertAt: number }
  | { type: "remove"; folderName: string }
  | { type: "reorder"; order: string[] };

/**
 * Given a current list of sub-models and a sequence of changes (add/remove/reorder),
 * compute the new sub-model list and remap all placement object numbers accordingly.
 *
 * This handles complex multi-step scenarios:
 * - Adding a model shifts all subsequent indices
 * - Removing a model shifts down and removes orphaned placements
 * - Reordering reassigns all indices
 * - Combinations of the above applied sequentially
 *
 * SKY entries get their objectNumber set to the total model count (convention).
 */
export function applySubModelChangesAndRemap(
  entries: readonly PlacementRow[],
  currentSubModels: readonly SubModelRef[],
  changes: readonly SubModelChange[],
): { entries: PlacementRow[]; subModels: SubModelRef[] } {
  let models = [...currentSubModels];

  for (const change of changes) {
    switch (change.type) {
      case "add": {
        const insertAt = Math.min(Math.max(0, change.insertAt), models.length);
        models.splice(insertAt, 0, { folderName: change.folderName, objectIndex: insertAt });
        // Re-index all models after insertion
        models = models.map((m, i) => ({ ...m, objectIndex: i }));
        break;
      }
      case "remove": {
        models = models
          .filter((m) => m.folderName !== change.folderName)
          .map((m, i) => ({ ...m, objectIndex: i }));
        break;
      }
      case "reorder": {
        const byName = new Map(models.map((m) => [m.folderName, m]));
        const reordered: SubModelRef[] = [];
        for (const name of change.order) {
          const m = byName.get(name);
          if (m) reordered.push({ folderName: m.folderName, objectIndex: reordered.length });
        }
        // Append any models not in the order list (defensive)
        for (const m of models) {
          if (!change.order.includes(m.folderName)) {
            reordered.push({ folderName: m.folderName, objectIndex: reordered.length });
          }
        }
        models = reordered;
        break;
      }
    }
  }

  // Build folder→newIndex mapping from the final model list
  const folderToNewIndex = new Map<string, number>();
  for (const m of models) {
    folderToNewIndex.set(m.folderName, m.objectIndex);
  }

  // Build oldIndex→folder mapping from original
  const oldIndexToFolder = new Map<number, string>();
  for (const sm of currentSubModels) {
    oldIndexToFolder.set(sm.objectIndex, sm.folderName);
  }

  const totalModelCount = models.length;
  const result: PlacementRow[] = [];

  for (const entry of entries) {
    const upperType = entry.vdkType.toUpperCase();

    // SKY always gets objectNumber = totalModelCount
    if (upperType === "SKY") {
      const newNum = totalModelCount;
      if (entry.objectNumber === newNum) {
        result.push(entry);
      } else {
        const rawFields = updateObjectNumberInRawFields([...entry.rawFields], newNum);
        result.push({ ...entry, objectNumber: newNum, rawFields });
      }
      continue;
    }

    // Non-OBJECT types pass through unchanged
    if (upperType !== "OBJECT") {
      result.push(entry);
      continue;
    }

    // OBJECT with no objectNumber — pass through
    if (entry.objectNumber === null) {
      result.push(entry);
      continue;
    }

    // Resolve old index to folder name
    const folderName = oldIndexToFolder.get(entry.objectNumber);
    if (folderName === undefined) {
      // Unknown index — keep as-is (defensive)
      result.push(entry);
      continue;
    }

    // Check if this folder still exists in new model list
    const newIndex = folderToNewIndex.get(folderName);
    if (newIndex === undefined) {
      // Model was removed — drop this placement
      continue;
    }

    // Remap if index changed
    if (newIndex === entry.objectNumber) {
      result.push(entry);
    } else {
      const rawFields = updateObjectNumberInRawFields([...entry.rawFields], newIndex);
      result.push({ ...entry, objectNumber: newIndex, rawFields });
    }
  }

  return { entries: result, subModels: models };
}

/**
 * Creates default placement entries for a newly added model.
 * Returns a single OBJECT placement at origin with the given objectIndex.
 */
export function createDefaultPlacementForModel(
  folderName: string,
  objectIndex: number,
): PlacementRow {
  return {
    vdkType: "OBJECT",
    objectNumber: objectIndex,
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    rawFields: [
      "VDK_TYPE",
      "OBJECT",
      "VDK_INITIAL_SPAWN",
      "TRUE",
      "VDK_POSITION_X",
      "0.0",
      "VDK_POSITION_Y",
      "0.0",
      "VDK_POSITION_Z",
      "0.0",
      "VDK_ROTATION_X",
      "0.0",
      "VDK_ROTATION_Y",
      "0.0",
      "VDK_ROTATION_Z",
      "0.0",
      "VDK_PLACEMENT_NAME",
      "",
      "VDK_OBJECTNUMBER",
      String(objectIndex),
      "VDK_PROGRAMID",
      "0",
      "VDK_HITPOINT",
      "UNBREAKABLE",
      "VDK_SHADOW_CAST",
      "TRUE",
    ],
  };
}
