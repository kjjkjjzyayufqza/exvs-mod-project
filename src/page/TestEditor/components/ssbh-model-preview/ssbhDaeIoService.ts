import { invoke } from "@tauri-apps/api/core";
import { ensureMatlDataSerdeFields, type DaeSsbhConvertExtendedResult, type NumdlbMappingRow } from "./daeSsbhTypes";
import type { MatlDataJson } from "./types";

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
  texturesExported: number;
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
  /** Same resolver as preview: prefer `.numdlb` path; a folder is ambiguous when multiple `.numdlb` exist. */
  rootPath: string;
  outputDaePath: string;
  scaleFactor: number;
  upAxis: SsbhDaeUpAxis;
  includeMeshObjects?: MeshObjectRef[] | null;
  /** When true, resolves diffuse nutexb from numatb to PNG next to the DAE and binds materials in the file. */
  exportNumatbTextures: boolean;
}): Promise<{ daePath: string; stats: SsbhDaeExportStats }> {
  return invoke<{ daePath: string; stats: SsbhDaeExportStats }>("ssbh_export_folder_to_dae", {
    rootPath: params.rootPath,
    outputDaePath: params.outputDaePath,
    scaleFactor: params.scaleFactor,
    upAxis: params.upAxis,
    includeMeshObjects: params.includeMeshObjects ?? null,
    exportNumatbTextures: params.exportNumatbTextures,
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
  mayaFile: MatlDataJson | null;
  nustFile: MatlDataJson | null;
};

export async function ssbhConvertDaeToSsbh(
  params: { daePath: string } & SsbhConvertToSsbhParams,
): Promise<DaeSsbhConvertExtendedResult> {
  const mayaFile = params.mayaFile ? ensureMatlDataSerdeFields(params.mayaFile) : null;
  const nustFile = params.nustFile ? ensureMatlDataSerdeFields(params.nustFile) : null;
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
    mayaFile,
    nustFile,
  });
}

export async function ssbhConvertFbxToSsbh(
  params: { fbxPath: string } & SsbhConvertToSsbhParams,
): Promise<DaeSsbhConvertExtendedResult> {
  const mayaFile = params.mayaFile ? ensureMatlDataSerdeFields(params.mayaFile) : null;
  const nustFile = params.nustFile ? ensureMatlDataSerdeFields(params.nustFile) : null;
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
    mayaFile,
    nustFile,
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
  await invoke("ssbh_write_numdlb_mapping", { payload });
}

export type NuhlpbReadResult = {
  majorVersion: number;
  minorVersion: number;
  aimConstraints: Record<string, unknown>[];
  orientConstraints: Record<string, unknown>[];
};

export type NuhlpbWritePayload = {
  filePath: string;
  majorVersion: number;
  minorVersion: number;
  aimConstraints: Record<string, unknown>[];
  orientConstraints: Record<string, unknown>[];
};

export async function ssbhReadNuhlpb(filePath: string): Promise<NuhlpbReadResult> {
  return invoke("ssbh_read_nuhlpb", { filePath });
}

export async function ssbhWriteNuhlpb(payload: NuhlpbWritePayload): Promise<void> {
  await invoke("ssbh_write_nuhlpb", { payload });
}

export async function ssbhTemplateReadNumatb(filePath: string): Promise<MatlDataJson> {
  return invoke("ssbh_template_read_numatb", { filePath });
}

export async function ssbhTemplateWriteNumatb(filePath: string, matl: MatlDataJson): Promise<void> {
  await invoke("ssbh_template_write_numatb", { filePath, matlJson: matl });
}

/** Same payload shape as the `ssbh_load_ssbh_file_as_json` Tauri command (Matl / mesh / modl / skel). */
export type SsbhSsbhFileAsJsonEnvelope = {
  filePath: string;
  format: string;
  data: unknown;
};

export async function ssbhLoadSsbhFileAsJson(filePath: string): Promise<SsbhSsbhFileAsJsonEnvelope> {
  return invoke<SsbhSsbhFileAsJsonEnvelope>("ssbh_load_ssbh_file_as_json", { path: filePath });
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
