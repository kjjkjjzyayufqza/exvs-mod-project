import type { PlacementRow } from "../types/placement";
import { updateObjectNumberInRawFields } from "./ensureSkyPlacementObjectNumber";

type SubModelRef = Readonly<{ folderName: string; objectIndex: number }>;

export function remapPlacementObjectNumbers(
  entries: readonly PlacementRow[],
  oldSubModels: readonly SubModelRef[],
  newSubModels: readonly SubModelRef[],
): PlacementRow[] {
  const oldIndexToFolder = new Map<number, string>();
  for (const sm of oldSubModels) {
    oldIndexToFolder.set(sm.objectIndex, sm.folderName);
  }

  const folderToNewIndex = new Map<string, number>();
  for (const sm of newSubModels) {
    folderToNewIndex.set(sm.folderName, sm.objectIndex);
  }

  const result: PlacementRow[] = [];

  for (const entry of entries) {
    if (entry.vdkType.toUpperCase() !== "OBJECT") {
      result.push(entry);
      continue;
    }

    if (entry.objectNumber === null) {
      result.push(entry);
      continue;
    }

    const folderName = oldIndexToFolder.get(entry.objectNumber);
    if (folderName === undefined) {
      result.push(entry);
      continue;
    }

    const newIndex = folderToNewIndex.get(folderName);
    if (newIndex === undefined) {
      continue;
    }

    if (newIndex === entry.objectNumber) {
      result.push(entry);
      continue;
    }

    const rawFields = updateObjectNumberInRawFields(
      [...entry.rawFields],
      newIndex,
    );
    result.push({ ...entry, objectNumber: newIndex, rawFields });
  }

  return result;
}
