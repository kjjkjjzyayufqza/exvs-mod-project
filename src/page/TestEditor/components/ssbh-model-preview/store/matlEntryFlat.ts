import type { MatlEntryJson, TextureParamJson } from "../types";
import type {
  NumatbAttribute,
  NumatbAttributeData,
  NumatbAttributeDataKind,
  NumatbBlendStateValue,
  NumatbRasterizerStateValue,
} from "../daeSsbhTypes";
import { createDefaultAttributeData, inferParamKind } from "./numatbAttributeDefaults";

const BUCKET_KEYS: (keyof MatlEntryJson)[] = [
  "blend_states",
  "floats",
  "float1s",
  "booleans",
  "vectors",
  "colors",
  "rasterizer_states",
  "samplers",
  "textures",
  "textures2",
  "type4_v16",
  "type4_v15",
  "uv_transforms",
];

function pid(x: unknown): string {
  return String(x);
}

export function flattenEntryToAttributes(entry: MatlEntryJson): NumatbAttribute[] {
  const out: NumatbAttribute[] = [];
  for (const p of entry.blend_states ?? []) {
    out.push({
      param_id: pid(p.param_id),
      param: { data: { BlendState: p.data as unknown as NumatbBlendStateValue } },
    });
  }
  for (const p of entry.floats ?? []) {
    out.push({ param_id: pid(p.param_id), param: { data: { Float: p.data as number } } });
  }
  for (const p of entry.float1s ?? []) {
    out.push({ param_id: pid(p.param_id), param: { data: { Float1: p.data as number } } });
  }
  for (const p of entry.booleans ?? []) {
    const b = p.data as boolean;
    out.push({ param_id: pid(p.param_id), param: { data: { Boolean: b ? 1 : 0 } } });
  }
  for (const p of entry.vectors ?? []) {
    out.push({
      param_id: pid(p.param_id),
      param: { data: { Vector4: p.data as NonNullable<NumatbAttributeData["Vector4"]> } },
    });
  }
  for (const p of entry.colors ?? []) {
    out.push({
      param_id: pid(p.param_id),
      param: { data: { Unk7: p.data as NonNullable<NumatbAttributeData["Unk7"]> } },
    });
  }
  for (const p of entry.rasterizer_states ?? []) {
    out.push({
      param_id: pid(p.param_id),
      param: { data: { RasterizerState: p.data as unknown as NumatbRasterizerStateValue } },
    });
  }
  for (const p of entry.samplers ?? []) {
    out.push({
      param_id: pid(p.param_id),
      param: { data: { Sampler: p.data as NonNullable<NumatbAttributeData["Sampler"]> } },
    });
  }
  for (const p of entry.textures ?? []) {
    const t = p as TextureParamJson;
    out.push({ param_id: pid(t.param_id), param: { data: { String: t.data } } });
  }
  for (const p of entry.textures2 ?? []) {
    const t = p as TextureParamJson;
    out.push({ param_id: pid(t.param_id), param: { data: { String1: t.data } } });
  }
  for (const p of entry.type4_v16 ?? []) {
    out.push({
      param_id: pid(p.param_id),
      param: { data: { Type4: p.data as number[] } },
    });
  }
  for (const p of entry.type4_v15 ?? []) {
    out.push({
      param_id: pid(p.param_id),
      param: { data: { Type4: p.data as unknown as number[] } },
    });
  }
  for (const p of entry.uv_transforms ?? []) {
    out.push({
      param_id: pid(p.param_id),
      param: { data: { UvTransform: p.data as NonNullable<NumatbAttributeData["UvTransform"]> } },
    });
  }
  return out;
}

export function indexToBucketLocation(
  entry: MatlEntryJson,
  flatIndex: number,
): { key: keyof MatlEntryJson; index: number } | null {
  let offset = 0;
  for (const key of BUCKET_KEYS) {
    const arr = (entry[key] as unknown[] | undefined) ?? [];
    if (flatIndex < offset + arr.length) {
      return { key, index: flatIndex - offset };
    }
    offset += arr.length;
  }
  return null;
}

function cloneEntry(entry: MatlEntryJson): MatlEntryJson {
  return JSON.parse(JSON.stringify(entry)) as MatlEntryJson;
}

function attributeDataToStoredValue(
  kind: NumatbAttributeDataKind,
  data: NumatbAttributeData,
  bucket: keyof MatlEntryJson,
): unknown {
  switch (bucket) {
    case "booleans":
      return data.Boolean === 1;
    case "floats":
      return data.Float ?? 0;
    case "float1s":
      return data.Float1 ?? 0;
    case "vectors":
      return data.Vector4 ?? { x: 0, y: 0, z: 0, w: 0 };
    case "colors":
      return data.Unk7 ?? { r: 0, g: 0, b: 0, a: 0 };
    case "blend_states":
      return data.BlendState ?? createDefaultAttributeData("BlendState").BlendState;
    case "rasterizer_states":
      return data.RasterizerState ?? createDefaultAttributeData("RasterizerState").RasterizerState;
    case "samplers":
      return data.Sampler ?? createDefaultAttributeData("Sampler").Sampler;
    case "textures":
      return data.String ?? "";
    case "textures2":
      return data.String1 ?? data.String ?? "";
    case "type4_v16":
    case "type4_v15":
      return data.Type4 ?? new Array(16).fill(0);
    case "uv_transforms":
      return data.UvTransform ?? createDefaultAttributeData("UvTransform").UvTransform;
    default:
      throw new Error(`Unsupported bucket for attribute update: ${String(bucket)}`);
  }
}

export function replaceAttributeAtFlatIndex(
  entry: MatlEntryJson,
  flatIndex: number,
  data: NumatbAttributeData,
): MatlEntryJson {
  const next = cloneEntry(entry);
  const loc = indexToBucketLocation(next, flatIndex);
  if (!loc) {
    throw new Error("Attribute index is out of range");
  }
  const kind = inferParamKindFromData(data);
  const arr = (next[loc.key] as { param_id: unknown; data: unknown }[]) ?? [];
  const row = arr[loc.index];
  if (!row) {
    throw new Error("Attribute index is out of range");
  }
  row.data = attributeDataToStoredValue(kind, data, loc.key);
  (next as Record<string, unknown>)[loc.key as string] = arr;
  return next;
}

export function inferParamKindFromData(data: NumatbAttributeData): NumatbAttributeDataKind {
  if (data.Boolean !== undefined) return "Boolean";
  if (data.Float !== undefined) return "Float";
  if (data.Float1 !== undefined) return "Float1";
  if (data.String !== undefined) return "String";
  if (data.String1 !== undefined) return "String1";
  if (data.Vector4 !== undefined) return "Vector4";
  if (data.Unk7 !== undefined) return "Unk7";
  if (data.Sampler !== undefined) return "Sampler";
  if (data.BlendState !== undefined) return "BlendState";
  if (data.RasterizerState !== undefined) return "RasterizerState";
  if (data.UvTransform !== undefined) return "UvTransform";
  if (data.Type4 !== undefined) return "Type4";
  throw new Error("Unsupported attribute data shape");
}

export function removeAttributeAtFlatIndex(entry: MatlEntryJson, flatIndex: number): MatlEntryJson {
  const next = cloneEntry(entry);
  const loc = indexToBucketLocation(next, flatIndex);
  if (!loc) {
    throw new Error("Attribute index is out of range");
  }
  const arr = [...((next[loc.key] as unknown[] | undefined) ?? [])];
  arr.splice(loc.index, 1);
  (next as Record<string, unknown>)[loc.key as string] = arr;
  return next;
}

function bucketForKind(kind: NumatbAttributeDataKind): keyof MatlEntryJson {
  switch (kind) {
    case "BlendState":
      return "blend_states";
    case "Float":
      return "floats";
    case "Float1":
      return "float1s";
    case "Boolean":
      return "booleans";
    case "Vector4":
      return "vectors";
    case "Unk7":
      return "colors";
    case "RasterizerState":
      return "rasterizer_states";
    case "Sampler":
      return "samplers";
    case "String":
      return "textures";
    case "String1":
      return "textures2";
    case "UvTransform":
      return "uv_transforms";
    case "Type4":
      return "type4_v16";
    default:
      throw new Error(`Cannot add attribute kind ${kind} to MatlData entry`);
  }
}

export function addAttributeToMatlEntry(
  entry: MatlEntryJson,
  paramId: string,
  kind?: NumatbAttributeDataKind,
): MatlEntryJson {
  const next = cloneEntry(entry);
  const resolvedKind = kind ?? inferParamKind(paramId);
  const data = createDefaultAttributeData(resolvedKind);
  const bucket = bucketForKind(resolvedKind);
  const arr = [...((next[bucket] as unknown[] | undefined) ?? [])];
  if (arr.some((row) => String((row as { param_id: unknown }).param_id) === paramId)) {
    return next;
  }
  const stored = attributeDataToStoredValue(resolvedKind, data, bucket);
  arr.push({ param_id: paramId, data: stored });
  (next as Record<string, unknown>)[bucket as string] = arr;
  return next;
}

export function addLegacyAttributeDataToEntry(
  entry: MatlEntryJson,
  paramId: string,
  data: NumatbAttributeData,
): void {
  const kind = inferParamKindFromData(data);
  const bucket = bucketForKind(kind);
  const arr = [...((entry[bucket] as unknown[] | undefined) ?? [])];
  if (arr.some((row) => String((row as { param_id: unknown }).param_id) === paramId)) {
    return;
  }
  const stored = attributeDataToStoredValue(kind, data, bucket);
  arr.push({ param_id: paramId, data: stored });
  (entry as Record<string, unknown>)[bucket as string] = arr;
}
