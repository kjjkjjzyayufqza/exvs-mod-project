import { invoke } from "@tauri-apps/api/core";
import type {
  DaeSsbhConvertExtendedResult,
  NumatbFileJson,
  NumdlbMappingRow,
} from "./daeSsbhTypes";

export type SsbhDaeUpAxis = "y_up" | "z_up" | "none";

export type SsbhDaeConvertFiles = {
  numdlbPath?: string;
  numshbPath?: string;
  numatbPath?: string;
  nusktbPath?: string;
  mayaNumatbPath?: string;
  nustNumatbPath?: string;
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
  writeNumatb: boolean;
  writeMayaProfile: boolean;
  numdlbEntries: NumdlbMappingRow[];
  mayaFile: NumatbFileJson | null;
  nustFile: NumatbFileJson | null;
};

export async function ssbhConvertDaeToSsbh(
  params: { daePath: string } & SsbhConvertToSsbhParams,
): Promise<DaeSsbhConvertExtendedResult> {
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
    writeNumatb: params.writeNumatb,
    writeMayaProfile: params.writeMayaProfile,
    numdlbEntries: params.numdlbEntries,
    mayaFile: params.mayaFile,
    nustFile: params.nustFile,
  });
}

export async function ssbhConvertFbxToSsbh(
  params: { fbxPath: string } & SsbhConvertToSsbhParams,
): Promise<DaeSsbhConvertExtendedResult> {
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
    writeNumatb: params.writeNumatb,
    writeMayaProfile: params.writeMayaProfile,
    numdlbEntries: params.numdlbEntries,
    mayaFile: params.mayaFile,
    nustFile: params.nustFile,
  });
}

export type NumdlbReadResult = {
  modelName: string;
  skeletonFileName: string;
  materialFileNames: string[];
  meshFileName: string;
  animationFileName: string | null;
  entries: NumdlbMappingRow[];
};

export type NumdlbWritePayload = {
  filePath: string;
  modelName: string;
  skeletonFileName: string;
  materialFileNames: string[];
  meshFileName: string;
  animationFileName: string | null;
  entries: NumdlbMappingRow[];
};

export async function ssbhReadNumdlbMapping(filePath: string): Promise<NumdlbReadResult> {
  return invoke("ssbh_read_numdlb_mapping", { filePath });
}

export async function ssbhWriteNumdlbMapping(payload: NumdlbWritePayload): Promise<void> {
  await invoke("ssbh_write_numdlb_mapping", payload);
}

export async function ssbhTemplateReadNumatb(filePath: string): Promise<NumatbFileJson> {
  return invoke("ssbh_template_read_numatb", { filePath });
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
