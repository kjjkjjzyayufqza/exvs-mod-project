import type { PlacementRow } from "../types/placement";

const VDK_LABEL_OVERRIDES: Record<string, string> = {
  VDK_TYPE: "Type",
  VDK_OBJECTNUMBER: "Object index",
  VDK_PLACEMENT_NAME: "Placement name",
  VDK_EFFECT_ID: "Effect id",
  VDK_PROP_ID: "Prop id",
  VDK_INITIAL_SPAWN: "Initial spawn",
};

export function formatPlacementFieldLabel(key: string): string {
  const upper = key.trim().toUpperCase();
  if (!upper) return "Field";
  if (VDK_LABEL_OVERRIDES[upper]) return VDK_LABEL_OVERRIDES[upper];

  const body = upper.startsWith("VDK_") ? upper.slice(4) : upper;
  return body
    .split("_")
    .filter(Boolean)
    .map((part) => {
      if (/^\d+$/.test(part)) return part;
      return part.charAt(0) + part.slice(1).toLowerCase();
    })
    .join(" ");
}

export function getPlacementDisplayName(entry: PlacementRow): string | null {
  for (let i = 0; i + 1 < entry.rawFields.length; i += 2) {
    if (entry.rawFields[i].trim().toUpperCase() === "VDK_PLACEMENT_NAME") {
      const value = entry.rawFields[i + 1]?.trim();
      return value ? value : null;
    }
  }
  return null;
}

export function summarizePlacementRow(
  entry: PlacementRow,
  index: number,
  subModels: Array<{ folderName: string; objectIndex: number }>,
): string {
  const customName = getPlacementDisplayName(entry);
  if (customName) return customName;

  const type = entry.vdkType?.toUpperCase() ?? "ROW";
  if (entry.objectNumber !== null && type === "OBJECT") {
    const sub = subModels.find((sm) => sm.objectIndex === entry.objectNumber);
    if (sub) return sub.folderName;
    return `Object #${entry.objectNumber}`;
  }

  if (entry.objectNumber !== null) {
    return `${type} #${entry.objectNumber}`;
  }

  return `${type} row`;
}
