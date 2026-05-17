import type { PlacementRow } from "../types/placement";

export type SubModelPlacementOrderRef = {
  objectIndex: number;
};

/**
 * Keeps non-OBJECT rows in place; reorders OBJECT rows so those aligned with
 * `subModels` appear in sub-model iteration order at the original OBJECT slots.
 */
export function reorderPlacementEntriesBySubModels(
  entries: PlacementRow[],
  subModels: SubModelPlacementOrderRef[],
): PlacementRow[] {
  const objectEntryIndices: number[] = [];
  entries.forEach((e, i) => {
    if (e.vdkType.toUpperCase() === "OBJECT" && e.objectNumber !== null) {
      objectEntryIndices.push(i);
    }
  });

  const queues = new Map<number, number[]>();
  for (const i of objectEntryIndices) {
    const n = entries[i].objectNumber!;
    let q = queues.get(n);
    if (!q) {
      q = [];
      queues.set(n, q);
    }
    q.push(i);
  }

  const pickOrder: number[] = [];
  const picked = new Set<number>();
  for (const sub of subModels) {
    const q = queues.get(sub.objectIndex);
    if (q && q.length > 0) {
      const idx = q.shift()!;
      pickOrder.push(idx);
      picked.add(idx);
    }
  }
  for (const i of objectEntryIndices) {
    if (!picked.has(i)) pickOrder.push(i);
  }

  let pickPtr = 0;
  const result: PlacementRow[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.vdkType.toUpperCase() === "OBJECT" && e.objectNumber !== null) {
      result.push(entries[pickOrder[pickPtr++]]);
    } else {
      result.push(e);
    }
  }
  return result;
}
