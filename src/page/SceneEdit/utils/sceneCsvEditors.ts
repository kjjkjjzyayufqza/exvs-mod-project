import type { GraphicParam } from "../components/GraphicParamPanel";
import type { PlacementRow } from "../components/PlacementPanel";

export function applyGraphicParamSelection(
  rows: readonly GraphicParam[],
  selectedKeys: ReadonlySet<string>,
): GraphicParam[] {
  return rows
    .filter((row) => selectedKeys.has(row.key))
    .map((row) => ({ ...row }));
}

export function addGraphicParam(
  rows: readonly GraphicParam[],
  key: string,
  value: string,
): GraphicParam[] {
  const trimmedKey = key.trim();
  if (!trimmedKey) {
    throw new Error("graphic_param key must not be empty.");
  }
  return [...rows.map((row) => ({ ...row })), { key: trimmedKey, value }];
}

export function updateGraphicParamValue(
  rows: readonly GraphicParam[],
  index: number,
  value: string,
): GraphicParam[] {
  assertValidIndex(rows, index, "graphic_param");
  return rows.map((row, i) => (i === index ? { ...row, value } : { ...row }));
}

export function updateGraphicParamKey(
  rows: readonly GraphicParam[],
  index: number,
  key: string,
): GraphicParam[] {
  assertValidIndex(rows, index, "graphic_param");
  const trimmedKey = key.trim();
  if (!trimmedKey) {
    throw new Error("graphic_param key must not be empty.");
  }
  return rows.map((row, i) => (i === index ? { ...row, key: trimmedKey } : { ...row }));
}

export function deleteGraphicParamAt(
  rows: readonly GraphicParam[],
  index: number,
): GraphicParam[] {
  assertValidIndex(rows, index, "graphic_param");
  return rows.filter((_, i) => i !== index).map((row) => ({ ...row }));
}

export function replacePlacementRawField(
  row: PlacementRow,
  fieldIndex: number,
  value: string,
): PlacementRow {
  if (!Number.isInteger(fieldIndex) || fieldIndex < 0 || fieldIndex >= row.rawFields.length) {
    throw new Error(`Invalid placement field index: ${fieldIndex}`);
  }
  const rawFields = [...row.rawFields];
  const targetIndex = fieldIndex % 2 === 0 && fieldIndex + 1 < rawFields.length
    ? fieldIndex + 1
    : fieldIndex;
  rawFields[targetIndex] = value;
  return { ...row, rawFields };
}

export function replacePlacementRow(
  rows: readonly PlacementRow[],
  index: number,
  row: PlacementRow,
): PlacementRow[] {
  assertValidIndex(rows, index, "placement");
  return rows.map((entry, i) => (i === index ? clonePlacement(row) : clonePlacement(entry)));
}

export function addPlacementRow(
  rows: readonly PlacementRow[],
  source?: PlacementRow,
): PlacementRow[] {
  const row = source
    ? clonePlacement(source)
    : {
        vdkType: "OBJECT",
        objectNumber: null,
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
          "0",
          "VDK_POSITION_Y",
          "0",
          "VDK_POSITION_Z",
          "0",
          "VDK_ROTATION_X",
          "0",
          "VDK_ROTATION_Y",
          "0",
          "VDK_ROTATION_Z",
          "0",
          "VDK_OBJECTNUMBER",
          "",
          "VDK_PROGRAMID",
          "0",
        ],
      };
  return [...rows.map((entry) => clonePlacement(entry)), row];
}

export function deletePlacementRowAt(
  rows: readonly PlacementRow[],
  index: number,
): PlacementRow[] {
  assertValidIndex(rows, index, "placement");
  return rows.filter((_, i) => i !== index).map((row) => clonePlacement(row));
}

function assertValidIndex<T>(rows: readonly T[], index: number, label: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) {
    throw new Error(`Invalid ${label} row index: ${index}`);
  }
}

function clonePlacement(row: PlacementRow): PlacementRow {
  return {
    ...row,
    rawFields: [...row.rawFields],
  };
}
