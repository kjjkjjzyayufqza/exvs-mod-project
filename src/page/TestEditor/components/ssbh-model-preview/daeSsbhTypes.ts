import type { SsbhDaeAnalysisReport, SsbhDaeConvertStats, SsbhDaeUpAxis } from "./ssbhDaeIoService";

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
  alpha_sample_to_coverage: number;
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

export type NumatbMaterialEntry = {
  material_label: string;
  shader_label: string;
  attributes: NumatbAttribute[];
};

export type NumatbFileJson = {
  Matl: {
    V16: {
      entries: NumatbMaterialEntry[];
    };
  };
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
  mayaFile: NumatbFileJson;
  nustFile: NumatbFileJson;
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
  writeNustProfile: boolean;
  baseNumatbSource: NumatbProfileKind;
  numdlbEntries: NumdlbMappingRow[];
  selectedTemplateId: string | null;
  mayaFile: NumatbFileJson;
  nustFile: NumatbFileJson;
  lastResult: DaeSsbhConvertExtendedResult | null;
};

export function createEmptyNumatbFile(): NumatbFileJson {
  return {
    Matl: {
      V16: {
        entries: [],
      },
    },
  };
}

export function cloneNumatbFile(file: NumatbFileJson): NumatbFileJson {
  return JSON.parse(JSON.stringify(file)) as NumatbFileJson;
}

export function getNumatbEntries(file: NumatbFileJson): NumatbMaterialEntry[] {
  return file.Matl.V16.entries;
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

export function createEmptyMaterialEntry(materialLabel: string, profile: NumatbProfileKind): NumatbMaterialEntry {
  return {
    material_label: materialLabel,
    shader_label: profile === "nust" ? "vsngCharaBasic" : "",
    attributes: [],
  };
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
