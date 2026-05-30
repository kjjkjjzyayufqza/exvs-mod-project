import type { PlacementRow } from "../types/placement";
import { listPlacementFields, type PlacementFieldRef } from "./placementFieldModel";

export type ParsedTransformField = keyof Pick<
  PlacementRow,
  "posX" | "posY" | "posZ" | "rotX" | "rotY" | "rotZ" | "scaleX" | "scaleY" | "scaleZ"
>;

export interface TransformAxisDef {
  key: string;
  axisLabel: string;
  defaultValue: string;
  parsedField?: ParsedTransformField;
  decimals: number;
}

export interface TransformAxisRowDef {
  label: string;
  title: string;
  axes: TransformAxisDef[];
}

export interface TransformAxisBinding {
  def: TransformAxisDef;
  present: boolean;
  value: string;
  keyIndex: number | null;
  valueIndex: number | null;
}

export const PLACEMENT_TRANSFORM_ROWS: TransformAxisRowDef[] = [
  {
    label: "Trans",
    title: "Translate",
    axes: [
      { key: "VDK_POSITION_X", axisLabel: "X", defaultValue: "0", parsedField: "posX", decimals: 3 },
      { key: "VDK_POSITION_Y", axisLabel: "Y", defaultValue: "0", parsedField: "posY", decimals: 3 },
      { key: "VDK_POSITION_Z", axisLabel: "Z", defaultValue: "0", parsedField: "posZ", decimals: 3 },
    ],
  },
  {
    label: "Rot",
    title: "Rotate",
    axes: [
      { key: "VDK_ROTATION_X", axisLabel: "X", defaultValue: "0", parsedField: "rotX", decimals: 2 },
      { key: "VDK_ROTATION_Y", axisLabel: "Y", defaultValue: "0", parsedField: "rotY", decimals: 2 },
      { key: "VDK_ROTATION_Z", axisLabel: "Z", defaultValue: "0", parsedField: "rotZ", decimals: 2 },
    ],
  },
  {
    label: "Scale",
    title: "Scale",
    axes: [
      { key: "VDK_SCALE_X", axisLabel: "X", defaultValue: "1", parsedField: "scaleX", decimals: 3 },
      { key: "VDK_SCALE_Y", axisLabel: "Y", defaultValue: "1", parsedField: "scaleY", decimals: 3 },
      { key: "VDK_SCALE_Z", axisLabel: "Z", defaultValue: "1", parsedField: "scaleZ", decimals: 3 },
    ],
  },
];

export const PLACEMENT_TRANSFORM_AXIS_KEYS = new Set(
  PLACEMENT_TRANSFORM_ROWS.flatMap((row) => row.axes.map((axis) => axis.key.toUpperCase())),
);

export function isPlacementTransformAxisKey(key: string): boolean {
  return PLACEMENT_TRANSFORM_AXIS_KEYS.has(key.trim().toUpperCase());
}

export function resolveTransformAxisBindings(
  fields: PlacementFieldRef[],
  transform?: Pick<PlacementRow, ParsedTransformField>,
  options?: { virtualPresent?: boolean },
): Map<string, TransformAxisBinding> {
  const fieldByKey = new Map(fields.map((field) => [field.key.toUpperCase(), field]));
  const bindings = new Map<string, TransformAxisBinding>();

  for (const row of PLACEMENT_TRANSFORM_ROWS) {
    for (const def of row.axes) {
      const field = fieldByKey.get(def.key.toUpperCase());
      if (field) {
        bindings.set(def.key, {
          def,
          present: true,
          value: field.value,
          keyIndex: field.keyIndex,
          valueIndex: field.valueIndex,
        });
        continue;
      }

      const fallback =
        def.parsedField && transform !== undefined
          ? formatAxisValue(transform[def.parsedField], def.decimals)
          : def.defaultValue;

      bindings.set(def.key, {
        def,
        present: options?.virtualPresent ?? false,
        value: fallback,
        keyIndex: null,
        valueIndex: null,
      });
    }
  }

  return bindings;
}

export function resolveTransformAxisBindingsForEntry(
  entry: PlacementRow,
  header: string[],
): Map<string, TransformAxisBinding> {
  return resolveTransformAxisBindings(listPlacementFields(entry, header), {
    posX: entry.posX,
    posY: entry.posY,
    posZ: entry.posZ,
    rotX: entry.rotX,
    rotY: entry.rotY,
    rotZ: entry.rotZ,
    scaleX: entry.scaleX,
    scaleY: entry.scaleY,
    scaleZ: entry.scaleZ,
  });
}

function formatAxisValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

export function getTransformAxisDef(key: string): TransformAxisDef | undefined {
  const upper = key.toUpperCase();
  for (const row of PLACEMENT_TRANSFORM_ROWS) {
    const match = row.axes.find((axis) => axis.key.toUpperCase() === upper);
    if (match) return match;
  }
  return undefined;
}
