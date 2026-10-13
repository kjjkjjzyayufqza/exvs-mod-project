import type { PlacementRow } from "../types/placement";

export type StageSubModelRef = Readonly<{
  folderName: string;
  objectIndex: number;
}>;

/**
 * Sky `VDK_OBJECTNUMBER` must match `load_stage_bundle` sky `objectIndex`
 * (= non-sky model folder count on disk), not merely `subModels.length - 1`.
 */
export function resolveSkyPlacementObjectNumber(
  subModels: readonly StageSubModelRef[],
): number {
  const sky = subModels.find((model) => model.folderName.toLowerCase() === "sky");
  if (sky) {
    return sky.objectIndex;
  }
  return subModels.filter((model) => model.folderName.toLowerCase() !== "sky").length;
}

/**
 * An OBJECT/PROP row must not keep the sky index. Imports named `zzzz_import_*`
 * sort after `sky` and take the index sky used to hold; rows left on the sky
 * number are moved onto those unused import indices.
 */
export function reassignObjectPlacementsOffSky(
  entries: PlacementRow[],
  subModels: readonly StageSubModelRef[],
): PlacementRow[] {
  const sky = subModels.find((model) => model.folderName.toLowerCase() === "sky");
  if (!sky) return entries;

  const skyNumber = sky.objectIndex;
  const claimed = new Set<number>();
  for (const entry of entries) {
    const type = entry.vdkType.toUpperCase();
    if (type !== "OBJECT" && type !== "PROP") continue;
    if (entry.objectNumber === null || entry.objectNumber === skyNumber) continue;
    claimed.add(entry.objectNumber);
  }

  const imports = subModels
    .filter(
      (model) =>
        model.folderName.toLowerCase() !== "sky" &&
        model.folderName.toLowerCase().startsWith("zzzz_import") &&
        model.objectIndex !== skyNumber,
    )
    .sort((a, b) => a.objectIndex - b.objectIndex);
  const unused = imports.filter((model) => !claimed.has(model.objectIndex));
  // Extra instances of one model share its index. A row already on that index
  // must not leave the sky-numbered copy in place.
  const pool = unused.length > 0 ? unused : imports;

  let cursor = 0;
  return entries.map((entry) => {
    const type = entry.vdkType.toUpperCase();
    if ((type !== "OBJECT" && type !== "PROP") || entry.objectNumber !== skyNumber) {
      return entry;
    }
    if (pool.length === 0) return entry;
    const target = pool[Math.min(cursor, pool.length - 1)];
    if (cursor < pool.length) cursor += 1;
    return {
      ...entry,
      objectNumber: target.objectIndex,
      rawFields: updateObjectNumberInRawFields([...entry.rawFields], target.objectIndex),
    };
  });
}

export function ensureSkyPlacementObjectNumber(
  entries: PlacementRow[],
  skyPlacementObjectNumber: number,
): PlacementRow[] {
  if (!entries.some((e) => e.vdkType.toUpperCase() === "SKY")) {
    return entries;
  }

  return entries.map((entry) => {
    if (entry.vdkType.toUpperCase() !== "SKY") return entry;
    if (entry.objectNumber === skyPlacementObjectNumber) return entry;

    const rawFields = updateObjectNumberInRawFields(
      [...entry.rawFields],
      skyPlacementObjectNumber,
    );
    return { ...entry, objectNumber: skyPlacementObjectNumber, rawFields };
  });
}

export function updateObjectNumberInRawFields(
  rawFields: string[],
  value: number,
): string[] {
  const valueStr = String(value);
  for (let i = 0; i + 1 < rawFields.length; i += 2) {
    if (rawFields[i].trim().toUpperCase() === "VDK_OBJECTNUMBER") {
      rawFields[i + 1] = valueStr;
      return rawFields;
    }
  }
  return [...rawFields, "VDK_OBJECTNUMBER", valueStr];
}
