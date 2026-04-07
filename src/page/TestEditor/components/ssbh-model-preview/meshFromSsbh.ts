import { BufferAttribute, BufferGeometry } from "three";
import type {
  BoneJson,
  BuiltMeshDraw,
  MatlDataJson,
  MatlEntryJson,
  MeshDataJson,
  MeshObjectJson,
  MeshSkinRuntime,
  ModlDataJson,
  ModlEntryJson,
  SkelDataJson,
  SsbhModelPreviewBundle,
  SsbhModelPreviewInstance,
  TextureParamJson,
  TextureWrapModeJson,
  VectorDataJson,
  UvTransformJson,
  SamplerDataJson,
} from "./types";

function vectorDataToVec3(data: VectorDataJson | undefined): [number, number, number][] | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.Vector3)) return d.Vector3 as [number, number, number][];
  return null;
}

function vectorDataToVec2(data: VectorDataJson | undefined): [number, number][] | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.Vector2)) return d.Vector2 as [number, number][];
  return null;
}

function normalizeParamId(paramId: unknown): string {
  if (typeof paramId === "string") return paramId;
  if (paramId && typeof paramId === "object") {
    const keys = Object.keys(paramId as object);
    if (keys.length === 1) return keys[0] ?? "";
  }
  return "";
}

/**
 * Matches ssbh_wgpu `material_uniforms_bind_group`: Texture2/Texture7/Texture8 use cube dimensions.
 * Preview skips cube paths for 2D MeshStandardMaterial slots.
 */
function isLikelyCubeMapTextureRef(ref: string): boolean {
  const lower = ref.toLowerCase();
  return lower.includes("cubemap") || lower.includes("_cube") || lower.includes("cube_map");
}

/** Basename (last path segment) lowercased for heuristics. */
function textureRefStemLower(ref: string): string {
  const s = ref.replace(/\\/g, "/").trim();
  const seg = s.split("/").pop() ?? s;
  return seg.toLowerCase();
}

/**
 * Packed PBR / masks (roughness, metal, normal, AO) must not drive MeshStandard `map` (base color).
 * Game paths often contain tokens like `roughnessandmask` while albedo uses `col`, `dif`, etc.
 */
function isLikelyNonAlbedoTextureRef(ref: string): boolean {
  const b = textureRefStemLower(ref);
  const tokens = [
    "roughnessandmask",
    "roughness",
    "andmask",
    "_mask",
    "metalness",
    "metallic",
    "_orm",
    "ormpack",
    "normalmap",
    "_normal",
    "normal",
    "_nor",
    "_nrm",
    "nor_",
    "nrm_",
    "bump",
    "specular",
    "_spec",
    "spec_",
    "occlusion",
    "ambientocclusion",
    "_ao",
    "aomap",
    "height",
    "displace",
    "prm",
    "mrao",
    "mra",
  ];
  return tokens.some((t) => b.includes(t));
}

/** Prefer when choosing among ambiguous slots (second pass). */
function isLikelyAlbedoTextureRef(ref: string): boolean {
  const b = textureRefStemLower(ref);
  const tokens = [
    "albedo",
    "basecolor",
    "base_color",
    "diffuse",
    "_dif",
    "_col",
    "color",
    "tex_",
    "_tex",
    "decal",
  ];
  return tokens.some((t) => b.includes(t));
}

function textureRefForParam(entry: MatlEntryJson | undefined, paramId: string): string | null {
  if (!entry) return null;
  const tex = [...(entry.textures ?? []), ...(entry.textures2 ?? [])]
    .find((t) => normalizeParamId(t.param_id) === paramId);
  const data = tex?.data?.trim();
  return data || null;
}

function iterTextureRefs(entry: MatlEntryJson | undefined): { paramId: string; ref: string }[] {
  const textures = [...(entry?.textures ?? []), ...(entry?.textures2 ?? [])];
  if (!textures.length) return [];
  return textures
    .map((t) => ({
      paramId: normalizeParamId(t.param_id),
      ref: (t.data ?? "").trim(),
    }))
    .filter((x) => x.ref.length > 0);
}

/**
 * EXVS-style PBR: filenames use tokens like `_pbr1_basecolor`, `_pbr1_normal`, `_pbr1_metallic`.
 * Matl may use semantic ParamIds (DiffuseMap, NormalMap, …) instead of only Texture0–Texture7.
 */
function pickExvsPbrTextureRefs(entry: MatlEntryJson | undefined): {
  base: string | null;
  normal: string | null;
  roughness: string | null;
  roughnessMask: string | null;
  metallic: string | null;
  emissive: string | null;
  ao: string | null;
} {
  const rows = iterTextureRefs(entry);
  const stem = (r: string) => textureRefStemLower(r);
  const find = (pred: (b: string) => boolean): string | null => {
    for (const { ref } of rows) {
      if (pred(stem(ref))) return ref;
    }
    return null;
  };
  const basePbr1 = (): string | null => {
    for (const { ref } of rows) {
      const b = stem(ref);
      if (b.includes("pbr1_basecolor")) return ref;
    }
    return null;
  };
  const normalPbr1 = (): string | null => {
    for (const { ref } of rows) {
      const b = stem(ref);
      if (b.includes("pbr1_normal")) return ref;
    }
    return null;
  };
  return {
    base:
      basePbr1() ??
      find(
        (b) =>
          (b.includes("basecolor") || b.includes("base_color") || b.includes("_albedo")) &&
          !b.includes("roughnessandmask"),
      ),
    normal:
      normalPbr1() ??
      find(
        (b) =>
          (b.includes("normal") || b.includes("_nor") || b.includes("_nrm")) &&
          !b.includes("roughnessandmask"),
      ),
    roughness: find((b) => b.includes("roughness") && !b.includes("roughnessandmask")),
    roughnessMask: find((b) => b.includes("roughnessandmask")),
    metallic: find((b) => b.includes("metallic") || b.includes("metalness")),
    emissive: find((b) => b.includes("emissive") || b.includes("emission")),
    ao: find(
      (b) =>
        b.includes("ambientocclusion") ||
        (b.includes("occlusion") && !b.includes("roughnessandmask")) ||
        b.endsWith("_ao"),
    ),
  };
}

/**
 * Base color: prefer Texture0, then Texture1/Texture3 before Texture4/Texture5 — many titles put
 * ORM / roughness+mask in Texture4 while albedo stays in Texture0.
 */
function pickBaseColorTextureRef(entry: MatlEntryJson | undefined): string | null {
  if (!entry) return null;
  const order = ["Texture0", "Texture1", "Texture3", "Texture4", "Texture5"];
  for (const id of order) {
    const data = textureRefForParam(entry, id);
    if (data && !isLikelyCubeMapTextureRef(data) && !isLikelyNonAlbedoTextureRef(data)) {
      return data;
    }
  }
  for (const id of order) {
    const data = textureRefForParam(entry, id);
    if (data && !isLikelyCubeMapTextureRef(data) && isLikelyAlbedoTextureRef(data)) {
      return data;
    }
  }
  for (const id of order) {
    const data = textureRefForParam(entry, id);
    if (data && !isLikelyCubeMapTextureRef(data)) {
      return data;
    }
  }
  const any = entry.textures.find((t) => {
    const d = t.data?.trim();
    if (!d) return false;
    const id = normalizeParamId(t.param_id);
    if (id === "Texture6" || id === "Texture2" || id === "Texture7" || id === "Texture8") return false;
    return !isLikelyCubeMapTextureRef(d);
  });
  return any?.data?.trim() ?? null;
}

/** Often tangent normals (ssbh_wgpu binds Texture6 as 2D). */
function pickNormalTextureRef(entry: MatlEntryJson | undefined): string | null {
  const data = textureRefForParam(entry, "Texture6");
  if (!data || isLikelyCubeMapTextureRef(data)) return null;
  return data;
}

/**
 * Roughness / packed masks: Texture5 or Texture4 when filename indicates non-albedo, or Texture4 when
 * base color clearly comes from Texture0 (common ORM in Texture4).
 */
function pickRoughnessTextureRef(
  entry: MatlEntryJson | undefined,
  baseColorRef: string | null,
): string | null {
  if (!entry) return null;
  for (const id of ["Texture5", "Texture4"] as const) {
    const r = textureRefForParam(entry, id);
    if (!r || isLikelyCubeMapTextureRef(r) || r === baseColorRef) continue;
    if (isLikelyNonAlbedoTextureRef(r)) {
      return r;
    }
  }
  const t0 = textureRefForParam(entry, "Texture0");
  const t4 = textureRefForParam(entry, "Texture4");
  if (
    baseColorRef &&
    t0 &&
    baseColorRef === t0 &&
    t4 &&
    !isLikelyCubeMapTextureRef(t4) &&
    t4 !== baseColorRef &&
    !isLikelyAlbedoTextureRef(t4)
  ) {
    return t4;
  }
  return null;
}

export type ResolvedMaterialTexturePaths = {
  mapPath: string | null;
  normalPath: string | null;
  roughnessPath: string | null;
  metalnessPath: string | null;
  emissivePath: string | null;
  aoPath: string | null;
  cubePath: string | null;
};

/** Decoded PNG data URLs for Three.js (map/emissive sRGB; others linear). */
export type DrawMaterialDataUrls = {
  map: string | null;
  normalMap: string | null;
  roughnessMap: string | null;
  metalnessMap: string | null;
  emissiveMap: string | null;
  aoMap: string | null;
  cubeMap: string | null;
};

export type TexturePreviewSlotKey = keyof DrawMaterialDataUrls;

/** UI labels for preview texture slot toggles (English). */
export const TEXTURE_PREVIEW_SLOT_META: { key: TexturePreviewSlotKey; label: string; short: string }[] = [
  { key: "map", label: "Base color (albedo)", short: "Map" },
  { key: "normalMap", label: "Normal map", short: "Normal" },
  { key: "roughnessMap", label: "Roughness", short: "Roughness" },
  { key: "metalnessMap", label: "Metalness", short: "Metalness" },
  { key: "emissiveMap", label: "Emissive", short: "Emissive" },
  { key: "aoMap", label: "Ambient occlusion", short: "AO" },
  { key: "cubeMap", label: "Environment / cube", short: "Cube" },
];

export function createDefaultTextureSlotLoadEnabled(): Record<TexturePreviewSlotKey, boolean> {
  return {
    map: true,
    normalMap: true,
    roughnessMap: true,
    metalnessMap: true,
    emissiveMap: true,
    aoMap: true,
    cubeMap: true,
  };
}

/** Maps preview slot keys to `ResolvedMaterialTexturePaths` field names. */
export const TEXTURE_SLOT_TO_PATH_FIELD: Record<TexturePreviewSlotKey, keyof ResolvedMaterialTexturePaths> = {
  map: "mapPath",
  normalMap: "normalPath",
  roughnessMap: "roughnessPath",
  metalnessMap: "metalnessPath",
  emissiveMap: "emissivePath",
  aoMap: "aoPath",
  cubeMap: "cubePath",
};

/**
 * Counts nutexb decode operations for preview (one per mesh draw × enabled slot with a resolved path).
 * Matches the decode loop in `SsbhModelPreviewProvider` texture loading.
 */
export function countTextureDecodeSteps(
  draws: BuiltMeshDraw[],
  lookup: Map<string, MatlEntryJson>,
  refMap: Map<string, string>,
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>,
): number {
  let n = 0;
  for (const d of draws) {
    const paths = resolveMaterialTexturePaths(d.materialLabel, lookup, refMap);
    for (const { key } of TEXTURE_PREVIEW_SLOT_META) {
      if (!textureSlotLoadEnabled[key]) continue;
      const field = TEXTURE_SLOT_TO_PATH_FIELD[key];
      if (paths[field]) n += 1;
    }
  }
  return n;
}

/**
 * How many preview slots reference each resolved disk path (for progress when decoding unique paths in parallel).
 * Sum of values equals `countTextureDecodeSteps` for the same inputs.
 */
export function collectPathSlotCounts(
  draws: BuiltMeshDraw[],
  lookup: Map<string, MatlEntryJson>,
  refMap: Map<string, string>,
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of draws) {
    const paths = resolveMaterialTexturePaths(d.materialLabel, lookup, refMap);
    for (const { key } of TEXTURE_PREVIEW_SLOT_META) {
      if (!textureSlotLoadEnabled[key]) continue;
      const field = TEXTURE_SLOT_TO_PATH_FIELD[key];
      const pathVal = paths[field];
      if (!pathVal) continue;
      m.set(pathVal, (m.get(pathVal) ?? 0) + 1);
    }
  }
  return m;
}

export function buildTextureRefToPathMap(bundle: SsbhModelPreviewBundle): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of bundle.textureResolve) {
    if (row.nutexbPath) {
      m.set(row.reference, row.nutexbPath);
    }
  }
  return m;
}

export function bundleForPreviewDraw(
  draw: BuiltMeshDraw,
  instances: readonly SsbhModelPreviewInstance[],
): SsbhModelPreviewBundle | null {
  if (instances.length === 0) return null;
  const id = draw.previewInstanceId;
  if (id) {
    return instances.find((i) => i.id === id)?.bundle ?? null;
  }
  return instances[0]!.bundle;
}

export function countTextureDecodeStepsForInstances(
  draws: BuiltMeshDraw[],
  instances: readonly SsbhModelPreviewInstance[],
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>,
): number {
  let n = 0;
  for (const d of draws) {
    const b = bundleForPreviewDraw(d, instances);
    if (!b) continue;
    const lookup = buildMatlLookup(b.matl as MatlDataJson | null);
    const refMap = buildTextureRefToPathMap(b);
    n += countTextureDecodeSteps([d], lookup, refMap, textureSlotLoadEnabled);
  }
  return n;
}

export function collectPathSlotCountsForInstances(
  draws: BuiltMeshDraw[],
  instances: readonly SsbhModelPreviewInstance[],
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of draws) {
    const b = bundleForPreviewDraw(d, instances);
    if (!b) continue;
    const lookup = buildMatlLookup(b.matl as MatlDataJson | null);
    const refMap = buildTextureRefToPathMap(b);
    const paths = resolveMaterialTexturePaths(d.materialLabel, lookup, refMap);
    for (const { key } of TEXTURE_PREVIEW_SLOT_META) {
      if (!textureSlotLoadEnabled[key]) continue;
      const field = TEXTURE_SLOT_TO_PATH_FIELD[key];
      const pathVal = paths[field];
      if (!pathVal) continue;
      m.set(pathVal, (m.get(pathVal) ?? 0) + 1);
    }
  }
  return m;
}

export type ShaderFamily = "vsngCharaBasic" | "vsngCharaSparkle" | "generic";

export type ResolvedTextureSampling = {
  wrapS: TextureWrapModeJson;
  wrapT: TextureWrapModeJson;
  uvTransform: UvTransformJson | null;
};

export type ResolvedMaterialBinding = {
  materialLabel: string;
  shaderLabel: string;
  shaderFamily: ShaderFamily;
  textureRefs: {
    map: string | null;
    normal: string | null;
    roughness: string | null;
    metalness: string | null;
    emissive: string | null;
    ao: string | null;
    cube: string | null;
  };
  texturePaths: ResolvedMaterialTexturePaths;
  renderHints: {
    isTransparent: boolean;
    isSparkle: boolean;
  };
  uniforms: {
    fresnelType4V16Hex: string | null;
    roughnessScalar: number | null;
    metalnessScalar: number | null;
  };
  sampling: {
    map: ResolvedTextureSampling;
    normal: ResolvedTextureSampling;
    roughness: ResolvedTextureSampling;
    metalness: ResolvedTextureSampling;
    emissive: ResolvedTextureSampling;
    ao: ResolvedTextureSampling;
  };
};

export function resolveTextureRefToPath(ref: string | null, refToPath: Map<string, string>): string | null {
  if (!ref) return null;
  const direct = refToPath.get(ref);
  if (direct) return direct;
  const normalized = ref.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  for (const [k, v] of refToPath) {
    if (k === ref || k.endsWith(normalized) || normalized.endsWith(k.replace(/^[/\\]+/, ""))) {
      return v;
    }
  }
  return null;
}

/**
 * Maps matl ParamId texture paths to on-disk nutexb paths (same rules as previous single-texture preview).
 */
export function resolveMaterialTexturePaths(
  materialLabel: string,
  matlLookup: Map<string, MatlEntryJson>,
  refToPath: Map<string, string>,
): ResolvedMaterialTexturePaths {
  const entry = matlLookup.get(materialLabel);
  const exvs = pickExvsPbrTextureRefs(entry);
  const baseRef =
    exvs.base ??
    textureRefForParam(entry, "BaseColorMap") ??
    textureRefForParam(entry, "DiffuseMap") ??
    pickBaseColorTextureRef(entry);
  const normalRef =
    exvs.normal ??
    textureRefForParam(entry, "NormalMap") ??
    pickNormalTextureRef(entry);
  const roughRef =
    exvs.roughness ??
    exvs.roughnessMask ??
    textureRefForParam(entry, "RoughnessMap") ??
    pickRoughnessTextureRef(entry, baseRef);
  const metalRef =
    exvs.metallic ?? textureRefForParam(entry, "MetallicMap") ?? null;
  const emissiveRef =
    exvs.emissive ?? textureRefForParam(entry, "EmissiveMap") ?? null;
  const aoRef =
    exvs.ao ?? textureRefForParam(entry, "AmbientOcclusionMap") ?? null;
  const cubeRef =
    textureRefForParam(entry, "Texture7") ??
    textureRefForParam(entry, "Texture8") ??
    iterTextureRefs(entry).find((x) => isLikelyCubeMapTextureRef(x.ref))?.ref ??
    null;
  const mapPath = resolveTextureRefToPath(baseRef, refToPath);
  let normalPath = resolveTextureRefToPath(normalRef, refToPath);
  let roughnessPath = resolveTextureRefToPath(roughRef, refToPath);
  let metalnessPath = resolveTextureRefToPath(metalRef, refToPath);
  let emissivePath = resolveTextureRefToPath(emissiveRef, refToPath);
  let aoPath = resolveTextureRefToPath(aoRef, refToPath);
  let cubePath = resolveTextureRefToPath(cubeRef, refToPath);
  const dedupe = (p: string | null) => (p && p === mapPath ? null : p);
  normalPath = dedupe(normalPath);
  roughnessPath = dedupe(roughnessPath);
  metalnessPath = dedupe(metalnessPath);
  emissivePath = dedupe(emissivePath);
  aoPath = dedupe(aoPath);
  cubePath = dedupe(cubePath);
  return {
    mapPath,
    normalPath,
    roughnessPath,
    metalnessPath,
    emissivePath,
    aoPath,
    cubePath,
  };
}

function normalizeShaderFamily(shaderLabel: string): ShaderFamily {
  if (shaderLabel.includes("vsngCharaSparkle")) return "vsngCharaSparkle";
  if (shaderLabel.includes("vsngCharaBasic")) return "vsngCharaBasic";
  return "generic";
}

function paramIdMatches(paramId: unknown, want: string): boolean {
  return normalizeParamId(paramId) === want;
}

function paramNumberById(
  rows: { param_id: unknown; data: number }[] | undefined,
  id: string,
): number | null {
  if (!rows?.length) return null;
  const row = rows.find((r) => paramIdMatches(r.param_id, id));
  return typeof row?.data === "number" ? row.data : null;
}

function type4HexById(
  rows: { param_id: unknown; data: number[] }[] | undefined,
  id: string,
): string | null {
  if (!rows?.length) return null;
  const row = rows.find((r) => paramIdMatches(r.param_id, id));
  if (!Array.isArray(row?.data)) return null;
  return row.data.map((n) => Number(n).toString(16).padStart(2, "0")).join("");
}

function paramBooleanById(
  rows: { param_id: unknown; data: boolean }[] | undefined,
  id: string,
): boolean | null {
  if (!rows?.length) return null;
  const row = rows.find((r) => paramIdMatches(r.param_id, id));
  return typeof row?.data === "boolean" ? row.data : null;
}

function samplerByParamId(
  entry: MatlEntryJson | undefined,
  id: string,
): SamplerDataJson | null {
  if (!entry?.samplers?.length) return null;
  const row = entry.samplers.find((r) => paramIdMatches(r.param_id, id));
  const data = row?.data;
  if (!data || typeof data !== "object") return null;
  return data;
}

function uvTransformByParamId(
  entry: MatlEntryJson | undefined,
  id: string,
): UvTransformJson | null {
  if (!entry?.uv_transforms?.length) return null;
  const row = entry.uv_transforms.find((r) => paramIdMatches(r.param_id, id));
  const data = row?.data;
  if (!data || typeof data !== "object") return null;
  const candidate = data as Partial<UvTransformJson>;
  if (
    typeof candidate.scale_u !== "number" ||
    typeof candidate.scale_v !== "number" ||
    typeof candidate.rotation !== "number" ||
    typeof candidate.translate_u !== "number" ||
    typeof candidate.translate_v !== "number"
  ) {
    return null;
  }
  return {
    scale_u: candidate.scale_u,
    scale_v: candidate.scale_v,
    rotation: candidate.rotation,
    translate_u: candidate.translate_u,
    translate_v: candidate.translate_v,
  };
}

function defaultTextureSampling(): ResolvedTextureSampling {
  return {
    wrapS: "ClampToEdge",
    wrapT: "ClampToEdge",
    uvTransform: null,
  };
}

function resolveTextureSampling(
  sampler: SamplerDataJson | null,
  uvTransform: UvTransformJson | null,
): ResolvedTextureSampling {
  return {
    wrapS: sampler?.wraps ?? "ClampToEdge",
    wrapT: sampler?.wrapt ?? "ClampToEdge",
    uvTransform,
  };
}

function firstSampler(entry: MatlEntryJson | undefined): SamplerDataJson | null {
  if (!entry?.samplers?.length) return null;
  for (const row of entry.samplers) {
    if (row.data && typeof row.data === "object") {
      return row.data;
    }
  }
  return null;
}

function resolveUvTransformWithFlag(
  entry: MatlEntryJson | undefined,
  useIds: string[],
  transformIds: string[],
): UvTransformJson | null {
  let enabled: boolean | null = null;
  for (const id of useIds) {
    const value = paramBooleanById(entry?.booleans, id);
    if (value !== null) {
      enabled = value;
      break;
    }
  }
  let transform: UvTransformJson | null = null;
  for (const id of transformIds) {
    transform = uvTransformByParamId(entry, id);
    if (transform) break;
  }
  if (enabled === false) {
    return null;
  }
  return transform;
}

export function resolveMaterialBinding(
  materialLabel: string,
  matlLookup: Map<string, MatlEntryJson>,
  refToPath: Map<string, string>,
): ResolvedMaterialBinding {
  const entry = matlLookup.get(materialLabel);
  const texturePaths = resolveMaterialTexturePaths(materialLabel, matlLookup, refToPath);
  const shaderLabel = entry?.shader_label ?? "";
  const shaderFamily = normalizeShaderFamily(shaderLabel);
  const roughnessScalar = paramNumberById(entry?.floats, "Roughness");
  const metalnessScalar = paramNumberById(entry?.floats, "Metalness");
  const fresnelType4V16Hex = type4HexById(entry?.type4_v16, "Fresnel");
  const diffuseSampler =
    samplerByParamId(entry, "DiffuseSampler") ??
    samplerByParamId(entry, "Sampler0") ??
    firstSampler(entry);
  const normalSampler =
    samplerByParamId(entry, "NormalSampler") ??
    samplerByParamId(entry, "Sampler6") ??
    diffuseSampler;
  const specularSampler =
    samplerByParamId(entry, "SpecularSampler") ??
    samplerByParamId(entry, "Sampler4") ??
    samplerByParamId(entry, "Sampler5") ??
    diffuseSampler;
  const diffuseUvTransform = resolveUvTransformWithFlag(
    entry,
    ["UseDiffuseUvTransform", "UseDiffuseUvTransform1", "UseDiffuseUvTransform2"],
    ["DiffuseUvTransform", "DiffuseUvTransform1", "DiffuseUvTransform2", "UvTransform0", "UvTransform1"],
  );
  const normalUvTransform = resolveUvTransformWithFlag(
    entry,
    ["UseNormalUvTransform", "UseNormalUvTransform1", "UseNormalUvTransform2"],
    ["NormalUvTransform", "NormalUvTransform1", "NormalUvTransform2", "UvTransform6"],
  );
  const specularUvTransform = resolveUvTransformWithFlag(
    entry,
    ["UseSpecularUvTransform", "UseSpecularUvTransform1", "UseSpecularUvTransform2"],
    ["SpecularUvTransform", "SpecularUvTransform1", "SpecularUvTransform2", "UvTransform4", "UvTransform5"],
  );
  const diffuseSampling = resolveTextureSampling(diffuseSampler, diffuseUvTransform);
  const normalSampling = resolveTextureSampling(normalSampler, normalUvTransform);
  const specularSampling = resolveTextureSampling(specularSampler, specularUvTransform);
  return {
    materialLabel,
    shaderLabel,
    shaderFamily,
    textureRefs: {
      map:
        textureRefForParam(entry, "Texture0") ??
        textureRefForParam(entry, "BaseColorMap") ??
        textureRefForParam(entry, "DiffuseMap") ??
        null,
      normal: textureRefForParam(entry, "Texture6") ?? null,
      roughness: textureRefForParam(entry, "Texture4") ?? textureRefForParam(entry, "Texture5") ?? null,
      metalness: textureRefForParam(entry, "Texture5") ?? null,
      emissive: textureRefForParam(entry, "Texture3") ?? null,
      ao: textureRefForParam(entry, "Texture1") ?? null,
      cube: textureRefForParam(entry, "Texture7") ?? textureRefForParam(entry, "Texture8") ?? null,
    },
    texturePaths,
    renderHints: {
      isTransparent: shaderLabel.includes("trans") || shaderLabel.includes("blend"),
      isSparkle: shaderFamily === "vsngCharaSparkle",
    },
    uniforms: {
      fresnelType4V16Hex,
      roughnessScalar,
      metalnessScalar,
    },
    sampling: {
      map: diffuseSampling,
      normal: normalSampling,
      roughness: specularSampling,
      metalness: specularSampling,
      emissive: diffuseSampling,
      ao: diffuseSampling,
    },
  };
}

function mergeMatlEntries(a: MatlEntryJson, b: MatlEntryJson): MatlEntryJson {
  const paramKey = (t: { param_id: unknown }) => normalizeParamId(t.param_id);
  const mergeByParamId = <T extends { param_id: unknown }>(lhs: T[] | undefined, rhs: T[] | undefined): T[] => {
    const merged = new Map<string, T>();
    for (const t of lhs ?? []) merged.set(paramKey(t), t);
    for (const t of rhs ?? []) {
      const k = paramKey(t);
      if (!merged.has(k)) merged.set(k, t);
    }
    return [...merged.values()];
  };
  const mergedTextures = new Map<string, TextureParamJson>();
  for (const t of a.textures ?? []) { mergedTextures.set(paramKey(t), t); }
  for (const t of b.textures ?? []) {
    const k = paramKey(t);
    if (!mergedTextures.has(k)) mergedTextures.set(k, t);
  }
  return {
    ...a,
    shader_label: a.shader_label || b.shader_label,
    blend_states: mergeByParamId(a.blend_states, b.blend_states),
    floats: mergeByParamId(a.floats, b.floats),
    float1s: mergeByParamId(a.float1s, b.float1s),
    booleans: mergeByParamId(a.booleans, b.booleans),
    vectors: mergeByParamId(a.vectors, b.vectors),
    colors: mergeByParamId(a.colors, b.colors),
    rasterizer_states: mergeByParamId(a.rasterizer_states, b.rasterizer_states),
    samplers: mergeByParamId(a.samplers, b.samplers),
    textures: [...mergedTextures.values()],
    textures2: mergeByParamId(a.textures2, b.textures2),
    type4_v16: mergeByParamId(a.type4_v16, b.type4_v16),
    type4_v15: mergeByParamId(a.type4_v15, b.type4_v15),
    uv_transforms: mergeByParamId(a.uv_transforms, b.uv_transforms),
  };
}

function findMeshObject(
  objects: MeshObjectJson[],
  entry: ModlEntryJson,
): MeshObjectJson | undefined {
  return objects.find(
    (o) => o.name === entry.mesh_object_name && o.subindex === entry.mesh_object_subindex,
  );
}

function boneIndicesWithName(bones: BoneJson[], name: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < bones.length; i++) {
    if (bones[i]!.name === name) out.push(i);
  }
  return out;
}

/** True if boneIdx is a strict descendant of ancestorIdx (parent chain walks upward). */
function isDescendantOf(ancestorIdx: number, boneIdx: number, bones: BoneJson[]): boolean {
  let cur = boneIdx;
  for (let guard = 0; guard < bones.length + 2; guard++) {
    const p = bones[cur]?.parent_index;
    if (p === null || p === undefined) return false;
    if (p === ancestorIdx) return true;
    cur = p;
  }
  return false;
}

function ancestorDistance(ancestorIdx: number, boneIdx: number, bones: BoneJson[]): number | null {
  let cur = boneIdx;
  for (let dist = 1; dist <= bones.length + 2; dist++) {
    const p = bones[cur]?.parent_index;
    if (p === null || p === undefined || p < 0 || p >= bones.length) {
      return null;
    }
    if (p === ancestorIdx) {
      return dist;
    }
    cur = p;
  }
  return null;
}

/**
 * Resolves mesh bone influences when multiple skeleton bones share the same name.
 * Uses mesh `parent_bone_name` as attachment: prefer influences in that bone's subtree,
 * then ancestors on the path to the root.
 */
function resolveBoneIndexForMesh(
  skel: SkelDataJson,
  boneName: string,
  meshParentBoneName: string,
): number | undefined {
  const bones = skel.bones;
  const nameCandidates = boneIndicesWithName(bones, boneName);
  if (nameCandidates.length === 0) return undefined;
  if (nameCandidates.length === 1) return nameCandidates[0];

  const meshParent = meshParentBoneName.trim();
  if (!meshParent) {
    return nameCandidates[0];
  }

  const attachCandidates = boneIndicesWithName(bones, meshParent);
  if (attachCandidates.length === 0) {
    return nameCandidates[0];
  }

  // Prefer the nearest candidate that lies under any attach parent candidate.
  const underAttach: { index: number; dist: number }[] = [];
  for (const candidate of nameCandidates) {
    for (const attachIdx of attachCandidates) {
      const dist = ancestorDistance(attachIdx, candidate, bones);
      if (dist !== null) {
        underAttach.push({ index: candidate, dist });
      }
    }
  }
  if (underAttach.length > 0) {
    underAttach.sort((a, b) => a.dist - b.dist || a.index - b.index);
    return underAttach[0]!.index;
  }

  // Otherwise prefer nearest candidate that is an ancestor of any attach parent candidate.
  const ancestorsOfAttach: { index: number; dist: number }[] = [];
  for (const candidate of nameCandidates) {
    for (const attachIdx of attachCandidates) {
      const dist = ancestorDistance(candidate, attachIdx, bones);
      if (dist !== null) {
        ancestorsOfAttach.push({ index: candidate, dist });
      }
    }
  }
  if (ancestorsOfAttach.length > 0) {
    ancestorsOfAttach.sort((a, b) => a.dist - b.dist || a.index - b.index);
    return ancestorsOfAttach[0]!.index;
  }

  return nameCandidates[0];
}

function buildLogicalSkinTable(
  vertexCount: number,
  influences: NonNullable<MeshObjectJson["bone_influences"]>,
  skel: SkelDataJson,
  meshParentBoneName: string,
): { idx: Uint16Array; w: Float32Array } | null {
  const idx = new Uint16Array(vertexCount * 4);
  const w = new Float32Array(vertexCount * 4);
  const lists: { bi: number; wt: number }[][] = Array.from({ length: vertexCount }, () => []);
  for (const inf of influences) {
    const bi = resolveBoneIndexForMesh(skel, inf.bone_name, meshParentBoneName);
    if (bi === undefined) continue;
    for (const vw of inf.vertex_weights) {
      const vi = vw.vertex_index;
      if (vi < 0 || vi >= vertexCount) continue;
      const wt = vw.vertex_weight;
      if (wt > 0 && Number.isFinite(wt)) {
        lists[vi]!.push({ bi, wt });
      }
    }
  }
  let any = false;
  for (let vi = 0; vi < vertexCount; vi++) {
    const arr = lists[vi]!.filter((x) => x.wt > 0).sort((a, b) => b.wt - a.wt).slice(0, 4);
    if (arr.length === 0) continue;
    any = true;
    const sum = arr.reduce((s, x) => s + x.wt, 0);
    const n = sum > 1e-10 ? 1 / sum : 0;
    for (let k = 0; k < 4; k++) {
      if (k < arr.length) {
        idx[vi * 4 + k] = arr[k]!.bi;
        w[vi * 4 + k] = arr[k]!.wt * n;
      } else {
        idx[vi * 4 + k] = 0;
        w[vi * 4 + k] = 0;
      }
    }
  }
  if (!any) return null;
  return { idx, w };
}

function buildGeometryForObject(
  obj: MeshObjectJson,
  skel: SkelDataJson | null | undefined,
): { geometry: BufferGeometry; skin: MeshSkinRuntime | null } {
  const indices = obj.vertex_indices;
  if (indices.length % 3 !== 0) {
    throw new Error(
      `Mesh "${obj.name}" subindex ${obj.subindex}: vertex_indices length must be a multiple of 3`,
    );
  }
  const posAttr = obj.positions[0];
  const positions = vectorDataToVec3(posAttr?.data);
  if (!positions?.length) {
    throw new Error(`Mesh "${obj.name}" subindex ${obj.subindex}: missing Position attribute`);
  }
  const logicalCount = positions.length;
  const nAttr = obj.normals[0];
  const normals = nAttr ? vectorDataToVec3(nAttr.data) : null;
  const uvAttr = obj.texture_coordinates[0];
  const uvs = uvAttr ? vectorDataToVec2(uvAttr.data) : null;
  const uv2Attr = obj.texture_coordinates[1];
  const uvs2 = uv2Attr ? vectorDataToVec2(uv2Attr.data) : null;

  const logicalSkin =
    skel && obj.bone_influences?.length
      ? buildLogicalSkinTable(logicalCount, obj.bone_influences, skel, obj.parent_bone_name)
      : null;

  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const uv2: number[] = [];
  const bindPositions = new Float32Array(indices.length * 3);
  const boneIndices = logicalSkin ? new Uint16Array(indices.length * 4) : new Uint16Array(0);
  const boneWeights = logicalSkin ? new Float32Array(indices.length * 4) : new Float32Array(0);

  for (let i = 0; i < indices.length; i++) {
    const vi = indices[i]!;
    const p = positions[vi];
    if (!p) {
      throw new Error(
        `Mesh "${obj.name}" subindex ${obj.subindex}: vertex index ${vi} out of range`,
      );
    }
    pos.push(p[0], p[1], p[2]);
    bindPositions[i * 3] = p[0];
    bindPositions[i * 3 + 1] = p[1];
    bindPositions[i * 3 + 2] = p[2];
    if (logicalSkin) {
      const o = vi * 4;
      for (let k = 0; k < 4; k++) {
        boneIndices[i * 4 + k] = logicalSkin.idx[o + k]!;
        boneWeights[i * 4 + k] = logicalSkin.w[o + k]!;
      }
    }
    if (normals?.[vi]) {
      nrm.push(normals[vi][0], normals[vi][1], normals[vi][2]);
    }
    if (uvs?.[vi]) {
      uv.push(uvs[vi][0], uvs[vi][1]);
    }
    if (uvs2?.[vi]) {
      uv2.push(uvs2[vi][0], uvs2[vi][1]);
    }
  }

  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  if (nrm.length === pos.length) {
    geom.setAttribute("normal", new BufferAttribute(new Float32Array(nrm), 3));
  } else {
    geom.computeVertexNormals();
  }
  if (uv.length === indices.length * 2) {
    const uvArray = new Float32Array(uv);
    geom.setAttribute("uv", new BufferAttribute(uvArray, 2));
    // AO in MeshStandardMaterial reads uv2; duplicate uv when a second channel is absent.
    if (uv2.length === indices.length * 2) {
      geom.setAttribute("uv2", new BufferAttribute(new Float32Array(uv2), 2));
    } else {
      geom.setAttribute("uv2", new BufferAttribute(uvArray.slice(), 2));
    }
  }

  let skin: MeshSkinRuntime | null = null;
  if (logicalSkin && skel) {
    geom.setAttribute("skinIndex", new BufferAttribute(boneIndices, 4));
    geom.setAttribute("skinWeight", new BufferAttribute(boneWeights, 4));
    skin = {
      boneCount: skel.bones.length,
      bindPositions,
      boneIndices,
      boneWeights,
      gpuAttributesReady: true,
    };
  }

  return { geometry: geom, skin };
}

export type BuildDrawListFromBundleOptions = {
  /** Prepended to draw keys as `${prefix}::${mesh}_${sub}` to avoid collisions across instances. */
  drawKeyPrefix?: string;
  /** Short label prefix for mesh list (e.g. numdlb file name). */
  instanceLabel?: string;
};

export function buildDrawListFromBundle(
  modl: ModlDataJson,
  mesh: MeshDataJson,
  skel?: SkelDataJson | null,
  options?: BuildDrawListFromBundleOptions,
): BuiltMeshDraw[] {
  const prefix = options?.drawKeyPrefix?.trim()
    ? `${options.drawKeyPrefix.trim()}::`
    : "";
  const labelPrefix = options?.instanceLabel?.trim() ? `${options.instanceLabel.trim()} — ` : "";
  const instanceId = options?.drawKeyPrefix?.trim() || undefined;
  const objects = mesh.objects;
  const out: BuiltMeshDraw[] = [];
  for (const entry of modl.entries) {
    const obj = findMeshObject(objects, entry);
    if (!obj) {
      throw new Error(
        `Modl entry references missing mesh object "${entry.mesh_object_name}" subindex ${entry.mesh_object_subindex}`,
      );
    }
    const key = `${prefix}${entry.mesh_object_name}_${entry.mesh_object_subindex}`;
    const label = `${labelPrefix}${entry.mesh_object_name} [${entry.mesh_object_subindex}]`;
    const { geometry, skin } = buildGeometryForObject(obj, skel ?? null);
    out.push({
      key,
      label,
      geometry,
      materialLabel: entry.material_label,
      meshObjectName: entry.mesh_object_name,
      meshObjectSubindex: entry.mesh_object_subindex,
      skin,
      previewInstanceId: instanceId,
    });
  }
  return out;
}

export function buildMatlLookup(matl: MatlDataJson | null | undefined): Map<string, MatlEntryJson> {
  const map = new Map<string, MatlEntryJson>();
  if (!matl?.entries) return map;
  for (const e of matl.entries) {
    const prev = map.get(e.material_label);
    if (!prev) {
      map.set(e.material_label, e);
    } else {
      map.set(e.material_label, mergeMatlEntries(prev, e));
    }
  }
  return map;
}

