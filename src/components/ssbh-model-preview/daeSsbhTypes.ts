import type { SsbhDaeAnalysisReport, SsbhDaeConvertStats, SsbhDaeUpAxis } from "./ssbhDaeIoService";
import type { MatlDataJson, MatlEntryJson } from "./types";

export type { MatlDataJson, MatlEntryJson } from "./types";

export type DaeImportKind = "dae" | "fbx";
export type NumatbProfileKind = "maya" | "nust";

export type NumatbVector4Value = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export type NumatbColor4Value = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type NumatbBlendStateValue = {
  source_color: string;
  color_operation: string;
  destination_color: string;
  source_alpha: string;
  alpha_operation: string;
  destination_alpha: string;
  /** Rust MatlData uses bool; 0/1 may appear in legacy JSON until `ensureMatlEntrySerdeFields` runs. */
  alpha_sample_to_coverage: boolean | number;
  unk8?: number;
  unk9?: number;
  unk10?: number;
};

export type NumatbRasterizerStateValue = {
  fill_mode: string;
  cull_mode: string;
  depth_bias: number;
  unk4?: number;
  unk5?: number;
  unk6?: number;
};

export type NumatbUvTransformValue = {
  scale_u: number;
  scale_v: number;
  rotation: number;
  translate_u: number;
  translate_v: number;
};

export type NumatbSamplerValue = {
  wraps: string;
  wrapt: string;
  wrapr: string;
  min_filter: string;
  mag_filter: string;
  texture_filtering_type?: string;
  border_color: NumatbColor4Value;
  unk11?: number;
  unk12?: number;
  lod_bias: number;
  max_anisotropy: string;
};

export type NumatbAttributeData = {
  Boolean?: number;
  Float?: number;
  Float1?: number;
  String?: string;
  String1?: string;
  Vector4?: NumatbVector4Value;
  Unk7?: NumatbColor4Value;
  Sampler?: NumatbSamplerValue;
  BlendState?: NumatbBlendStateValue;
  RasterizerState?: NumatbRasterizerStateValue;
  UvTransform?: NumatbUvTransformValue;
  Type4?: number[];
};

export type NumatbAttributeDataKind =
  | "Boolean"
  | "Float"
  | "Float1"
  | "String"
  | "String1"
  | "Vector4"
  | "Unk7"
  | "Sampler"
  | "BlendState"
  | "RasterizerState"
  | "UvTransform"
  | "Type4";

export type NumatbAttribute = {
  param_id: string;
  param: {
    data: NumatbAttributeData;
  };
};

/** Legacy flat list shape (ssbh_lib JSON). Migrated to MatlDataJson at load time. */
export type NumatbMaterialEntry = {
  material_label: string;
  shader_label: string;
  attributes: NumatbAttribute[];
};

export type NumdlbMappingRow = {
  meshObjectName: string;
  meshObjectSubindex: number;
  materialLabel: string;
};

export type NumatbTemplateDefinition = {
  id: string;
  name: string;
  description: string;
  sourceFileName: string | null;
  updatedAt: string;
  mayaFile: MatlDataJson;
  nustFile: MatlDataJson;
};

export type NumatbTemplateLibrary = {
  version: number;
  templates: NumatbTemplateDefinition[];
};

export type DaeSsbhConvertResultFiles = {
  numdlbPath?: string;
  numshbPath?: string;
  nusktbPath?: string;
  numatbPath?: string;
  mayaNumatbPath?: string;
  nustNumatbPath?: string;
};

export type DaeSsbhConvertExtendedResult = {
  ok: boolean;
  files: DaeSsbhConvertResultFiles;
  stats: SsbhDaeConvertStats;
  logPath: string | null;
};

export type DaeSsbhSessionState = {
  sessionVersion: number;
  importKind: DaeImportKind;
  sourcePath: string | null;
  /** Tracks which source+geometry set the current material profiles belong to. */
  loadedAnalysisKey: string | null;
  analysis: SsbhDaeAnalysisReport | null;
  includeGeometryNames: string[];
  outputDir: string | null;
  outputBaseName: string;
  scaleFactorText: string;
  upAxis: SsbhDaeUpAxis;
  flipUv: boolean;
  writeLog: boolean;
  writeNumdlb: boolean;
  writeNumshb: boolean;
  writeNusktb: boolean;
  writeNumatb: boolean;
  writeMayaProfile: boolean;
  /** When true, editing a texture path on Maya or Nust updates the same param on the other profile (matched by material label + param id). */
  mirrorTexturePathsAcrossProfiles: boolean;
  numdlbEntries: NumdlbMappingRow[];
  selectedTemplateId: string | null;
  /** Increments whenever the numatb profiles are replaced as a whole. */
  numatbProfileReplacementRevision: number;
  mayaFile: MatlDataJson;
  nustFile: MatlDataJson;
  lastResult: DaeSsbhConvertExtendedResult | null;
};

export function createEmptyNumatbFile(): MatlDataJson {
  return {
    major_version: 1,
    minor_version: 6,
    entries: [],
  };
}

export function cloneNumatbFile(file: MatlDataJson): MatlDataJson {
  return JSON.parse(JSON.stringify(file)) as MatlDataJson;
}

export function getNumatbEntries(file: MatlDataJson): MatlEntryJson[] {
  return file.entries;
}

/** Rust `MatlData` JSON uses `bool`; session/UI may store 0/1 from legacy flat attributes. */
function coerceMatlJsonBool(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }
  throw new Error(`MatlData JSON bool field must be boolean or a finite number (0/1), got ${typeof value}`);
}

/**
 * Rust `MatlEntryData` serde requires several Vec fields to be present (no `default` on blend_states, floats, etc.).
 * Merge partial UI/session JSON into a shape that round-trips to `MatlData::write_to_file`.
 */
export function ensureMatlEntrySerdeFields(entry: MatlEntryJson): MatlEntryJson {
  const blend_states = (entry.blend_states ?? []).map((row) => {
    const data = row.data;
    if (!data || typeof data !== "object") {
      return row;
    }
    const d = data as Record<string, unknown>;
    if (!("alpha_sample_to_coverage" in d)) {
      return row;
    }
    return {
      ...row,
      data: {
        ...d,
        alpha_sample_to_coverage: coerceMatlJsonBool(d.alpha_sample_to_coverage),
      },
    };
  });

  const booleans = (entry.booleans ?? []).map((row) => ({
    ...row,
    data: coerceMatlJsonBool((row as { data: unknown }).data),
  }));

  return {
    material_label: entry.material_label,
    shader_label: entry.shader_label,
    blend_states,
    floats: entry.floats ?? [],
    float1s: entry.float1s ?? [],
    booleans,
    vectors: entry.vectors ?? [],
    colors: entry.colors ?? [],
    rasterizer_states: entry.rasterizer_states ?? [],
    samplers: entry.samplers ?? [],
    textures: entry.textures ?? [],
    textures2: entry.textures2 ?? [],
    type4_v16: entry.type4_v16 ?? [],
    type4_v15: entry.type4_v15 ?? [],
    uv_transforms: entry.uv_transforms ?? [],
  };
}

export function ensureMatlDataSerdeFields(file: MatlDataJson): MatlDataJson {
  return {
    major_version: file.major_version ?? 1,
    minor_version: file.minor_version ?? 6,
    entries: file.entries.map(ensureMatlEntrySerdeFields),
  };
}

export function getNumatbAttributeKind(data: NumatbAttributeData): NumatbAttributeDataKind {
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
  throw new Error("Unsupported numatb attribute data shape");
}

export function createEmptyMaterialEntry(materialLabel: string, profile: NumatbProfileKind): MatlEntryJson {
  return ensureMatlEntrySerdeFields({
    material_label: materialLabel,
    shader_label: profile === "nust" ? "vsngCharaBasic" : "",
    textures: [],
  });
}

export function uniqueMaterialLabels(rows: NumdlbMappingRow[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const row of rows) {
    const label = row.materialLabel.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}
