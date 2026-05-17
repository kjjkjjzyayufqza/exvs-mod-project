import type { PlacementRow } from "../types/placement";
import { clonePlacementRow } from "./patchPlacementRawFields";

function assertValidIndex(entries: readonly PlacementRow[], index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) {
    throw new Error(`Invalid placement row index: ${index}`);
  }
}

export function duplicatePlacementAt(
  entries: readonly PlacementRow[],
  index: number,
): { entries: PlacementRow[]; insertedIndex: number; insertedRow: PlacementRow } {
  assertValidIndex(entries, index);
  const source = entries[index];
  if (!source) {
    throw new Error(`Invalid placement row index: ${index}`);
  }
  if (source.vdkType.toUpperCase() !== "OBJECT") {
    throw new Error("Only OBJECT placement rows can be duplicated.");
  }

  const insertedRow = clonePlacementRow(source);
  const insertedIndex = index + 1;
  const next = [...entries];
  next.splice(insertedIndex, 0, insertedRow);
  return { entries: next, insertedIndex, insertedRow };
}

export function deletePlacementAt(
  entries: readonly PlacementRow[],
  index: number,
): { entries: PlacementRow[]; deleted: PlacementRow } {
  assertValidIndex(entries, index);
  const deleted = entries[index];
  if (!deleted) {
    throw new Error(`Invalid placement row index: ${index}`);
  }
  return {
    entries: entries.filter((_, i) => i !== index),
    deleted,
  };
}

export function deletePlacementsAt(
  entries: readonly PlacementRow[],
  indices: readonly number[],
): { entries: PlacementRow[]; deleted: Array<{ index: number; row: PlacementRow }> } {
  const uniqueIndices = [...new Set(indices)].sort((a, b) => a - b);
  if (uniqueIndices.length === 0) {
    throw new Error("Cannot delete an empty placement selection.");
  }
  for (const index of uniqueIndices) {
    assertValidIndex(entries, index);
  }

  const deleteSet = new Set(uniqueIndices);
  return {
    entries: entries.filter((_, index) => !deleteSet.has(index)),
    deleted: uniqueIndices.map((index) => ({
      index,
      row: clonePlacementRow(entries[index]!),
    })),
  };
}

export function pastePlacementsAfter(
  entries: readonly PlacementRow[],
  copiedRows: readonly PlacementRow[],
  afterIndex: number | null,
): { entries: PlacementRow[]; insertedStart: number; insertedRows: PlacementRow[] } {
  if (copiedRows.length === 0) {
    throw new Error("Cannot paste an empty placement selection.");
  }
  const insertedStart = afterIndex === null ? entries.length : afterIndex + 1;
  if (insertedStart < 0 || insertedStart > entries.length) {
    throw new Error(`Invalid placement paste index: ${afterIndex}`);
  }

  const insertedRows = copiedRows.map((entry) => clonePlacementRow(entry));
  const next = [...entries];
  next.splice(insertedStart, 0, ...insertedRows);
  return { entries: next, insertedStart, insertedRows };
}
