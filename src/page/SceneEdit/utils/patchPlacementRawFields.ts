import type { PlacementRow } from "../components/PlacementPanel";

/** Column names tried in order for tabular placement.csv headers. */
const FIELD_TO_HEADER_ALIASES: Record<
  keyof Pick<
    PlacementRow,
    | "posX"
    | "posY"
    | "posZ"
    | "rotX"
    | "rotY"
    | "rotZ"
    | "scaleX"
    | "scaleY"
    | "scaleZ"
  >,
  string[]
> = {
  posX: ["VDK_POS_X", "VDK_POSITION_X"],
  posY: ["VDK_POS_Y", "VDK_POSITION_Y"],
  posZ: ["VDK_POS_Z", "VDK_POSITION_Z"],
  rotX: ["VDK_ROT_X", "VDK_ROTATION_X"],
  rotY: ["VDK_ROT_Y", "VDK_ROTATION_Y"],
  rotZ: ["VDK_ROT_Z", "VDK_ROTATION_Z"],
  scaleX: ["VDK_SCALE_X"],
  scaleY: ["VDK_SCALE_Y"],
  scaleZ: ["VDK_SCALE_Z"],
};

function setKvPairValue(rawFields: string[], keyCandidates: string[], valueStr: string): string[] {
  const next = [...rawFields];
  for (let j = 0; j + 1 < next.length; j += 2) {
    const k = next[j].trim().toUpperCase();
    for (const cand of keyCandidates) {
      if (k === cand.toUpperCase()) {
        next[j + 1] = valueStr;
        return next;
      }
    }
  }
  return next;
}

export function patchPlacementRawFieldsForNumericField(
  entry: PlacementRow,
  field: keyof typeof FIELD_TO_HEADER_ALIASES,
  value: number,
  placementColMap: Record<string, number>,
): PlacementRow {
  const valueStr = String(value);
  const aliases = FIELD_TO_HEADER_ALIASES[field];

  for (const col of aliases) {
    const colIdx = placementColMap[col.toUpperCase()];
    if (colIdx !== undefined && entry.rawFields.length > colIdx) {
      const rawFields = [...entry.rawFields];
      rawFields[colIdx] = valueStr;
      return { ...entry, rawFields, [field]: value };
    }
  }

  const rawFieldsKv = setKvPairValue(entry.rawFields, aliases, valueStr);
  if (rawFieldsKv !== entry.rawFields) {
    return { ...entry, rawFields: rawFieldsKv, [field]: value };
  }

  return { ...entry, [field]: value };
}

export function clonePlacementRow(source: PlacementRow): PlacementRow {
  return {
    vdkType: source.vdkType,
    objectNumber: source.objectNumber,
    posX: source.posX,
    posY: source.posY,
    posZ: source.posZ,
    rotX: source.rotX,
    rotY: source.rotY,
    rotZ: source.rotZ,
    scaleX: source.scaleX,
    scaleY: source.scaleY,
    scaleZ: source.scaleZ,
    rawFields: [...source.rawFields],
  };
}
