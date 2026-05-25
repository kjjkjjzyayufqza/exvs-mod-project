import type { PlacementRow } from "../types/placement";

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
  for (let j = 0; j + 1 < rawFields.length; j += 2) {
    const k = rawFields[j].trim().toUpperCase();
    for (const cand of keyCandidates) {
      if (k === cand.toUpperCase()) {
        const next = [...rawFields];
        next[j + 1] = valueStr;
        return next;
      }
    }
  }
  return rawFields;
}

function upsertKvPairValue(rawFields: string[], keyCandidates: string[], valueStr: string): string[] {
  const updated = setKvPairValue(rawFields, keyCandidates, valueStr);
  if (updated !== rawFields) return updated;
  const key = keyCandidates[0];
  if (!key) return rawFields;
  return [...rawFields, key, valueStr];
}

export function patchPlacementRawFieldsForNumericField(
  entry: PlacementRow,
  field: keyof typeof FIELD_TO_HEADER_ALIASES,
  value: number,
  placementColMap: Record<string, number>,
): PlacementRow {
  const valueStr =
    Number.isFinite(value) && value === Math.trunc(value)
      ? String(Math.trunc(value))
      : String(value);
  const aliases = FIELD_TO_HEADER_ALIASES[field];

  for (const col of aliases) {
    const colIdx = placementColMap[col.toUpperCase()];
    if (colIdx !== undefined && entry.rawFields.length > colIdx) {
      const rawFields = [...entry.rawFields];
      rawFields[colIdx] = valueStr;
      return { ...entry, rawFields, [field]: value };
    }
  }

  const rawFieldsKv = upsertKvPairValue(entry.rawFields, aliases, valueStr);
  if (rawFieldsKv !== entry.rawFields) {
    return { ...entry, rawFields: rawFieldsKv, [field]: value };
  }

  return { ...entry, [field]: value };
}

const TRANSFORM_NUMERIC_FIELDS: (keyof typeof FIELD_TO_HEADER_ALIASES)[] = [
  "posX",
  "posY",
  "posZ",
  "rotX",
  "rotY",
  "rotZ",
  "scaleX",
  "scaleY",
  "scaleZ",
];

/** Apply all placement transform components (used by viewport TransformControls). */
export function patchPlacementRowTransform(
  entry: PlacementRow,
  t: Pick<
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
  placementColMap: Record<string, number>,
): PlacementRow {
  return TRANSFORM_NUMERIC_FIELDS.reduce(
    (acc, field) =>
      patchPlacementRawFieldsForNumericField(acc, field, t[field], placementColMap),
    entry,
  );
}

const KV_KEY_TO_NUMERIC_FIELD: Record<string, keyof Pick<PlacementRow, "posX" | "posY" | "posZ" | "rotX" | "rotY" | "rotZ" | "scaleX" | "scaleY" | "scaleZ">> = {
  VDK_POS_X: "posX", VDK_POSITION_X: "posX",
  VDK_POS_Y: "posY", VDK_POSITION_Y: "posY",
  VDK_POS_Z: "posZ", VDK_POSITION_Z: "posZ",
  VDK_ROT_X: "rotX", VDK_ROTATION_X: "rotX",
  VDK_ROT_Y: "rotY", VDK_ROTATION_Y: "rotY",
  VDK_ROT_Z: "rotZ", VDK_ROTATION_Z: "rotZ",
  VDK_SCALE_X: "scaleX",
  VDK_SCALE_Y: "scaleY",
  VDK_SCALE_Z: "scaleZ",
};

export function syncParsedFieldsFromRaw(row: PlacementRow): PlacementRow {
  let vdkType = row.vdkType;
  let objectNumber = row.objectNumber;
  const transform: Record<string, number> = {};

  for (let i = 0; i + 1 < row.rawFields.length; i += 2) {
    const key = row.rawFields[i].trim().toUpperCase();
    const val = row.rawFields[i + 1];

    if (key === "VDK_TYPE") {
      vdkType = val.trim().toUpperCase();
    } else if (key === "VDK_OBJECTNUMBER") {
      const parsed = Number.parseInt(val, 10);
      objectNumber = Number.isFinite(parsed) ? parsed : null;
    } else {
      const numField = KV_KEY_TO_NUMERIC_FIELD[key];
      if (numField) {
        const n = Number.parseFloat(val);
        if (Number.isFinite(n)) transform[numField] = n;
      }
    }
  }

  return {
    ...row,
    vdkType,
    objectNumber,
    posX: transform.posX ?? row.posX,
    posY: transform.posY ?? row.posY,
    posZ: transform.posZ ?? row.posZ,
    rotX: transform.rotX ?? row.rotX,
    rotY: transform.rotY ?? row.rotY,
    rotZ: transform.rotZ ?? row.rotZ,
    scaleX: transform.scaleX ?? row.scaleX,
    scaleY: transform.scaleY ?? row.scaleY,
    scaleZ: transform.scaleZ ?? row.scaleZ,
  };
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
