import type { PlacementRow } from "../types/placement";
import {
  PLACEMENT_FIELD_CATALOG,
  type PlacementFieldCategory,
  type PlacementFieldKind,
  type PlacementFieldMeta,
} from "./placementFieldCatalog";

export const TRANSFORM_FIELD_KEYS = new Set([
  "VDK_TYPE",
  "VDK_OBJECTNUMBER",
  "VDK_PLACEMENT_NAME",
  "VDK_POS_X",
  "VDK_POS_Y",
  "VDK_POS_Z",
  "VDK_POSITION_X",
  "VDK_POSITION_Y",
  "VDK_POSITION_Z",
  "VDK_ROT_X",
  "VDK_ROT_Y",
  "VDK_ROT_Z",
  "VDK_ROTATION_X",
  "VDK_ROTATION_Y",
  "VDK_ROTATION_Z",
  "VDK_SCALE",
  "VDK_SCALE_X",
  "VDK_SCALE_Y",
  "VDK_SCALE_Z",
]);

export interface PlacementFieldRef {
  key: string;
  value: string;
  keyIndex: number;
  valueIndex: number;
  category: PlacementFieldCategory;
  kind: PlacementFieldKind;
  known: boolean;
  editableKey: boolean;
}

export interface PlacementFieldGroup {
  category: PlacementFieldCategory;
  label: string;
  fields: PlacementFieldRef[];
}

const CATEGORY_LABELS: Record<PlacementFieldCategory, string> = {
  transform: "Transform",
  identity: "Identity",
  animation: "Animation",
  attach: "Attach Effects",
  prop: "Prop",
  effect: "Effect & Audio",
  links: "Links",
  physics: "Physics",
  other: "Other",
};

const CATEGORY_ORDER: PlacementFieldCategory[] = [
  "identity",
  "transform",
  "animation",
  "attach",
  "prop",
  "effect",
  "links",
  "physics",
  "other",
];

const catalogByKey = new Map(
  PLACEMENT_FIELD_CATALOG.map((meta) => [meta.key.toUpperCase(), meta]),
);

export function getPlacementFieldMeta(key: string): PlacementFieldMeta | undefined {
  return catalogByKey.get(key.trim().toUpperCase());
}

export function isHeaderFormatRow(entry: PlacementRow, header: string[]): boolean {
  return header.length > 0 && entry.rawFields.length === header.length;
}

export function listPlacementFields(
  entry: PlacementRow,
  header: string[],
): PlacementFieldRef[] {
  if (isHeaderFormatRow(entry, header)) {
    return header.map((rawKey, index) => {
      const key = rawKey.trim();
      const meta = getPlacementFieldMeta(key);
      const category = meta?.category ?? inferCategory(key);
      const kind = meta?.kind ?? inferKind(entry.rawFields[index] ?? "");
      return {
        key,
        value: entry.rawFields[index] ?? "",
        keyIndex: index,
        valueIndex: index,
        category,
        kind,
        known: meta !== undefined,
        editableKey: false,
      };
    });
  }

  const refs: PlacementFieldRef[] = [];
  for (let i = 0; i + 1 < entry.rawFields.length; i += 2) {
    const key = entry.rawFields[i].trim();
    const meta = getPlacementFieldMeta(key);
    const category = meta?.category ?? inferCategory(key);
    const kind = meta?.kind ?? inferKind(entry.rawFields[i + 1] ?? "");
    refs.push({
      key,
      value: entry.rawFields[i + 1] ?? "",
      keyIndex: i,
      valueIndex: i + 1,
      category,
      kind,
      known: meta !== undefined,
      editableKey: true,
    });
  }
  return refs;
}

export function groupPlacementFields(fields: PlacementFieldRef[]): PlacementFieldGroup[] {
  const buckets = new Map<PlacementFieldCategory, PlacementFieldRef[]>();
  for (const field of fields) {
    const list = buckets.get(field.category) ?? [];
    list.push(field);
    buckets.set(field.category, list);
  }

  return CATEGORY_ORDER.filter((category) => buckets.has(category)).map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    fields: buckets.get(category) ?? [],
  }));
}

export function listCatalogKeysNotInRow(entry: PlacementRow, header: string[]): string[] {
  const present = new Set(
    listPlacementFields(entry, header).map((field) => field.key.toUpperCase()),
  );
  return PLACEMENT_FIELD_CATALOG.map((meta) => meta.key).filter(
    (key) => !present.has(key.toUpperCase()),
  );
}

export function suggestFieldDefault(key: string): string {
  const meta = getPlacementFieldMeta(key);
  if (!meta) return "";
  if (meta.kind === "bool") {
    if (meta.sampleValues.some((value) => value.toUpperCase() === "TRUE")) return "TRUE";
    return meta.sampleValues[0] ?? "TRUE";
  }
  if (meta.kind === "number") return meta.sampleValues[0] ?? "0";
  return meta.sampleValues[0] ?? "";
}

function inferCategory(key: string): PlacementFieldCategory {
  const meta = getPlacementFieldMeta(key);
  if (meta) return meta.category;
  const upper = key.toUpperCase();
  if (TRANSFORM_FIELD_KEYS.has(upper)) return "transform";
  if (upper.includes("ANIM")) return "animation";
  if (upper.includes("ATTACH")) return "attach";
  if (upper.includes("PROP")) return "prop";
  if (upper.includes("EFFECT") || upper.startsWith("VDK_SE_")) return "effect";
  return "other";
}

function inferKind(value: string): PlacementFieldKind {
  const upper = value.trim().toUpperCase();
  if (upper === "TRUE" || upper === "FALSE") return "bool";
  if (value.trim() !== "" && Number.isFinite(Number.parseFloat(value))) return "number";
  return "string";
}
