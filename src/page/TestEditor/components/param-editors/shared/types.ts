import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

export interface EditorEntryRow {
  entry: TypedParamEntry;
  index: number;
  entryId: number;
  label?: string;
}

export interface PropertyGroupDef {
  id: string;
  label: string;
  fields: PropertyFieldDef[];
  visible?: (entry: TypedParamEntry) => boolean;
}

export interface PropertyFieldDef {
  key: string;
  label: string;
  type: "u32" | "i32" | "f32" | "hash" | "enum" | "bool" | "vec3" | "string";
  enumOptions?: { value: number; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  tooltip?: string;
}

export interface ValidationMessage {
  field: string;
  level: "error" | "warning" | "info";
  message: string;
}
