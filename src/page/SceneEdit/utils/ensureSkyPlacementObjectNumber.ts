import type { PlacementRow } from "../types/placement";

export function ensureSkyPlacementObjectNumber(
  entries: PlacementRow[],
  modelFolderCount: number,
): PlacementRow[] {
  if (!entries.some((e) => e.vdkType.toUpperCase() === "SKY")) {
    return entries;
  }

  return entries.map((entry) => {
    if (entry.vdkType.toUpperCase() !== "SKY") return entry;
    if (entry.objectNumber === modelFolderCount) return entry;

    const rawFields = updateObjectNumberInRawFields(
      [...entry.rawFields],
      modelFolderCount,
    );
    return { ...entry, objectNumber: modelFolderCount, rawFields };
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
