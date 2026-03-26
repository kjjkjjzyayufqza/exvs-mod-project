import { invoke } from "@tauri-apps/api/core";

export type SsbhDaeUpAxis = "y_up" | "z_up" | "none";

export type SsbhDaeConvertFiles = {
  numdlbPath?: string;
  numshbPath?: string;
  nusktbPath?: string;
};

export type SsbhDaeConvertStats = {
  meshObjects: number;
  totalVertices: number;
  totalTriangleIndices: number;
  bones: number;
};

export type SsbhDaeExportStats = {
  objectsExported: number;
  trianglesExported: number;
};

export type SsbhDaeMeshAnalysisRow = {
  name: string;
  vertexCount: number;
  indexCount: number;
  triangleCount: number;
  normalCount: number;
  uvCount: number;
  normalsMatchVertices: boolean;
  uvsMatchVertices: boolean;
  boneInfluenceGroups: number;
  maxInfluencesPerVertex: number;
  exceedsFourInfluences: boolean;
};

export type SsbhDaeAnalysisReport = {
  daePath: string;
  upAxis: string;
  meshRows: SsbhDaeMeshAnalysisRow[];
  boneCount: number;
  boneNames: string[];
  geometryNames: string[];
  blockingErrors: string[];
  warnings: string[];
  canConvert: boolean;
};

export type MeshObjectRef = { name: string; subindex: number };

export async function ssbhAnalyzeDae(daePath: string): Promise<SsbhDaeAnalysisReport> {
  return invoke<SsbhDaeAnalysisReport>("ssbh_analyze_dae", { daePath });
}

export async function ssbhAnalyzeFbx(fbxPath: string): Promise<SsbhDaeAnalysisReport> {
  return invoke<SsbhDaeAnalysisReport>("ssbh_analyze_fbx", { fbxPath });
}

export async function ssbhExportFolderToDae(params: {
  rootPath: string;
  outputDaePath: string;
  scaleFactor: number;
  upAxis: SsbhDaeUpAxis;
  includeMeshObjects?: MeshObjectRef[] | null;
}): Promise<{ daePath: string; stats: SsbhDaeExportStats }> {
  return invoke<{ daePath: string; stats: SsbhDaeExportStats }>("ssbh_export_folder_to_dae", {
    rootPath: params.rootPath,
    outputDaePath: params.outputDaePath,
    scaleFactor: params.scaleFactor,
    upAxis: params.upAxis,
    includeMeshObjects: params.includeMeshObjects ?? null,
  });
}

export type SsbhConvertToSsbhParams = {
  outputDir: string;
  baseFilename: string;
  scaleFactor: number;
  flipUv: boolean;
  upAxis: SsbhDaeUpAxis;
  includeGeometryNames: string[];
  writeLog: boolean;
  writeNumdlb: boolean;
  writeNumshb: boolean;
  writeNusktb: boolean;
};

export type SsbhConvertToSsbhResult = {
  ok: boolean;
  files: SsbhDaeConvertFiles;
  stats: SsbhDaeConvertStats;
  logPath: string | null;
};

export async function ssbhConvertDaeToSsbh(
  params: { daePath: string } & SsbhConvertToSsbhParams,
): Promise<SsbhConvertToSsbhResult> {
  return invoke("ssbh_convert_dae_to_ssbh", {
    daePath: params.daePath,
    outputDir: params.outputDir,
    baseFilename: params.baseFilename,
    scaleFactor: params.scaleFactor,
    flipUv: params.flipUv,
    upAxis: params.upAxis,
    includeGeometryNames: params.includeGeometryNames,
    writeLog: params.writeLog,
    writeNumdlb: params.writeNumdlb,
    writeNumshb: params.writeNumshb,
    writeNusktb: params.writeNusktb,
  });
}

export async function ssbhConvertFbxToSsbh(
  params: { fbxPath: string } & SsbhConvertToSsbhParams,
): Promise<SsbhConvertToSsbhResult> {
  return invoke("ssbh_convert_fbx_to_ssbh", {
    fbxPath: params.fbxPath,
    outputDir: params.outputDir,
    baseFilename: params.baseFilename,
    scaleFactor: params.scaleFactor,
    flipUv: params.flipUv,
    upAxis: params.upAxis,
    includeGeometryNames: params.includeGeometryNames,
    writeLog: params.writeLog,
    writeNumdlb: params.writeNumdlb,
    writeNumshb: params.writeNumshb,
    writeNusktb: params.writeNusktb,
  });
}

const PRESET_STORAGE_KEY = "ssbh-dae-exchange-presets-v1";

export type SsbhDaeExchangePreset = {
  name: string;
  exportScale: string;
  exportUp: SsbhDaeUpAxis;
  importScale: string;
  importUp: SsbhDaeUpAxis;
  importFlipV: boolean;
  writeLog: boolean;
};

export function loadDaeExchangePresets(): SsbhDaeExchangePreset[] {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is SsbhDaeExchangePreset =>
        x !== null &&
        typeof x === "object" &&
        typeof (x as SsbhDaeExchangePreset).name === "string",
    );
  } catch {
    return [];
  }
}

export function saveDaeExchangePresets(presets: SsbhDaeExchangePreset[]): void {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}
